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
} from "@minecraft/server";
import { Handler } from "../../../module/Handler";

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
    //start end をオプションに指定が無い場合は、実行者の位置にするように修正
    start?: { x: number; y: number; z: number };
    end?: { x: number; y: number; z: number };
    items: ItemDropData[];
    dropCount?: number;
}

export function registerRandomDropCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("randomDrop", {
        moduleName: moduleName,
        description:
            "指定された範囲内、または実行者の位置に、指定されたアイテムをランダムにドロップします。",
        usage:
            'randomDrop <JSON>\n  <JSON>: {"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":70,"z":10},"items":[{"id":"minecraft:diamond","weight":1,"amount":2,"name":"§bSpecial Diamond","lore":["§7Shiny!"]}],"dropCount": 5}  または  {"items":[{"id":"minecraft:diamond","weight":1}],"dropCount":1}',
        execute: (_message, event) => {
            const consoleOutput = (msg: string) => console.warn(msg);

            const sendMessage = (msg: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(msg));
                } else {
                    consoleOutput(msg);
                }
            };

            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) {
                    sendMessage("JSONオブジェクトが見つかりませんでした。");
                    return;
                }

                const randomDropDataStr = matchResult[0];
                const randomDropData: RandomDropData = JSON.parse(randomDropDataStr);

                if (!randomDropData.items || !Array.isArray(randomDropData.items) || randomDropData.items.length === 0) {
                    sendMessage('"items" は配列で、空にできません。');
                    return;
                }


                const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");
                const dropCount = randomDropData.dropCount ?? 1;
                const sourceLocation = getSourceLocation(event.sourceEntity, event.sourceBlock);
                if (sourceLocation.x == 0, sourceLocation.y == 0, sourceLocation.z == 0) {
                    console.warn("[DropCommand]座標が取得できませんでした。");
                    return;
                }

                let totalWeight = 0;
                for (const itemData of randomDropData.items) {
                    totalWeight += itemData.weight;
                }

                const getRandomItem = (): ItemDropData | null => {
                    let random = Math.random() * totalWeight;
                    for (const itemData of randomDropData.items) {
                        random -= itemData.weight;
                        if (random <= 0) {
                            return itemData;
                        }
                    }
                    return null;
                };

                const getRandomLocation = (): Vector3 => {
                    if (!randomDropData.start || !randomDropData.end) {
                        return sourceLocation;
                    }

                    const minX = Math.min(randomDropData.start.x, randomDropData.end.x);
                    const maxX = Math.max(randomDropData.start.x, randomDropData.end.x);
                    const minY = Math.min(randomDropData.start.y, randomDropData.end.y);
                    const maxY = Math.max(randomDropData.start.y, randomDropData.end.y);
                    const minZ = Math.min(randomDropData.start.z, randomDropData.end.z);
                    const maxZ = Math.max(randomDropData.start.z, randomDropData.end.z);

                    return {
                        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
                        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
                        z: Math.floor(Math.random() * (maxZ - minZ + 1)) + minZ,
                    };

                };


                for (let i = 0; i < dropCount; i++) {
                    const randomItemData = getRandomItem();
                    if (!randomItemData) {
                        continue;
                    }
                    const randomLocation = getRandomLocation();

                    system.run(() => {
                        try {
                            const itemStack = new ItemStack(
                                randomItemData.id,
                                randomItemData.amount ?? 1,
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
                                const enchantable = itemStack.getComponent("enchantable");
                                if (enchantable) {
                                    for (const enchantData of randomItemData.enchantments) {
                                        try {
                                            const enchantmentType = EnchantmentTypes.get(enchantData.type);
                                            if (!enchantmentType) {
                                                throw new Error(`Invalid enchantment type: ${enchantData.type}`);
                                            }
                                            enchantable.addEnchantment({
                                                type: enchantmentType,
                                                level: enchantData.level ?? 1,
                                            });
                                        } catch (enchError) {
                                            consoleOutput(`エンチャント追加エラー: ${enchError}`);
                                        }
                                    }
                                }
                            }
                            dimension.spawnItem(itemStack, randomLocation);


                        } catch (itemError) {
                            consoleOutput(`アイテムドロップエラー: ${itemError}`);
                            sendMessage(`アイテムドロップエラー: ${itemError}`);
                        }
                    });
                }
            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(
                    `JSON解析エラー、または処理中にエラーが発生しました: ${error}`,
                );
            }
        },
    });


    function getSourceLocation(entity: Entity | undefined, Block: Block | undefined): Vector3 {
        if (entity) {
            return entity.location;
        } else {
            if (Block) {
                const spawnPos = Block.location;
                return { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z };
            } else {
                return { x: 0, y: 0, z: 0 };
            }
        }
    }
}