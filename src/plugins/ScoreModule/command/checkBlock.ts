import { Dimension, Player, system, world } from "@minecraft/server";
import { Handler } from "../../../module/Handler";

export function registerCheckBlockCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('checkBlock', {
        moduleName: moduleName,
        description: '指定された範囲内のブロックを検索し、条件に一致するブロックに対してコマンドを実行します。',
        usage:
            'checkBlock <JSON>\n  <JSON>: {"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":70,"z":10},"checkBlocks":["minecraft:dirt","minecraft:stone"],"runCommand":"say Found block at {x} {y} {z}"}',
        execute: (_message, event) => {
            const consoleOutput = (message: string) => {
                console.warn(message);
            };

            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                } else {
                    consoleOutput(message);
                }
            };

            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) {
                    sendMessage('JSONオブジェクトが見つかりませんでした。');
                    return;
                }

                const checkDataStr = matchResult[0];
                const checkData = JSON.parse(checkDataStr);

                if (!checkData.start || !checkData.end || !checkData.checkBlocks || !checkData.runCommand) {
                    sendMessage('JSONオブジェクトは "start", "end", "checkBlocks", "runCommand" を含む必要があります。');
                    return;
                }

                if (typeof checkData.start.x !== 'number' || typeof checkData.start.y !== 'number' || typeof checkData.start.z !== 'number' ||
                    typeof checkData.end.x !== 'number' || typeof checkData.end.y !== 'number' || typeof checkData.end.z !== 'number') {
                    sendMessage('座標は数値で指定してください。');
                    return;
                }

                if (!Array.isArray(checkData.checkBlocks)) {
                    sendMessage('"checkBlocks" は配列である必要があります。');
                    return;
                }

                if (checkData.checkBlocks.length === 0) {
                    sendMessage('"checkBlocks" は空にできません');
                    return;
                }


                if (typeof checkData.runCommand !== 'string') {
                    sendMessage('"runCommand" は文字列である必要があります。');
                    return;
                }

                const dimension = event.sourceEntity?.dimension ?? world.getDimension('overworld');

                // 座標の順序を保証
                const start = {
                    x: Math.min(checkData.start.x, checkData.end.x),
                    y: Math.min(checkData.start.y, checkData.end.y),
                    z: Math.min(checkData.start.z, checkData.end.z),
                };
                const end = {
                    x: Math.max(checkData.start.x, checkData.end.x),
                    y: Math.max(checkData.start.y, checkData.end.y),
                    z: Math.max(checkData.start.z, checkData.end.z),
                };

                // 1tickあたりの処理上限
                const maxBlocksPerTick = 500; // 1tickあたりに処理するブロック数の上限
                let currentBlockIndex = 0;  // 現在処理中のブロックのインデックス

                const volume = (end.x - start.x + 1) * (end.y - start.y + 1) * (end.z - start.z + 1);
                const totalBlocks = volume;  // 処理するブロックの総数

                const processBlocks = () => {
                    let blocksProcessedThisTick = 0; // このtickで処理したブロック数
                    for (let i = currentBlockIndex; i < totalBlocks; i++) {
                        // 3次元座標を1次元インデックスから逆算
                        const x = start.x + Math.floor(i % (end.x - start.x + 1));
                        const y = start.y + Math.floor((i / (end.x - start.x + 1)) % (end.y - start.y + 1));
                        const z = start.z + Math.floor(i / ((end.x - start.x + 1) * (end.y - start.y + 1)));

                        const block = dimension.getBlock({ x, y, z });
                        const typeId = block?.typeId ?? "minecraft:air";


                        if (checkData.checkBlocks.includes(typeId)) {
                            executeCommand(checkData.runCommand, x, y, z, dimension);
                        }


                        blocksProcessedThisTick++;
                        currentBlockIndex++;

                        // 1tickあたりの処理上限に達したら次のtickへ
                        if (blocksProcessedThisTick >= maxBlocksPerTick) {
                            system.run(processBlocks);
                            return; // このtickでの処理を終了
                        }
                    }
                };


                // 初回の呼び出し
                system.run(processBlocks);

            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }

            function executeCommand(commandTemplate: string, x: number, y: number, z: number, dimension: Dimension) {
                let command = commandTemplate;

                command = command.replaceAll("{x}", x.toString());
                command = command.replaceAll("{y}", y.toString());
                command = command.replaceAll("{z}", z.toString());

                try {
                    system.run(() => dimension.runCommand(command))
                } catch (error) {
                    consoleOutput(`コマンド実行中にエラー（非同期）: ${error} \n ${command}`);
                    sendMessage(`コマンド実行中にエラー（非同期）: ${error}`);
                }
            }
        },
    });
}