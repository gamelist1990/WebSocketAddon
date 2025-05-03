import { Dimension, Player, system, world } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";

export function registerChangeTagCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('tagChange1', {
        moduleName: moduleName,
        description: `指定されたタグを持つプレイヤーのタグを別のタグに変更します。`,
        usage: `tagChange1 <元のタグ>,<新しいタグ>\n  <元のタグ>: 変更前のタグ。\n  <新しいタグ>: 変更後のタグ。`,
        execute: (message, event) => {
            const consoleOutput = (message: string) => {
                console.warn(message);
            };

            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                } else {
                    consoleOutput(message); // コマンドブロックなどからの実行時はコンソールへ
                }
            };

            const args = message.split(/\s*,\s*/); // カンマ区切りで分割

            if (args.length !== 2) {
                sendMessage('使用方法: ws:changeTag <元のタグ>,<新しいタグ>');
                return;
            }

            const oldTag = args[0];
            const newTag = args[1];

            let changedCount = 0;
            for (const player of world.getPlayers()) {
                if (player.hasTag(oldTag)) {
                    try {
                        player.removeTag(oldTag);
                        player.addTag(newTag);
                        changedCount++;
                    } catch (error) {
                        consoleOutput(`タグ変更中にエラーが発生しました: ${error}`);
                        sendMessage(`プレイヤー ${player.name} のタグ変更中にエラーが発生しました。`);
                    }
                }
            }

            if (changedCount > 0) {
                //sendMessage(`${changedCount} 人のプレイヤーのタグを ${oldTag} から ${newTag} に変更しました。`);
            } else {
                // sendMessage(`タグ ${oldTag} を持つプレイヤーは見つかりませんでした。`);
            }
        },
    });
}




interface TagChangeOptions {
    from: string;
    to: string;
    fromCommands?: string[];
    toCommands?: string[];
    time?: number;
    displayMode?: "actionbar" | "title";
    titleDisplayThreshold?: number;
    actionbarText?: string | ((time: number) => string);
    titleText?: string | ((time: number) => string);
    titleSubtitleText?: string | ((time: number) => string);
    intervalCommands?: { [time: number]: string[] };
    hideDisplayAfter?: number; // 追加: 表示を隠す時間
}

