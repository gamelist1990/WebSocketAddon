import { world, system, Player } from '@minecraft/server';
import { Handler } from '../../../../module/Handler';

export function registerTeamCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('team', {
        moduleName: moduleName,
        description: `指定した条件に基づいてプレイヤーをチーム分けし、スコアボードに記録します。
・既存: /ws:team set <チーム数>:<チーム内上限人数> <タグ名> <スコアボード名>
・新方式: /ws:team set <チーム名1> <上限人数1> <チーム名2> <上限人数2> ... <タグ名> <スコアボード名>`,
        usage: `team set <パラメータ> <タグ名> <スコアボード名>\n（パラメータは「チーム数:チーム内上限人数」または「チーム名 上限人数」のペア）`,
        execute: (message, event) => {
            const args = message.replace(/^\/team\s+/, '').split(/\s+/);

            const sendMessage = (msg: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(msg));
                } else {
                    console.warn(msg);
                }
            };

            if (args.length === 0) {
                sendMessage(
                    '使用方法: /ws:team set <パラメータ> <タグ名> <スコアボード名>'
                );
                return;
            }

            const subcommand = args[0];

            if (subcommand === 'set') {
                if (args.length < 4) {
                    sendMessage(
                        '引数が不足しています。使用方法: /ws:team set <パラメータ> <タグ名> <スコアボード名>'
                    );
                    return;
                }
                // 新方式か従来方式か判定
                // ・従来方式: args[1]に「:」が含まれている
                // ・新方式: サブコマンド以降から末尾2個（タグ名・スコアボード名）を除いた部分が偶数個
                const newModeCandidate = ((args.length - 3) % 2 === 0) && !args[1].includes(':');

                if (!newModeCandidate) {
                    // 従来方式（数値指定：チーム数:チーム内上限人数）
                    const teamParams = args[1].split(':');
                    const numTeams = parseInt(teamParams[0]);
                    const maxTeamSize = parseInt(teamParams[1]);
                    const tagName = args[2];
                    const scoreTitle = args[3];

                    if (isNaN(numTeams) || numTeams < 1) {
                        sendMessage('チーム数は1以上の整数で指定してください。');
                        return;
                    }
                    if (isNaN(maxTeamSize) || maxTeamSize < 1) {
                        sendMessage('チーム内上限人数は1以上の整数で指定してください。');
                        return;
                    }

                    const objective = world.scoreboard.getObjective(scoreTitle);
                    if (!objective) {
                        sendMessage(`スコアボード '${scoreTitle}' が見つかりません。`);
                        return;
                    }

                    const players = world.getPlayers().filter((player) => player.hasTag(tagName));
                    const teamAssignments: { [playerName: string]: number } = {};
                    const teamSizes: { [teamNumber: number]: number } = {};

                    // プレイヤーをシャッフル
                    const shuffledPlayers = players.sort(() => Math.random() - 0.5);

                    // 各チームの人数を初期化
                    for (let i = 1; i <= numTeams; i++) {
                        teamSizes[i] = 0;
                    }

                    // シャッフルされたプレイヤーリストから順番に各チームに割り当て
                    let teamIndex = 1;
                    for (const player of shuffledPlayers) {
                        // 現在のチームが上限に達しているかチェック
                        let attempts = 0;
                        while (teamSizes[teamIndex] >= maxTeamSize && attempts < numTeams) {
                            teamIndex++;
                            if (teamIndex > numTeams) {
                                teamIndex = 1; // 全チームが上限に達したら最初のチームに戻る
                            }
                            attempts++;
                        }
                        teamAssignments[player.name] = teamIndex;
                        objective.setScore(player, teamIndex);
                        teamSizes[teamIndex]++;

                        teamIndex++;
                        if (teamIndex > numTeams) {
                            teamIndex = 1;
                        }
                    }

                    sendMessage(`チーム分け完了: ${JSON.stringify(teamAssignments)}`);
                } else {
                    // 新方式（チームごとにチーム名と上限人数を指定：例: 人狼 2 村人 6 ...）
                    // args: ['set', teamName1, capacity1, teamName2, capacity2, ..., tagName, scoreTitle]
                    const numDefinitions = (args.length - 3) / 2;
                    const teams: { name: string, capacity: number, count: number }[] = [];
                    for (let i = 0; i < numDefinitions; i++) {
                        const teamName = args[1 + i * 2];
                        const capacity = parseInt(args[1 + i * 2 + 1]);
                        if (isNaN(capacity) || capacity < 1) {
                            sendMessage(`チーム '${teamName}' の上限人数は1以上の整数で指定してください。`);
                            return;
                        }
                        teams.push({ name: teamName, capacity, count: 0 });
                    }
                    const tagName = args[args.length - 2];
                    const scoreTitle = args[args.length - 1];

                    const objective = world.scoreboard.getObjective(scoreTitle);
                    if (!objective) {
                        sendMessage(`スコアボード '${scoreTitle}' が見つかりません。`);
                        return;
                    }

                    const players = world.getPlayers().filter((player) => player.hasTag(tagName));
                    const teamAssignments: { [playerName: string]: string } = {};

                    // プレイヤーをシャッフル
                    const shuffledPlayers = players.sort(() => Math.random() - 0.5);

                    // 各チームに順番に割り当て（各チームの上限を超えたら除外）
                    let teamIndex = 0;
                    for (const player of shuffledPlayers) {
                        let attempts = 0;
                        // 割り当て可能なチームを探す
                        while (teams[teamIndex].count >= teams[teamIndex].capacity && attempts < teams.length) {
                            teamIndex = (teamIndex + 1) % teams.length;
                            attempts++;
                        }
                        // すべてのチームが上限に達している場合は、単純に次のチームへ割り当て（上限を超える）
                        teamAssignments[player.name] = teams[teamIndex].name;
                        // スコアボードには便宜的にチームの順番（1〜）を設定
                        objective.setScore(player, teamIndex + 1);
                        teams[teamIndex].count++;

                        teamIndex = (teamIndex + 1) % teams.length;
                    }

                    sendMessage(`チーム分け完了: ${JSON.stringify(teamAssignments)}`);
                }
            } else {
                sendMessage('無効なサブコマンドです。 set を使用してください。');
            }
        },
    });
}