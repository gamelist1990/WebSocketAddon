import { world, system, Player } from '@minecraft/server';
import { Handler } from '../../../../module/Handler';

export function registerNumberCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('number', {
        moduleName: moduleName,
        description: `指定された数値の中からランダムに1つを選び、指定されたスコアボードに設定します。スコアボード名が指定されていない場合は、'ws_number' スコアボードに設定します。`,
        usage: `number [<スコアボード名>] <数値1>, <数値2>, ...\n  <スコアボード名>: 設定するスコアボードの名前。省略した場合は 'ws_number' が使用されます。\n  <数値1>, <数値2>, ...: カンマ区切りの数値リスト（スペース区切り）。`,
        execute: (message, event) => {
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

            const args = message.split(/\s+/); // スペースで区切る
            let scoreboardName = 'ws_number'; // デフォルトのスコアボード名
            let numberArgs: string[];

            if (args.length === 0) {
                sendMessage('数値を1つ以上指定してください。');
                return;
            }

            if (args.length >= 1 && !isNaN(Number(args[0].split(',')[0]))) {
                // 最初の引数が数値で始まる場合、scoreboardNameはデフォルトのまま
                numberArgs = args.join(' ').split(/\s*,\s*/); // 数値部分を再結合してからカンマで区切る
            } else if (args.length >= 2) {
                // 最初の引数がscoreboardName
                scoreboardName = args[0];
                numberArgs = args.slice(1).join(' ').split(/\s*,\s*/); // 数値部分を再結合してからカンマで区切る
            } else {
                sendMessage('引数が不足しています。数値を指定してください。');
                return;
            }



            const numbers: number[] = [];

            for (const arg of numberArgs) {
                const num = parseInt(arg);
                if (isNaN(num)) {
                    sendMessage(`無効な数値: ${arg}`);
                    return;
                }
                numbers.push(num);
            }

            if (numbers.length === 0) {
                sendMessage('数値を1つ以上指定してください。');
                return;
            }

            const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];

            let objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) {
                objective = world.scoreboard.addObjective(scoreboardName, 'ランダム数値');
            }

            objective.setScore('number', randomNumber);

            sendMessage(`スコアボード "${scoreboardName}" に数値 "${randomNumber}" を設定しました。`);

            if (!(event.sourceEntity instanceof Player)) {
                consoleOutput(`スコアボード "${scoreboardName}" に設定された数値: ${randomNumber}`);
                //debug
            }
        },
    });
}