export function registerChangeTag2Command(handler: Handler, moduleName: string) {
    const processedPlayers: Map<string, Set<string>> = new Map();
    const activeTimers: { [playerId: string]: number } = {};

    handler.registerCommand('tagChange2', {
        moduleName: moduleName,
        description: '指定されたタグを別のタグに変更し、オプションでコマンド実行や遅延を設定します。',
        usage: 'tagChange2 <JSON>\n <JSON>: {"from":"oldTag", ... , "hideDisplayAfter": 3}', // usageを更新
        execute: (_message, event) => {
            const consoleOutput = (message: string) => {
                console.warn(message);
            };

            const sendMessage = (message: string, player?: Player) => {
                if (player) {
                    system.run(() => player.sendMessage(message));
                } else {
                    consoleOutput(message);
                }
            };


            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) {
                    sendMessage('JSONオブジェクトが見つかりませんでした。', event.sourceEntity instanceof Player ? event.sourceEntity : undefined);
                    return;
                }

                const optionsStr = matchResult[0];
                const options: TagChangeOptions = JSON.parse(optionsStr);

                // 必須パラメータのチェック
                if (!options.from || !options.to) {
                    sendMessage('JSONオブジェクトは "from" と "to" を含む必要があります。', event.sourceEntity instanceof Player ? event.sourceEntity : undefined);
                    return;
                }

                // オプションのデフォルト値設定
                options.fromCommands = options.fromCommands || [];
                options.toCommands = options.toCommands || [];
                options.time = options.time || 0;
                options.displayMode = options.displayMode || "actionbar";
                options.titleDisplayThreshold = options.titleDisplayThreshold || 0;
                options.actionbarText = options.actionbarText || "§a{time}秒後にタグが変更されます"; // デフォルトテキスト
                options.titleText = options.titleText || "§a{time}"; // デフォルトテキスト
                options.titleSubtitleText = options.titleSubtitleText || "";
                options.intervalCommands = options.intervalCommands || {}; // デフォルトは空オブジェクト
                options.hideDisplayAfter = options.hideDisplayAfter || 0;



                const players = world.getAllPlayers();
                for (const player of players) {
                    if (player.hasTag(options.from)) {
                        const dimensionId = player.dimension.id;
                        if (!processedPlayers.has(dimensionId)) {
                            processedPlayers.set(dimensionId, new Set());
                        }
                        const dimensionPlayers = processedPlayers.get(dimensionId)!;

                        // 初回のみfromCommands実行
                        if (!dimensionPlayers.has(player.id)) {
                            for (const command of options.fromCommands) {
                                executeCommand(command, player, player.dimension);
                            }
                            dimensionPlayers.add(player.id); // プレイヤーを処理済みセットに追加
                        }


                        if (options.time > 0) {
                            startTimer(player, options);
                        } else {
                            // timeが0または未定義の場合は即時実行
                            player.removeTag(options.from);
                            player.addTag(options.to);
                            for (const command of options.toCommands) {
                                executeCommand(command, player, player.dimension);
                            }

                        }
                    }
                }
            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`, event.sourceEntity instanceof Player ? event.sourceEntity : undefined);
            }
        },
    });

    function executeCommand(commandTemplate: string, player: Player, _dimension: Dimension) {
        let command = commandTemplate;
        command = command.replaceAll("{player}", player.name);

        try {
            player.runCommand(command)
        } catch (error) {
            console.warn(`コマンド実行中にエラー（同期）: ${error} \n ${command}`);

        }
    }

    function startTimer(player: Player, options: TagChangeOptions) {
        const playerId = player.id;

        if (activeTimers[playerId]) {
            system.clearRun(activeTimers[playerId]);
        }

        let remainingTime = options.time;
        let shouldDisplay = true; // 表示するかどうかのフラグ

        const updateDisplay = () => {
            if (remainingTime === undefined) return;


            // actionbarText が関数の場合、関数を呼び出して文字列を取得
            const getActionbarText = () => {
                if (typeof options.actionbarText === 'function') {
                    return options.actionbarText(remainingTime ?? 0);
                }
                return (options.actionbarText ?? "").replace("{time}", remainingTime?.toString() ?? "0");
            };

            // titleText が関数の場合、関数を呼び出して文字列を取得
            const getTitleText = () => {
                if (typeof options.titleText === 'function') {
                    return options.titleText(remainingTime ?? 0);
                }
                return (options.titleText ?? "").replace("{time}", remainingTime?.toString() ?? "0");
            };

            const getTitleSubTitleText = () => {
                if (typeof options.titleSubtitleText === 'function') {
                    return options.titleSubtitleText(remainingTime ?? 0)
                }
                return (options.titleSubtitleText ?? "").replace("{time}", remainingTime?.toString() ?? "0");
            }


            if (shouldDisplay) {
                if (options.displayMode === "actionbar") {
                    player.onScreenDisplay.setActionBar(getActionbarText());
                } else if (options.displayMode === "title" && remainingTime <= (options.titleDisplayThreshold ?? 0)) {
                    player.onScreenDisplay.setTitle(getTitleText(), {
                        fadeInDuration: 0,
                        stayDuration: 20,
                        fadeOutDuration: 0,
                        subtitle: getTitleSubTitleText(),
                    });
                }
            }

            // intervalCommands の実行
            if (options.intervalCommands && options.intervalCommands[remainingTime]) {
                for (const command of options.intervalCommands[remainingTime]) {
                    executeCommand(command, player, player.dimension);
                }
            }
        };

        const timerId = system.runInterval(() => {
            if (remainingTime === undefined) {
                system.clearRun(timerId);
                return
            }

            remainingTime--;

            // hideDisplayAfter の時間になったら表示を消す
            if (options.hideDisplayAfter && remainingTime <= options.hideDisplayAfter) {
                shouldDisplay = false;
                if (options.displayMode === "actionbar") player.onScreenDisplay.setActionBar("");
                if (options.displayMode === "title") player.onScreenDisplay.setTitle("");
            }

            updateDisplay(); // shouldDisplay の状態に関わらず、intervalCommands は実行

            if (remainingTime <= 0) {
                system.clearRun(timerId);
                delete activeTimers[playerId];
                const dimensionId = player.dimension.id;
                if (!processedPlayers.has(dimensionId)) {
                    processedPlayers.set(dimensionId, new Set());
                }

                const dimensionSet = processedPlayers.get(dimensionId)
                if (dimensionSet) {
                    dimensionSet.delete(player.id)
                    if (dimensionSet.size === 0) {
                        processedPlayers.delete(dimensionId)
                    }
                }


                player.removeTag(options.from);
                player.addTag(options.to);
                system.runTimeout(() => {
                    player.removeTag(options.to);
                }, 20);

                if (options.toCommands) {
                    for (const command of options.toCommands) {
                        executeCommand(command, player, player.dimension);
                    }
                }
                // player.onScreenDisplay.setActionBar(""); // タイマー終了時に消すのは不要

            }
        }, 20);

        activeTimers[playerId] = timerId;
    }
    world.afterEvents.playerLeave.subscribe(event => {

        const dimensionId = event.playerId;
        if (!processedPlayers.has(dimensionId)) {
            processedPlayers.set(dimensionId, new Set());
        }

        const dimensionSet = processedPlayers.get(dimensionId)
        if (dimensionSet) {
            dimensionSet.delete(event.playerId)
            if (dimensionSet.size === 0) {
                processedPlayers.delete(dimensionId)
            }
        }
        if (activeTimers[event.playerId]) {
            system.clearRun(activeTimers[event.playerId])
            delete activeTimers[event.playerId];
        }
    })
}