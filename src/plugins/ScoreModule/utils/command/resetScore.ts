import { Player, system, world } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";
import { resetScoreboard } from "../scoreboardUtils";

export function registerResetScoreCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('resetScore', {
        moduleName: moduleName,
        description: `指定したスコアボード、または全てのスコアボードのスコアをリセットします。`,
        usage: `resetScore <スコアボード名|-all>\n  <スコアボード名>: リセットするスコアボードの名前。\n  -all: 全てのスコアボードをリセット。`,
        execute: (message, event) => {
            const args = message.split(/\s+/);

            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                }
            };

            if (args.length < 1) {
                sendMessage('引数が不足しています。使用方法: ws:resetScore <スコアボード名| -all>');
                return;
            }

            const target = args[0];

            if (target === '-all') {
                for (const objective of world.scoreboard.getObjectives()) {
                    resetScoreboard(objective, sendMessage);
                }
                sendMessage('全てのスコアボードのスコアをリセットしました。');
            } else {
                const objective = world.scoreboard.getObjective(target);
                if (!objective) {
                    sendMessage(`スコアボード '${target}' が見つかりません。`);
                    return;
                }
                resetScoreboard(objective, sendMessage);
                sendMessage(`スコアボード '${target}' のスコアをリセットしました。`);
            }
        },
    });

    handler.registerCommand('resetTag', {
        moduleName: moduleName,
        description: '実行したプレイヤーのタグを操作します。\n`resetTag`: 全てのタグを削除\n`resetTag <タグ名>`: 指定したタグ名に類似するタグを削除',
        usage: 'resetTag [タグ名]',
        execute: (_message, event, args) => { // args を追加
            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                }
            };

            if (!(event.sourceEntity instanceof Player)) {
                sendMessage('このコマンドはプレイヤーのみ実行できます。');
                return;
            }

            const player = event.sourceEntity;
            const tags = player.getTags();

            if (tags.length === 0) {
                sendMessage(`§cタグがありません`);
                return;
            }

            if (args.length === 0) {
                // 引数がない場合 (resetTag): 全タグ削除
                system.run(() => {
                    for (const tag of tags) {
                        player.removeTag(tag);
                    }
                    sendMessage('タグを全て削除しました。');
                });
            } else {
                // 引数がある場合 (resetTag <タグ名>): 類似タグ削除
                const targetTag = args.join(' '); // コマンドの引数を結合 (スペース区切りでタグ名が指定されることを想定)
                const similarTags: string[] = [];

                // 類似性判定 (単純な部分一致を使用。より高度な方法も検討可能)
                for (const tag of tags) {
                    if (tag.toLowerCase().includes(targetTag.toLowerCase())) {
                        similarTags.push(tag);
                    }
                }


                if (similarTags.length === 0) {
                    //   sendMessage(`§c"${targetTag}" に類似するタグは見つかりませんでした。`);
                    return;
                }

                system.run(() => {
                    for (const tag of similarTags) {
                        player.removeTag(tag);
                    }
                    //sendMessage(`"${targetTag}" に類似する以下のタグを削除しました:\n${similarTags.join(', ')}`);
                });
            }
        },
    });

    handler.registerCommand('resetJson', {
        moduleName: moduleName,
        description: '実行したプレイヤーの全てのダイナミックプロパティをクリアします。',
        usage: 'resetJson',
        execute: (_message, event) => {
            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                }
            };

            if (!(event.sourceEntity instanceof Player)) {
                sendMessage('このコマンドはプレイヤーのみ実行できます。');
                return;
            }

            const player = event.sourceEntity;

            system.run(() => {
                try {
                    const propertyIds = player.getDynamicPropertyIds();
                    if (propertyIds.length === 0) {
                        sendMessage('クリアするダイナミックプロパティはありません。');
                        return;
                    }
                    for (const id of propertyIds) {
                        player.setDynamicProperty(id, undefined);
                    }
                    sendMessage(`全てのダイナミックプロパティ (${propertyIds.length}個) をクリアしました。`);
                } catch (error) {
                    sendMessage(`ダイナミックプロパティのクリア中にエラーが発生しました: ${error}`);
                    console.error(`Error clearing dynamic properties for ${player.name}: ${error}`);
                }
            });
        },
    });
}