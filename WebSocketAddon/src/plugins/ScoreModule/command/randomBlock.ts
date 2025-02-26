import { Player, system, world, Vector3 } from "@minecraft/server";
import { Handler } from "../../../module/Handler";

interface BlockData {
    id: string;
    weight: number;
}

interface RandomBlockData {
    locations: string[];
    replaceBlock?: string[];
    blocks: BlockData[];
}

export function registerRandomBlockCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('randomBlock', {
        moduleName: moduleName,
        description: '指定された座標のブロック、または指定された種類のブロックを、指定されたブロックでランダムに置き換えます。',
        usage: 'randomBlock <JSON>\n  <JSON>: {"locations":["0 64 0", "1 64 0", ...],"blocks":[{"id":"minecraft:dirt","weight":1},{"id":"minecraft:stone","weight":2},...]} or {"locations": [...], "replaceBlock": ["minecraft:dirt", "minecraft:stone"], "blocks":[{"id":"minecraft:diamond_block","weight":1},{"id":"minecraft:gold_block","weight":2},...]}',
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
                    sendMessage('JSONオブジェクトが見つかりませんでした。');
                    return;
                }

                const randomBlockDataStr = matchResult[0];
                const randomBlockData: RandomBlockData = JSON.parse(randomBlockDataStr);

                if (!randomBlockData.blocks) {
                    sendMessage('JSONは "blocks" 配列を含む必要があります。');
                    return;
                }

                if (!Array.isArray(randomBlockData.blocks)) {
                    sendMessage('"blocks" は配列である必要があります。');
                    return;
                }


                if (!randomBlockData.locations) {
                    sendMessage('JSONは "locations" を含む必要があります。');
                    return;
                }

                if (!Array.isArray(randomBlockData.locations)) {
                    sendMessage('"locations"は配列である必要があります。');
                    return;
                }
                if (randomBlockData.locations.length === 0) {
                    sendMessage('"locations" は空にできません。');
                    return;
                }


                if (randomBlockData.replaceBlock && !Array.isArray(randomBlockData.replaceBlock)) {
                    sendMessage('"replaceBlock"は配列である必要があります。');
                    return;
                }


                const dimension = event.sourceEntity?.dimension ?? world.getDimension('overworld');

                let totalWeight = 0;
                for (const blockData of randomBlockData.blocks) {
                    totalWeight += blockData.weight;
                }

                const getRandomBlock = () => {
                    let random = Math.random() * totalWeight;
                    for (const blockData of randomBlockData.blocks) {
                        random -= blockData.weight;
                        if (random <= 0) {
                            return blockData.id;
                        }
                    }
                    return randomBlockData.blocks[0].id; //到達したら お　わ　り
                };


                for (const locStr of randomBlockData.locations) {
                    const coords = locStr.split(" ").map(Number);
                    if (coords.length !== 3 || coords.some(isNaN)) {
                        sendMessage(`無効な座標形式です: ${locStr}`);
                        continue;
                    }

                    const blockLoc: Vector3 = { x: coords[0], y: coords[1], z: coords[2] };

                    system.run(() => {
                        try {
                            const randomBlockId = getRandomBlock();
                            const block = dimension.getBlock(blockLoc);

                            if (block) {
                                if (randomBlockData.replaceBlock) {
                                    if (randomBlockData.replaceBlock.includes(block.typeId)) {
                                        block.setType(randomBlockId);
                                    }
                                    else {
                                        consoleOutput(`座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} のブロックは replaceBlock リストに含まれていません。`);
                                    }
                                }
                                else {
                                    block.setType(randomBlockId);
                                }

                            } else {
                                consoleOutput(`座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} にブロックが見つかりません。`);
                            }
                        } catch (error) {
                            consoleOutput(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error}`);
                            sendMessage(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error}`);
                        }
                    });
                }


            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }
        },
    });
}