import { Player, system, world, Dimension } from "@minecraft/server";
import { Handler } from "../../../module/Handler";


// executeCommand 関数を外に出す
function executeCommand(commandTemplate: string, x: number, y: number, z: number, dimension: Dimension) {
    let command = commandTemplate.replaceAll("{x}", x.toString())
        .replaceAll("{y}", y.toString())
        .replaceAll("{z}", z.toString());

    dimension.runCommandAsync(command).catch(error => {
        console.warn(`コマンド実行中にエラー（非同期）: ${error} \n ${command}`);
    });
}


export function registerCheckBlockCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('checkBlock', {
        moduleName: moduleName,
        description: '指定された範囲内のブロックを検索し、条件に一致するブロックに対してコマンドを実行します。',
        usage:
            'checkBlock <JSON>\n  <JSON>: {"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":70,"z":10},"checkBlocks":["minecraft:dirt","minecraft:stone"],"runCommand":"say Found block at {x} {y} {z}"}',
        execute: (_message, event) => {

            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    system.run(() => (event.sourceEntity as Player).sendMessage(message));
                } else {
                    console.warn(message);
                }
            };

            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) {
                    sendMessage('JSONオブジェクトが見つかりませんでした。');
                    return;
                }

                const checkDataStr = matchResult[0];
                let checkData;
                try {
                    checkData = JSON.parse(checkDataStr);
                } catch (parseError) {
                    sendMessage(`JSON解析エラー: 無効なJSON形式です。 ${parseError}`); // より詳細なエラーメッセージ
                    return;
                }


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


                const dimension = event.sourceEntity?.dimension ?? world.getDimension('overworld');

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

                let currentX = start.x;
                let currentY = start.y;
                let currentZ = start.z;
                const CHUNK_SIZE = 4; // チャンクサイズを定数化（必要に応じて調整）

                const intervalId = system.runInterval(() => {
                    const endX = Math.min(currentX + CHUNK_SIZE - 1, end.x);
                    const endY = Math.min(currentY + CHUNK_SIZE - 1, end.y);
                    const endZ = Math.min(currentZ + CHUNK_SIZE - 1, end.z);


                    for (let x = currentX; x <= endX; x++) {
                        for (let y = currentY; y <= endY; y++) {
                            for (let z = currentZ; z <= endZ; z++) {
                                const block = dimension.getBlock({ x, y, z });
                                if (block) { 
                                    const typeId = block.typeId;

                                    if (checkData.checkBlocks.includes(typeId)) {
                                        executeCommand(checkData.runCommand, x, y, z, dimension);
                                    }
                                }
                            }
                        }
                    }

                    // 次の範囲に進む
                    currentZ += CHUNK_SIZE;
                    if (currentZ > end.z) {
                        currentZ = start.z;
                        currentY += CHUNK_SIZE;
                        if (currentY > end.y) {
                            currentY = start.y;
                            currentX += CHUNK_SIZE;
                        }
                    }

                    // 処理が完了したらintervalをクリア
                    if (currentX > end.x) {
                        system.clearRun(intervalId);
                    }
                }, 1); // 1ティックごとに実行 (必要に応じて調整)


            } catch (error: any) {
                console.warn(`処理中にエラーが発生しました: ${error}`); // any型を追加
                sendMessage(`エラーが発生しました: ${error.message}`);
            }
        },
    });
}