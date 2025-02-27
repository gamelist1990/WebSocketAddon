import { Player, system, world } from "@minecraft/server";
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


                for (let x = start.x; x <= end.x; x++) {
                    for (let y = start.y; y <= end.y; y++) {
                        for (let z = start.z; z <= end.z; z++) {
                            const block = dimension.getBlock({ x, y, z });
                            const typeId = block?.typeId ?? "minecraft:air";

                            if (checkData.checkBlocks.includes(typeId)) {
                                executeCommand(checkData.runCommand, x, y, z, dimension);
                            }
                        }
                    }
                }



            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }

            function executeCommand(commandTemplate: string, x: number, y: number, z: number, dimension: any) {
                let command = commandTemplate;

                command = command.replaceAll("{x}", x.toString());
                command = command.replaceAll("{y}", y.toString());
                command = command.replaceAll("{z}", z.toString());

                try {
                    dimension.runCommandAsync(command);
                } catch (error) {
                    consoleOutput(`コマンド実行中にエラー（非同期）: ${error} \n ${command}`);
                    sendMessage(`コマンド実行中にエラー（非同期）: ${error}`);
                }
            }
        },
    });
}