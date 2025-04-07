import {
    Player,
    system,
    world,
    BlockInventoryComponent,
    ItemStack,
    Vector3,
    Container,
    Dimension,
} from "@minecraft/server";
import { Handler } from "../../../module/Handler";

// --- Helper Functions ---

const sendMessage = (event: any, msg: string) => {
    const consoleOutput = (m: string) => console.warn(`[ChestFill] ${m}`);
    if (event.sourceEntity instanceof Player) {
        const player = event.sourceEntity;
        system.run(() => player.sendMessage(msg));
    } else {
        consoleOutput(msg);
    }
};

const consoleOutput = (msg: string) => console.warn(`[ChestFill] ${msg}`);

function getChestContainer(
    dimension: Dimension,
    pos: Vector3
): Container | null {
    try {
        const block = dimension.getBlock(pos);
        if (!block) {
            // consoleOutput(`Block not found at ${pos.x}, ${pos.y}, ${pos.z}`); // Reduced console spam
            return null;
        }
        // Check if the block type actually has an inventory component
        const containerBlocks = ['minecraft:chest', 'minecraft:barrel', 'minecraft:dispenser', 'minecraft:dropper', 'minecraft:hopper'];
        if (!containerBlocks.includes(block.typeId)) {
            // consoleOutput(`Block at ${pos.x}, ${pos.y}, ${pos.z} (${block.typeId}) likely doesn't have an inventory.`);
            return null;
        }
        const inventoryComponent = block.getComponent("inventory") as BlockInventoryComponent;
        if (!inventoryComponent) {
            // consoleOutput(
            //     `Block at ${pos.x}, ${pos.y}, ${pos.z} does not have an inventory component.`
            // );
            return null;
        }
        return inventoryComponent.container ?? null;
    } catch (error) {
        consoleOutput(`Error getting container at ${pos.x}, ${pos.y}, ${pos.z}: ${error}`);
        return null;
    }
}


// Parses probability like [v=30] from nameTag
function parseProbabilityFromName(nameTag: string | undefined): number {
    if (!nameTag) return 100;
    const match = nameTag.match(/\[v=(\d+)\]/);
    if (match && match[1]) {
        const probability = parseInt(match[1], 10);
        return isNaN(probability) ? 100 : Math.max(0, Math.min(100, probability));
    }
    return 100;
}

// Parses count range like [c=10:20] from nameTag
interface CountRange {
    min: number;
    max: number;
}
function parseCountRangeFromName(nameTag: string | undefined): CountRange | null {
    if (!nameTag) return null;
    const match = nameTag.match(/\[c=(\d+):(\d+)\]/);
    if (match && match[1] && match[2]) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        // Ensure min and max are valid numbers and min <= max
        if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0 && min <= max) {
            return { min: min, max: max };
        } else {
            consoleOutput(`Invalid count range format or values in nameTag: "${nameTag}". Expected [c=MIN:MAX] with 0 < MIN <= MAX.`);
        }
    }
    return null;
}

// Removes directives like [v=X] and [c=X:Y] from the nameTag
function removeDirectivesFromName(nameTag: string | undefined): string | undefined {
    if (!nameTag) return undefined;
    // Remove all occurrences of [v=...] and [c=...] and trim whitespace
    const cleanedName = nameTag.replace(/\[(?:v|c)=[^\]]+\]/g, "").trim();
    // Return undefined if the name becomes empty after removal
    return cleanedName.length > 0 ? cleanedName : undefined;
}

// --- Command Registration ---

