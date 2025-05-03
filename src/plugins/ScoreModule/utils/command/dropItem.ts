import {
    ItemLockMode,
    Player,
    system,
    world,
    ItemStack,
    Vector3,
    EnchantmentTypes,
    Entity,
    Block,
    BlockInventoryComponent,
    Container,
    Dimension,
} from "@minecraft/server";
import { Handler } from "../../../../module/Handler";

interface ItemDropData {
    id: string;
    amount?: number;
    data?: number;
    name?: string;
    lore?: string[];
    lockMode?: ItemLockMode;
    keepOnDeath?: boolean;
    enchantments?: { type: string; level?: number }[];
    weight: number;
}

interface RandomDropData {
    start?: { x: number; y: number; z: number };
    end?: { x: number; y: number; z: number };
    items: ItemDropData[];
    dropCount?: number;
}

const consoleOutput = (msg: string) => console.warn(`[RandomDrop] ${msg}`);

const sendMessage = (event: any, msg: string) => {
    const sender = event.sender;
    if (sender instanceof Player) {
        system.run(() => sender.sendMessage(msg));
    } else {
        consoleOutput(msg);
    }
};

function getSourceLocation(
    sourceEntity: Entity | undefined,
    sourceBlock: Block | undefined
): Vector3 | null {
    if (sourceEntity) {
        return sourceEntity.location;
    } else if (sourceBlock) {
        const blockLoc = sourceBlock.location;
        return { x: blockLoc.x + 0.5, y: blockLoc.y + 1, z: blockLoc.z + 0.5 };
    }
    return null;
}

function getContainer(
    dimension: Dimension,
    pos: Vector3
): Container | null {
    try {
        const block = dimension.getBlock(pos);
        if (!block) {
            return null;
        }
        const containerTypes = ['minecraft:chest', 'minecraft:barrel', 'minecraft:shulker_box', 'minecraft:dispenser', 'minecraft:dropper', 'minecraft:hopper'];
        if (!containerTypes.includes(block.typeId)) {
            return null;
        }
        if (!block.getComponent("inventory")) {
            return null;
        }
        const inventoryComponent = block.getComponent("inventory") as BlockInventoryComponent;
        if (!inventoryComponent || !inventoryComponent.container) {
            return null;
        }
        return inventoryComponent.container;
    } catch (error) {
        consoleOutput(`Error getting container at ${pos.x}, ${pos.y}, ${pos.z}: ${error}`);
        return null;
    }
}

function parseWeightFromName(nameTag: string | undefined): number {
    if (!nameTag) return 1;
    const match = nameTag.match(/\[w=(\d+)\]/);
    if (match && match[1]) {
        const weight = parseInt(match[1], 10);
        return !isNaN(weight) && weight > 0 ? weight : 1;
    }
    return 1;
}

function removeWeightDirectiveFromName(nameTag: string | undefined): string | undefined {
    if (!nameTag) return undefined;
    const cleanedName = nameTag.replace(/\[w=\d+\]/g, "").trim();
    return cleanedName.length > 0 ? cleanedName : undefined;
}

function getRandomLocationInRange(startPos: Vector3, endPos: Vector3): Vector3 {
    const minX = Math.min(startPos.x, endPos.x);
    const maxX = Math.max(startPos.x, endPos.x);
    const minY = Math.min(startPos.y, endPos.y);
    const maxY = Math.max(startPos.y, endPos.y);
    const minZ = Math.min(startPos.z, endPos.z);
    const maxZ = Math.max(startPos.z, endPos.z);

    const x = (maxX === minX) ? minX : Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    const y = (maxY === minY) ? minY : Math.floor(Math.random() * (maxY - minY + 1)) + minY;
    const z = (maxZ === minZ) ? minZ : Math.floor(Math.random() * (maxZ - minZ + 1)) + minZ;

    return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
}


const usage = `モード1 (JSON): randomDrop <JSON>\n  例: randomDrop {"items":[{"id":"diamond","weight":1}],"dropCount":1,"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":64,"z":10}}\n
            モード2 (座標): randomDrop <chestX> <chestY> <chestZ> <startX> <startY> <startZ> <endX> <endY> <endZ> [dropCount]\n  例: randomDrop 10 64 20 0 64 0 5 64 5 3 (10,64,20のチェストからアイテムを選び、0,64,0から5,64,5の範囲に3回ドロップ)`
