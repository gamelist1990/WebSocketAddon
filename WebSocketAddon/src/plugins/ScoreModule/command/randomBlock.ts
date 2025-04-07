import { Player, system, world, Vector3 } from "@minecraft/server";
import { Handler } from "../../../module/Handler";

interface BlockData {
    id: string;
    weight: number;
}

interface RandomBlockData {
    start: string;
    end: string;
    replaceBlock?: string[];
    blocks: BlockData[];
    debug?: boolean;
}

export function registerRandomBlockCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('randomBlock', {
        moduleName: moduleName,
        description: '指定された範囲内のブロックを、指定されたブロックでランダムに置き換えます。',
        usage: 'randomBlock <JSON>\n  <JSON>: {"start":"0 64 0", "end":"10 64 10","blocks":[{"id":"minecraft:dirt","weight":1},{"id":"minecraft:stone","weight":2},...]} or {"start":"...", "end":"...", "replaceBlock": ["minecraft:dirt", "minecraft:stone"], "blocks":[{"id":"minecraft:diamond_block","weight":1},{"id":"minecraft:gold_block","weight":2},...]}',
        execute: (_message, event) => {
            const consoleOutput = (msg: string) => console.warn(msg);

            const sendMessage = (msg: string, toAllPlayers: boolean = false) => {
                if (toAllPlayers) {
                    for (const player of world.getAllPlayers()) {
                        system.run(() => player.sendMessage(msg));
                    }
                } else if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(msg));
                } else {
                    consoleOutput(msg);
                }
            };

            const sendActionBarMessage = (msg: string) => {
                for (const player of world.getAllPlayers()) {
                    system.run(() => player.onScreenDisplay.setActionBar(msg));
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

                const debugMode = randomBlockData.debug ?? false;

                if (!randomBlockData.blocks) {
                    sendMessage('JSONは "blocks" 配列を含む必要があります。');
                    return;
                }

                if (!Array.isArray(randomBlockData.blocks)) {
                    sendMessage('"blocks" は配列である必要があります。');
                    return;
                }

                if (!randomBlockData.start) {
                    sendMessage('JSONは "start" を含む必要があります。');
                    return;
                }
                if (!randomBlockData.end) {
                    sendMessage('JSONは "end" を含む必要があります。');
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

                if (totalWeight <= 0) {
                    sendMessage("Error: Total weight is zero or negative.  Please check the 'weight' values in your 'blocks' array.");
                    return;
                }

                const getRandomBlock = () => {
                    let random = Math.random() * totalWeight;
                    for (const blockData of randomBlockData.blocks) {
                        random -= blockData.weight;
                        if (random <= 0) {
                            return blockData.id;
                        }
                    }
                    sendMessage(`Error in getRandomBlock: No block found for random value ${random}. Total weight: ${totalWeight}`);
                    console.warn(`Error in getRandomBlock: No block found for random value ${random}. Total weight: ${totalWeight}`);
                    return randomBlockData.blocks[0].id; 
                };

                const startCoords = randomBlockData.start.split(" ").map(Number);
                const endCoords = randomBlockData.end.split(" ").map(Number);

                if (startCoords.length !== 3 || startCoords.some(isNaN) || endCoords.length !== 3 || endCoords.some(isNaN)) {
                    sendMessage(`無効な座標形式です: start: ${randomBlockData.start}, end: ${randomBlockData.end}`);
                    return;
                }
                const start = { x: startCoords[0], y: startCoords[1], z: startCoords[2] };
                const end = { x: endCoords[0], y: endCoords[1], z: endCoords[2] };

                const minX = Math.min(start.x, end.x);
                const minY = Math.min(start.y, end.y);
                const minZ = Math.min(start.z, end.z);
                const maxX = Math.max(start.x, end.x);
                const maxY = Math.max(start.y, end.y);
                const maxZ = Math.max(start.z, end.z);

                const replaceBlockSet = randomBlockData.replaceBlock ? new Set(randomBlockData.replaceBlock) : null;

                const maxBlocksPerTick = 600;
                let currentBlockIndex = 0;  

                const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
                let totalBlocks = volume;  
                let processedBlocks = 0; 

                const processBlocks = () => {
                    let blocksProcessedThisTick = 0; 

                    for (let i = currentBlockIndex; i < totalBlocks; i++) {
                        // 3次元座標を1次元インデックスから逆算(Gemini君が書いてくれたyo)
                        const x = minX + Math.floor(i % (maxX - minX + 1));
                        const y = minY + Math.floor((i / (maxX - minX + 1)) % (maxY - minY + 1));
                        const z = minZ + Math.floor(i / ((maxX - minX + 1) * (maxY - minY + 1)));


                        const blockLoc: Vector3 = { x, y, z };

                        try {

                            const block = dimension.getBlock(blockLoc);

                            if (block) {
                                if (!replaceBlockSet || replaceBlockSet.has(block.typeId)) {
                                    const randomBlockId = getRandomBlock();
                                    block.setType(randomBlockId);
                                    processedBlocks++;
                                }

                            }



                        } catch (error: any) {
                            consoleOutput(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error.message ?? error}`);
                            sendMessage(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error.message ?? error}`);
                            return;
                        }


                        blocksProcessedThisTick++;
                        currentBlockIndex++;

                    
                        if (blocksProcessedThisTick >= maxBlocksPerTick) {
                            system.run(processBlocks);
                            if (debugMode) {
                                const progressPercentage = ((processedBlocks / totalBlocks) * 100).toFixed(2);
                                sendActionBarMessage(`Progress: ${progressPercentage}% (${processedBlocks}/${totalBlocks})`);
                            }
                            return; 
                        }

                    }
                    if (debugMode) {
                        sendMessage('ランダムブロック配置が完了しました。', true);
                    }

                };
                system.run(processBlocks);



            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }
        },
    });
}