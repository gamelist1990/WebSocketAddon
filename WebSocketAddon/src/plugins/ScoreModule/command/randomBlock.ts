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
                    return randomBlockData.blocks[0].id; //フォールバック
                };

                const startCoords = randomBlockData.start.split(" ").map(Number);
                const endCoords = randomBlockData.end.split(" ").map(Number);

                if (startCoords.length !== 3 || startCoords.some(isNaN) || endCoords.length !== 3 || endCoords.some(isNaN)) {
                    sendMessage(`無効な座標形式です: start: ${randomBlockData.start}, end: ${randomBlockData.end}`);
                    return;
                }
                const start: Vector3 = { x: startCoords[0], y: startCoords[1], z: startCoords[2] };
                const end: Vector3 = { x: endCoords[0], y: endCoords[1], z: endCoords[2] };

                const minX = Math.min(start.x, end.x);
                const minY = Math.min(start.y, end.y);
                const minZ = Math.min(start.z, end.z);
                const maxX = Math.max(start.x, end.x);
                const maxY = Math.max(start.y, end.y);
                const maxZ = Math.max(start.z, end.z);



                // replaceBlock の最適化 (Set を使用)
                const replaceBlockSet = randomBlockData.replaceBlock ? new Set(randomBlockData.replaceBlock) : null;

                // totalBlocks を計算 (replaceBlock が指定されている場合は、該当するブロックのみをカウント)
                let totalBlocks = 0;
                if (replaceBlockSet) {
                    // replaceBlockSet がある場合、最初に総数を計算
                    const calculateTotalBlocks = () => {
                        let count = 0;
                        for (let x = minX; x <= maxX; x++) {
                            for (let y = minY; y <= maxY; y++) {
                                for (let z = minZ; z <= maxZ; z++) {
                                    const block = dimension.getBlock({ x, y, z });
                                    if (block && replaceBlockSet.has(block.typeId)) {
                                        count++;
                                    }
                                }
                            }
                        }
                        return count;
                    }
                    totalBlocks = calculateTotalBlocks();
                } else {
                    // replaceBlockSet がない場合、すべてのブロックをカウント
                    totalBlocks = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
                }
                let processedBlocks = 0;

                // 状態を保持するオブジェクト
                const state = {
                    x: minX,
                    y: minY,
                    z: minZ,
                    blocksPerTick: 10,  // 1 Tick あたりのブロック処理数（列処理中の分割にも使用）
                    blocksPerColumn: 10, // 1列あたりの最大処理ブロック数 (これを超えたら列処理を分割)
                    blockCount: 0,       // 現在の Tick/列 で処理したブロック数
                    columnBlockCount: 0, //現在の列で処理したブロック
                    delayTick: 10,        // 遅延 Tick
                };

                const processNextBatch = () => {
                    if (state.delayTick > 0) {
                        state.delayTick--;
                        system.run(processNextBatch);
                        return;
                    }

                    state.blockCount = 0;      // Tick ごとのカウンターをリセット
                    state.columnBlockCount = 0; // 列ごとのカウンターをリセット

                    // 現在の列を処理（分割処理対応）
                    for (let y = state.y; y <= maxY; y++) {
                        for (let z = state.z; z <= maxZ; z++) {
                            if (state.blockCount >= state.blocksPerTick || state.columnBlockCount >= state.blocksPerColumn) {
                                // blocksPerTick または blocksPerColumn に達したら次の Tick/列 へ
                                system.run(processNextBatch);
                                return;
                            }

                            const blockLoc: Vector3 = { x: state.x, y: y, z: z };
                            try {
                                const randomBlockId = getRandomBlock();
                                const block = dimension.getBlock(blockLoc);

                                if (block) {
                                    if (replaceBlockSet) {
                                        if (replaceBlockSet.has(block.typeId)) {
                                            block.setType(randomBlockId);
                                            state.blockCount++;
                                            state.columnBlockCount++;
                                            processedBlocks++;
                                        }
                                    } else {
                                        block.setType(randomBlockId);
                                        state.blockCount++;
                                        state.columnBlockCount++;
                                        processedBlocks++;
                                    }
                                }

                            } catch (error: any) {
                                consoleOutput(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error.message ?? error}`);
                                sendMessage(`ブロック設置エラー at ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z}: ${error.message ?? error}`);
                                return; // エラーが発生したら処理を中断
                            }
                        }
                    }


                    state.x++; // 次の列へ

                    if (state.x > maxX) {
                        // 全ての列を処理し終えたら終了
                        if (debugMode) {
                            sendMessage('ランダムブロック配置が完了しました。', true);
                        }
                        return;
                    }

                    // 列の処理が終わったので y と z をリセット
                    state.y = minY;
                    state.z = minZ;

                    if (debugMode) {
                        const progressPercentage = ((processedBlocks / totalBlocks) * 100).toFixed(2);
                        sendActionBarMessage(`Progress: ${progressPercentage}% (${processedBlocks}/${totalBlocks})`);
                    }

                    state.delayTick = 0; // 遅延時間を設定（0 で最速）
                    system.run(processNextBatch); // 次の列の処理を開始
                };

                // 初回の処理を開始
                system.run(processNextBatch);

            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }
        },
    });
}