export function registerChestFillCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("chestFill", {
        moduleName: moduleName,
        description:
            "Copies items from a source chest to random slots in a target chest based on probability [v=X] and count [c=MIN:MAX] specified in item names.",
        usage: "chestFill run <sourceX> <sourceY> <sourceZ> <targetX> <targetY> <targetZ> [loopCount]",
        execute: (message, event) => {
            const args = message.match(
                /^run\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+))?$/
            );

            if (!args) {
                sendMessage(
                    event,
                    "Invalid command format. Usage: chestFill run <sourceX> <sourceY> <sourceZ> <targetX> <targetY> <targetZ> [loopCount]"
                );
                return;
            }

            const [, sx, sy, sz, tx, ty, tz, loopStr] = args;

            let sourcePos: Vector3, targetPos: Vector3, loopCount: number;
            try {
                sourcePos = { x: parseInt(sx), y: parseInt(sy), z: parseInt(sz) };
                targetPos = { x: parseInt(tx), y: parseInt(ty), z: parseInt(tz) };
                loopCount = loopStr ? parseInt(loopStr) : 1;

                if (
                    isNaN(sourcePos.x) || isNaN(sourcePos.y) || isNaN(sourcePos.z) ||
                    isNaN(targetPos.x) || isNaN(targetPos.y) || isNaN(targetPos.z) ||
                    isNaN(loopCount) || loopCount < 1
                ) {
                    throw new Error("Coordinates and loop count must be valid numbers (loop count >= 1).");
                }
            } catch (error: any) {
                sendMessage(event, `Error parsing arguments: ${error.message}`);
                return;
            }

            const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");

            // Get containers (robustly)
            const sourceContainer = getChestContainer(dimension, sourcePos);
            if (!sourceContainer) {
                sendMessage(
                    event,
                    `Source container not found or invalid at ${sourcePos.x}, ${sourcePos.y}, ${sourcePos.z}. Ensure it's a block with inventory (like a chest).`
                );
                return;
            }

            const targetContainer = getChestContainer(dimension, targetPos);
            if (!targetContainer) {
                sendMessage(
                    event,
                    `Target container not found or invalid at ${targetPos.x}, ${targetPos.y}, ${targetPos.z}. Ensure it's a block with inventory (like a chest).`
                );
                return;
            }

            // --- Main Logic in system.run ---
            system.run(() => {
                try {
                    let itemsAddedTotal = 0;
                    for (let loop = 0; loop < loopCount; loop++) {
                        // Optional: Clear target chest before filling each loop
                        // targetContainer.clearAll();

                        const itemsToAdd: ItemStack[] = [];

                        // 1. Collect items based on probability and determine random count
                        for (let i = 0; i < sourceContainer.size; i++) {
                            const sourceItem = sourceContainer.getItem(i);
                            if (!sourceItem) continue; // Skip empty slots

                            const probability = parseProbabilityFromName(sourceItem.nameTag);

                            // Check probability
                            if (Math.random() * 100 < probability) {
                                const clonedItem = sourceItem.clone();

                                // Determine item count
                                const countRange = parseCountRangeFromName(sourceItem.nameTag);
                                let finalAmount = 1; // Default amount if no range is specified or item had amount 0 somehow

                                if (countRange) {
                                    // Calculate random amount within the specified range [c=MIN:MAX]
                                    const randomAmount = Math.floor(Math.random() * (countRange.max - countRange.min + 1)) + countRange.min;
                                    // Clamp the amount between 1 and the item's max stack size
                                    finalAmount = Math.max(1, Math.min(randomAmount, clonedItem.maxAmount));
                                } else {
                                    // No count range specified, use the original item's amount, clamped
                                    finalAmount = Math.max(1, Math.min(sourceItem.amount, clonedItem.maxAmount));
                                }
                                clonedItem.amount = finalAmount;

                                // Remove directives from the cloned item's name
                                clonedItem.nameTag = removeDirectivesFromName(sourceItem.nameTag); // Use original nameTag for removal

                                itemsToAdd.push(clonedItem);
                            }
                        }

                        // 2. Add collected items to random empty slots in the target chest
                        const availableSlots: number[] = [];
                        for (let i = 0; i < targetContainer.size; i++) {
                            if (!targetContainer.getItem(i)) {
                                availableSlots.push(i);
                            }
                        }

                        // Fisher-Yates shuffle for random slot assignment
                        for (let i = availableSlots.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
                        }

                        let itemsAddedThisLoop = 0;
                        for (const item of itemsToAdd) {
                            if (availableSlots.length > 0) {
                                const slotIndex = availableSlots.pop();
                                if (slotIndex !== undefined) {
                                    targetContainer.setItem(slotIndex, item);
                                    itemsAddedThisLoop++;
                                }
                            } else {
                                // Optional: Send message only once per loop if target is full
                                if (itemsAddedThisLoop === 0 && loop === 0) { // Only show on first failed attempt if the chest was full from the start of this item addition phase.
                                    consoleOutput(
                                        `Target container at (${targetPos.x}, ${targetPos.y}, ${targetPos.z}) has no empty slots left for this loop (${loop + 1}).`
                                    );
                                }
                                break; // Stop trying to add items for this loop
                            }
                        }
                        itemsAddedTotal += itemsAddedThisLoop;

                    } // end loop

                    sendMessage(
                        event,
                        `Added a total of ${itemsAddedTotal} item stacks to target container (${targetPos.x}, ${targetPos.y}, ${targetPos.z}) over ${loopCount} loop(s).`
                    );

                } catch (error: any) {
                    consoleOutput(`Error during item filling process: ${error.message}\n${error.stack}`);
                    sendMessage(event, `An error occurred during the item filling process: ${error.message}`);
                }
            }); // end system.run
        },
    });
}