export function registerRandomDropCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("randomDrop", {
        moduleName: moduleName,
        description:
            "指定された範囲内、実行者の位置、または指定コンテナからアイテムを取得し指定範囲にランダムドロップします。",
        usage: usage,
        execute: (message, event) => {
            const coordArgs = message.match(
                /^(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+))?$/
            );
            const jsonMatch = message.match(/\{.*\}/);

            const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");

            if (coordArgs) {
                try {
                    const [, sx, sy, sz, startX, startY, startZ, endX, endY, endZ, sDropCount] = coordArgs;

                    const chestPos: Vector3 = { x: parseInt(sx), y: parseInt(sy), z: parseInt(sz) };
                    const startPos: Vector3 = { x: parseInt(startX), y: parseInt(startY), z: parseInt(startZ) };
                    const endPos: Vector3 = { x: parseInt(endX), y: parseInt(endY), z: parseInt(endZ) };
                    const dropCount = sDropCount ? parseInt(sDropCount) : 1;

                    if (
                        isNaN(chestPos.x) || isNaN(chestPos.y) || isNaN(chestPos.z) ||
                        isNaN(startPos.x) || isNaN(startPos.y) || isNaN(startPos.z) ||
                        isNaN(endPos.x) || isNaN(endPos.y) || isNaN(endPos.z) ||
                        isNaN(dropCount) || dropCount < 1
                    ) {
                        throw new Error("無効な座標またはドロップ数が指定されました。");
                    }

                    const container = getContainer(dimension, chestPos);
                    if (!container) {
                        sendMessage(event, `コンテナが見つからないか、インベントリがありません: ${chestPos.x}, ${chestPos.y}, ${chestPos.z}`);
                        return;
                    }

                    const weightedItems: { item: ItemStack; weight: number }[] = [];
                    let totalWeight = 0;

                    for (let i = 0; i < container.size; i++) {
                        const item = container.getItem(i);
                        if (!item) continue;

                        const weight = parseWeightFromName(item.nameTag);
                        weightedItems.push({ item: item, weight: weight });
                        totalWeight += weight;
                    }

                    if (weightedItems.length === 0 || totalWeight <= 0) {
                        sendMessage(event, `コンテナ (${chestPos.x}, ${chestPos.y}, ${chestPos.z}) が空か、有効な重み[w=X]を持つアイテムがありません。`);
                        return;
                    }

                    const getRandomItemFromContainer = (): ItemStack | null => {
                        let random = Math.random() * totalWeight;
                        for (const weightedItem of weightedItems) {
                            random -= weightedItem.weight;
                            if (random <= 0) {
                                return weightedItem.item;
                            }
                        }
                        return weightedItems.length > 0 ? weightedItems[weightedItems.length - 1].item : null;
                    };

                    let droppedCount = 0;
                    for (let i = 0; i < dropCount; i++) {
                        const selectedItem = getRandomItemFromContainer();
                        if (!selectedItem) continue;

                        const itemToDrop = selectedItem.clone();
                        itemToDrop.nameTag = removeWeightDirectiveFromName(selectedItem.nameTag);
                        const randomDropLocation = getRandomLocationInRange(startPos, endPos);

                        system.run(() => {
                            try {
                                dimension.spawnItem(itemToDrop, randomDropLocation);
                            } catch (itemError) {
                                consoleOutput(`アイテムドロップエラー (座標モード): ${itemError}`);
                                if (i === 0) sendMessage(event, `アイテムドロップ中にエラーが発生しました。詳細はコンソールを確認してください。`);
                            }
                        });
                        droppedCount++;
                    }
                    sendMessage(event, `${droppedCount} 個のアイテムを (${chestPos.x}, ${chestPos.y}, ${chestPos.z}) のコンテナから抽選し、指定範囲にドロップしました。`);

                } catch (error: any) {
                    consoleOutput(`座標モード処理エラー: ${error.message}\n${error.stack}`);
                    sendMessage(event, `コマンド処理中にエラーが発生しました: ${error.message}`);
                }

            } else if (jsonMatch) {
                try {
                    const randomDropDataStr = jsonMatch[0];
                    const randomDropData: RandomDropData = JSON.parse(randomDropDataStr);

                    if (!randomDropData.items || !Array.isArray(randomDropData.items) || randomDropData.items.length === 0) {
                        sendMessage(event, '"items" は配列で、空にできません。');
                        return;
                    }

                    for (const itemData of randomDropData.items) {
                        if (!itemData.id || typeof itemData.id !== 'string' || !itemData.weight || typeof itemData.weight !== 'number' || itemData.weight <= 0) {
                            throw new Error('各アイテムには有効な "id" (文字列) と正の "weight" (数値) が必要です。');
                        }
                    }

                    const dropCount = randomDropData.dropCount ?? 1;
                    if (typeof dropCount !== 'number' || dropCount < 1 || !Number.isInteger(dropCount)) {
                        throw new Error('"dropCount" は1以上の整数である必要があります。');
                    }

                    let defaultLocation: Vector3 | null = null;
                    if (!randomDropData.start || !randomDropData.end) {
                        defaultLocation = getSourceLocation(event.sourceEntity, event.sourceBlock);
                        if (!defaultLocation) {
                            consoleOutput("JSONモードで 'start'/'end' が指定されておらず、実行者の位置も特定できませんでした。デフォルト座標(0,64,0)を使用します。");
                            defaultLocation = { x: 0, y: 64, z: 0 };
                        }
                    }

                    let totalWeight = 0;
                    for (const itemData of randomDropData.items) {
                        totalWeight += itemData.weight;
                    }
                    if (totalWeight <= 0) {
                        sendMessage(event, 'アイテムの総重量が0以下です。ドロップできません。');
                        return;
                    }

                    const getRandomItemFromJson = (): ItemDropData | null => {
                        let random = Math.random() * totalWeight;
                        for (const itemData of randomDropData.items) {
                            random -= itemData.weight;
                            if (random <= 0) {
                                return itemData;
                            }
                        }
                        return randomDropData.items.length > 0 ? randomDropData.items[randomDropData.items.length - 1] : null;
                    };

                    const determineDropLocation = (): Vector3 => {
                        if (randomDropData.start && randomDropData.end) {
                            return getRandomLocationInRange(randomDropData.start, randomDropData.end);
                        }
                        return defaultLocation!;
                    };

                    let droppedCount = 0;
                    for (let i = 0; i < dropCount; i++) {
                        const randomItemData = getRandomItemFromJson();
                        if (!randomItemData) continue;

                        const randomLocation = determineDropLocation();

                        system.run(() => {
                            try {
                                const itemId = randomItemData.id.startsWith("minecraft:") ? randomItemData.id : "minecraft:" + randomItemData.id;
                                const itemStack = new ItemStack(
                                    itemId,
                                    randomItemData.amount ?? 1
                                );

                                if (randomItemData.name) {
                                    itemStack.nameTag = randomItemData.name;
                                }
                                if (randomItemData.lore) {
                                    itemStack.setLore(randomItemData.lore);
                                }
                                if (randomItemData.lockMode) {
                                    itemStack.lockMode = randomItemData.lockMode;
                                }
                                if (randomItemData.keepOnDeath) {
                                    itemStack.keepOnDeath = randomItemData.keepOnDeath;
                                }

                                if (randomItemData.enchantments) {
                                    if (itemStack.hasComponent("enchantable")) {
                                        const enchantable = itemStack.getComponent("enchantable");
                                        if (enchantable) {
                                            for (const enchantData of randomItemData.enchantments) {
                                                try {
                                                    const enchantmentType = EnchantmentTypes.get(enchantData.type);
                                                    if (!enchantmentType) {
                                                        throw new Error(`無効なエンチャントタイプ: ${enchantData.type}`);
                                                    }
                                                    enchantable.addEnchantment({
                                                        type: enchantmentType,
                                                        level: enchantData.level ?? 1,
                                                    });
                                                } catch (enchError: any) {
                                                    consoleOutput(`エンチャント追加エラー (${itemId}): ${enchError.message}`);
                                                }
                                            }
                                        }
                                    } else {
                                        consoleOutput(`アイテム ${itemId} はエンチャント不可です。エンチャントメントは無視されました。`);
                                    }
                                }
                                dimension.spawnItem(itemStack, randomLocation);

                            } catch (itemError: any) {
                                consoleOutput(`アイテムドロップエラー (JSONモード): ${itemError.message}\n${itemError.stack}`);
                                if (i === 0) sendMessage(event, `アイテムドロップ中にエラーが発生しました。詳細はコンソールを確認してください。`);
                            }
                        });
                        droppedCount++;
                    }

                } catch (error: any) {
                    consoleOutput(`JSONモード処理エラー: ${error.message}\n${error.stack}`);
                    sendMessage(
                        event,
                        `JSON解析エラー、または処理中にエラーが発生しました: ${error.message}`
                    );
                }

            } else {
                sendMessage(event, `無効なコマンドフォーマット。使用法:\n${usage ?? "Usage not available."}`);
            }
        },
    });
}