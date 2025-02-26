import { Player, system, world } from "@minecraft/server";
import { Handler } from "../../../module/Handler";

export function registerCheckBlockCommand(handler: Handler, moduleName: string) {
    let blockCache: {
        [key: string]: {
            timestamp: number;
            blocks: { x: number; y: number; z: number; typeId: string }[];
        };
    } = {};

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
                const dimensionId = dimension.id;
                const start = checkData.start;
                const end = checkData.end;

                if (blockCache[dimensionId] && (Date.now() - blockCache[dimensionId].timestamp) <= 1000) {
                    for (const cachedBlock of blockCache[dimensionId].blocks) {
                        if (checkData.checkBlocks.includes(cachedBlock.typeId)) {
                            executeCommand(checkData.runCommand, cachedBlock.x, cachedBlock.y, cachedBlock.z, dimension);
                        }
                    }
                } else {
                    let newBlocks: { x: number; y: number; z: number; typeId: string }[] = [];

                    for (let x = start.x; x <= end.x; x++) {
                        for (let y = start.y; y <= end.y; y++) {
                            for (let z = start.z; z <= end.z; z++) {
                                const block = dimension.getBlock({ x, y, z });
                                if (!block) continue;
                                newBlocks.push({ x: x, y: y, z: z, typeId: block.typeId });

                                if (checkData.checkBlocks.includes(block.typeId)) {
                                    executeCommand(checkData.runCommand, x, y, z, dimension);
                                }
                            }
                        }
                    }

                    blockCache[dimensionId] = {
                        timestamp: Date.now(),
                        blocks: newBlocks,
                    };
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
                    dimension.runCommandAsync(command)
                        .then(_result => {
                            // console.log(`Command result: ${result}`);
                            //debug
                        })
                        .catch(error => {
                            consoleOutput(`コマンド実行中に例外: ${error} \n ${command}`);
                            sendMessage(`コマンド実行中に例外: ${error}`);
                        });
                } catch (error) {
                    consoleOutput(`コマンド実行中にエラー（同期）: ${error} \n ${command}`);
                    sendMessage(`コマンド実行中にエラー（同期）: ${error}`);
                }
            }
        },
    });
}