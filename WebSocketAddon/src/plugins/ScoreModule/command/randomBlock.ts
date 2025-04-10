import { Player, system, world, Dimension, Block } from "@minecraft/server";
import { Handler } from "../../../module/Handler";
import { Vector3 } from "../../../module/Vector3";


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
            const consoleOutput = (msg: string) => console.warn(`[${moduleName}] ${msg}`);

            const sendMessage = (msg: string, toAllPlayers: boolean = false) => {
                const prefixedMsg = `[${moduleName}] ${msg}`;
                if (toAllPlayers) {
                    for (const player of world.getAllPlayers()) {
                        system.run(() => player.sendMessage(prefixedMsg));
                    }
                } else if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(prefixedMsg));
                } else {
                    consoleOutput(prefixedMsg); 
                }
            };

            const sendActionBarMessage = (msg: string) => {
                const prefixedMsg = `[${moduleName}] ${msg}`;
                for (const player of world.getAllPlayers()) {
                    try {
                        system.run(() => player.onScreenDisplay.setActionBar(prefixedMsg));
                    } catch (e) { /* ignore */ }
                }
            };

            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) {
                    sendMessage('JSONオブジェクトが見つかりませんでした。usageを確認してください。');
                    return;
                }

                const randomBlockDataStr = matchResult[0];
                let randomBlockData: RandomBlockData;
                try {
                    randomBlockData = JSON.parse(randomBlockDataStr);
                } catch (e: any) {
                    sendMessage(`JSONの解析に失敗しました: ${e.message}`);
                    consoleOutput(`JSON Parse Error: ${e}`);
                    return;
                }


                const debugMode = randomBlockData.debug ?? false;

                if (!randomBlockData.start || typeof randomBlockData.start !== 'string') {
                    sendMessage('JSONには文字列型の "start" プロパティが必要です。');
                    return;
                }
                if (!randomBlockData.end || typeof randomBlockData.end !== 'string') {
                    sendMessage('JSONには文字列型の "end" プロパティが必要です。');
                    return;
                }
                if (!randomBlockData.blocks || !Array.isArray(randomBlockData.blocks)) {
                    sendMessage('JSONには配列型の "blocks" プロパティが必要です。');
                    return;
                }
                if (randomBlockData.blocks.length === 0) {
                    sendMessage('"blocks" 配列が空です。最低1つのブロック定義が必要です。');
                    return;
                }
                if (randomBlockData.replaceBlock && !Array.isArray(randomBlockData.replaceBlock)) {
                    sendMessage('"replaceBlock" を指定する場合、文字列の配列である必要があります。');
                    return;
                }


                // --- 座標のパースとVector3インスタンスの作成 ---
                const startCoords = randomBlockData.start.split(" ").map(Number);
                const endCoords = randomBlockData.end.split(" ").map(Number);

                if (startCoords.length !== 3 || startCoords.some(isNaN) || endCoords.length !== 3 || endCoords.some(isNaN)) {
                    sendMessage(`無効な座標形式です。例: "10 64 20"。 start: '${randomBlockData.start}', end: '${randomBlockData.end}'`);
                    return;
                }

                const startVec = new Vector3(startCoords[0], startCoords[1], startCoords[2]);
                const endVec = new Vector3(endCoords[0], endCoords[1], endCoords[2]);

                // 範囲の最小値・最大値を計算
                const minVec = new Vector3(
                    Math.min(startVec.x, endVec.x),
                    Math.min(startVec.y, endVec.y),
                    Math.min(startVec.z, endVec.z)
                );
                const maxVec = new Vector3(
                    Math.max(startVec.x, endVec.x),
                    Math.max(startVec.y, endVec.y),
                    Math.max(startVec.z, endVec.z)
                );

                // --- ブロックデータの検証と重み計算 ---
                let totalWeight = 0;
                for (const blockData of randomBlockData.blocks) {
                    if (typeof blockData.id !== 'string' || typeof blockData.weight !== 'number' || blockData.weight <= 0) {
                        sendMessage(`無効なブロックデータ形式または重みです: ${JSON.stringify(blockData)}。'id'は文字列、'weight'は正の数値である必要があります。`);
                        return;
                    }
                    totalWeight += blockData.weight;
                }

                if (totalWeight <= 0) {
                    sendMessage("エラー: ブロックの重みの合計が0以下です。");
                    return;
                }

                // --- 置き換え対象ブロックの設定 ---
                const replaceBlockSet = randomBlockData.replaceBlock ? new Set(randomBlockData.replaceBlock) : null;

                // --- ディメンション取得 ---
                const dimension: Dimension = event.sourceEntity?.dimension ?? world.getDimension('overworld');

                // --- ランダムブロック選択関数 ---
                const getRandomBlockId = (): string => {
                    let random = Math.random() * totalWeight;
                    for (const blockData of randomBlockData.blocks) {
                        random -= blockData.weight;
                        if (random < 1e-6) { 
                            return blockData.id;
                        }
                    }
                    consoleOutput(`getRandomBlockId: フォールバック発生 (random=${random}, totalWeight=${totalWeight})`);
                    return randomBlockData.blocks[randomBlockData.blocks.length - 1].id;
                };

                const sizeX = maxVec.x - minVec.x + 1;
                const sizeY = maxVec.y - minVec.y + 1;
                const sizeZ = maxVec.z - minVec.z + 1;
                const totalVolume = sizeX * sizeY * sizeZ;

                const MAX_VOLUME = 262144; //64*64*64
                if (totalVolume > MAX_VOLUME) {
                    sendMessage(`エラー: 指定範囲が大きすぎます (最大 ${MAX_VOLUME} ブロック推奨、指定: ${totalVolume})。処理を中止します。`);
                    return;
                }
                if (totalVolume <= 0) {
                    sendMessage(`エラー: 範囲の体積が0以下です。座標を確認してください。`);
                    return;
                }


                // --- Tick分割処理の準備 ---
                const maxBlocksPerTick = 1024;
                let currentIndex = 0;
                let processedCount = 0;
                const currentBlockPos = new Vector3(); 

              //  sendMessage(`処理を開始します... 範囲: ${minVec} - ${maxVec}, 対象ブロック数: ${totalVolume}`);

                const processChunk = () => {
                    const startTime = Date.now();
                    let processedInTick = 0;

                    while (currentIndex < totalVolume && processedInTick < maxBlocksPerTick) {
                        const indexInLayer = currentIndex % (sizeX * sizeY);
                        const zOffset = Math.floor(currentIndex / (sizeX * sizeY));
                        const xOffset = indexInLayer % sizeX;
                        const yOffset = Math.floor(indexInLayer / sizeX);

                        currentBlockPos.set(
                            minVec.x + xOffset,
                            minVec.y + yOffset,
                            minVec.z + zOffset
                        );

                        try {
                            const block: Block | undefined = dimension.getBlock(currentBlockPos);

                            if (block) {
                                if (!replaceBlockSet || replaceBlockSet.has(block.typeId)) {
                                    const newBlockId = getRandomBlockId();
                                    block.setType(newBlockId); 
                                    processedCount++;
                                }
                            } else {
                                if (debugMode) consoleOutput(`座標 ${currentBlockPos} のブロックを取得できませんでした (未ロード?)`);
                            }
                        } catch (error: any) {
                            consoleOutput(`ブロック処理エラー at ${currentBlockPos}: ${error.message ?? error}`);
                        }

                        processedInTick++;
                        currentIndex++;
                        if (Date.now() - startTime > 40) {
                            break;
                        }
                    }

                    // --- 進捗表示 (デバッグモード) ---
                    if (debugMode) {
                        const progress = ((currentIndex / totalVolume) * 100).toFixed(1);
                        sendActionBarMessage(`進行状況: ${progress}% (${currentIndex}/${totalVolume})`);
                    }

                    // --- 次のTickまたは完了 ---
                    if (currentIndex < totalVolume) {
                        system.run(processChunk); 
                    } else {
                      //  const endTime = Date.now();
                      //  const totalDurationSec = (endTime - commandStartTime) / 1000; 

                      //  const finishMessage = `ランダムブロック配置完了。${processedCount} ブロックを処理しました。(総時間: ${totalDurationSec.toFixed(2)}秒)`;
                      //  sendMessage(finishMessage, true); 
                       // if (debugMode) sendActionBarMessage(finishMessage); 
                    }
                };

               // const commandStartTime = Date.now();
                system.run(processChunk); 

            } catch (error: any) {
                consoleOutput(`コマンド実行中に予期せぬエラーが発生しました: ${error.message ?? error}\n${error.stack}`);
                sendMessage(`エラーが発生しました: ${error.message ?? error}`);
            }
        },
    });
}