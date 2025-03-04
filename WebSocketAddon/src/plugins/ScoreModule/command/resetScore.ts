import { Player, system, world } from "@minecraft/server";
import { Handler } from "../../../module/Handler";
import { resetScoreboard } from "../utils/scoreboardUtils";

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
        description: '実行したプレイヤーのタグを全て削除します。',
        usage: 'resetTag',
        execute: (_message, event) => {
            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                }
            };

            if (event.sourceEntity instanceof Player) {
                const player = event.sourceEntity;
                const tags = player.getTags();
                if (tags.length === 0) {
                    sendMessage(`§cタグがありません`);
                    return;
                }
                system.run(() => {
                    for (const tag of tags) {
                        player.removeTag(tag);
                    }
                    sendMessage('タグを全て削除しました。');
                });
            } else {
                sendMessage('このコマンドはプレイヤーのみ実行できます。');
            }
        },
    });
}