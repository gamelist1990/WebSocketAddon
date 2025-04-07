import { Player, system, Dimension, Vector3 } from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

interface DrillOptions {
    width: number;     // 幅 (例: 3)
    height: number;    // 高さ (例: 3)
    depth: number;     // 奥行き (例: 10)
    maxDistance: number; //最大距離
    drillDelay: number; //掘削の間隔
}

// 掘削処理を行う関数
function runDrillAction(player: Player, drillItem: CustomItem, options: DrillOptions) {
    try {
        const { width, height, depth, maxDistance, drillDelay } = options;

        system.run(() => {
            try {
                const dimension: Dimension = player.dimension;
                const direction = player.getViewDirection();
                const blockHit = player.getBlockFromViewDirection({ maxDistance });

                if (!blockHit || !blockHit.block) {
                    player.sendMessage("§c掘削するブロックが見つかりません。");
                    return;
                }

                if (!drillItem) {
                    console.warn("Drill item is null or undefined.");
                    return;
                }


        
                drillItem.removeItem(player, drillItem.get());
            
                const startBlock = blockHit.block;
                const startX = startBlock.x;
                const startY = startBlock.y;
                const startZ = startBlock.z;

                const length = Math.sqrt(
                    direction.x * direction.x +
                    direction.y * direction.y +
                    direction.z * direction.z
                );
                let dx = length > 0 ? direction.x / length : 0;
                let dy = length > 0 ? direction.y / length : 0;
                let dz = length > 0 ? direction.z / length : 0;

                if (Math.abs(dy) > 0.99) {
                    dx = 0;
                    dz = 0;
                    dy = (dy > 0) ? 1 : -1;
                }

                const playBreakEffects = (location: Vector3) => {
                    dimension.spawnParticle("minecraft:basic_flame_particle", location);
                    const randomPitch = 0.8 + Math.random() * 0.4;
                    player.playSound("dig.stone", { location, volume: 1, pitch: randomPitch });
                };

                let right: Vector3;
                let up: Vector3;

                if (Math.abs(dx) > Math.abs(dz)) {
                    right = { x: 0, y: 0, z: (dx > 0 ? -1 : 1) };
                    up = { x: 0, y: 1, z: 0 };
                } else if (Math.abs(dx) < Math.abs(dz)) {
                    right = { x: (dz > 0 ? 1 : -1), y: 0, z: 0 };
                    up = { x: 0, y: 1, z: 0 };
                } else {
                    right = { x: 1, y: 0, z: 0 };
                    up = { x: 0, y: 0, z: 1 };
                }

                let currentDepth = 0;
                let isError = false;
                const runDrillInterval = system.runInterval(() => {
                    try {
                        if (currentDepth >= depth || isError) {
                            system.clearRun(runDrillInterval);
                            if (!isError) {
                                player.playSound("random.explode", { location: { x: startX, y: startY, z: startZ }, volume: 1, pitch: 1 });
                            }
                            return;
                        }

                        for (let row = 0; row < height; row++) {
                            for (let col = 0; col < width; col++) {
                                const offsetX = col - Math.floor(width / 2);
                                const offsetY = row - Math.floor(height / 2);

                                const blockX = startX + Math.round(currentDepth * dx) + offsetX * right.x + offsetY * up.x;
                                const blockY = startY + Math.round(currentDepth * dy) + offsetX * right.y + offsetY * up.y;
                                const blockZ = startZ + Math.round(currentDepth * dz) + offsetX * right.z + offsetY * up.z;

            
                                const roundedLocation: Vector3 = { x: blockX, y: blockY, z: blockZ };

                                const block = dimension.getBlock(roundedLocation);
                                if (block) {
                                    if (block.typeId === "minecraft:bedrock") {
                                        continue;
                                    }
                                    try {
                                        playBreakEffects(roundedLocation);
                                        system.run(() => {
                                            try {
                                                dimension.runCommand(`fill ${blockX} ${blockY} ${blockZ} ${blockX} ${blockY} ${blockZ} air destroy`);
                                            } catch (e) {
                                                console.warn(`Fill command failed at ${blockX} ${blockY} ${blockZ}: ${e}`);
                                            }
                                        });
                                    } catch (e) {
                                        console.warn(`Block break effect failed: ${e}`);
                                    }
                                }
                            }
                        }
                        currentDepth++;
                    } catch (e) {
                        console.error(`Drill interval error: ${e}`);
                        isError = true;
                    }
                }, drillDelay);
            } catch (e) {
                console.error(`Drill initialization error: ${e}`);
                player.sendMessage("§c掘削の初期化中にエラーが発生しました。");
            }
        });
    } catch (e) {
        console.error(`Fatal drill error: ${e}`);
        player.sendMessage("§c致命的なエラーが発生しました。");
    }
}

const drillItem = new CustomItem({
    name: "§bドリル",
    lore: ["§7指定方向に3x3x5のトンネルを掘る事ができるよ！"],
    item: "minecraft:diamond_pickaxe",
    amount: 1
}).then((player: Player, eventData) => {
    if (eventData.eventType !== EventType.ItemUse) return;
    const drillOptions: DrillOptions = {
        width: 5,
        height: 5,
        depth: 10,
        maxDistance: 10,
        drillDelay: 5
    };

    runDrillAction(player, drillItem, drillOptions);
});

registerCustomItem(15, drillItem);