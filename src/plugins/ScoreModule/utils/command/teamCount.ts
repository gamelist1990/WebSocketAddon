import { world, system } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";

export function registerTeamCountCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('teamCount', {
        moduleName: moduleName,
        description: `指定したタグを持つプレイヤーの人数に基づいて、条件分岐しコマンドを実行します。`,
        usage: `teamCount <チームタグ1,チームタグ2,...> <JSON> [true] [onlyOneRemaining]\n  <チームタグ1,チームタグ2,...>: カンマ区切りのチームタグ。\n  <JSON>: チームタグとコマンドの対応を記述したJSON配列。 例: [{"team1":"cmd1"},{"team2":"cmd2"}]\n  [true]: (オプション) 最大人数のチームを比較。\n  [onlyOneRemaining]: (オプション) 最後のチームを検知。`,

        execute: (_message, event, args) => {
            const consoleOutput = (message: string) => {
                console.warn(message);
            };
            try {

                if (args.length < 2) {
                    consoleOutput(
                        '使用方法: /ws:teamCount <チームタグ1,チームタグ2,...> <コマンドリスト> [true] [onlyOneRemaining]',
                    );
                    return;
                }

                const teamTags = args[0].split(',');
                // JSON文字列全体をコマンドリストとして扱う
                const matchResult = event.message.match(/\[.*\]/);
                if (!matchResult) {
                    consoleOutput('コマンドリストが見つかりませんでした。');
                    return;
                }

                const commandListStr = matchResult[0];
                const commandList = JSON.parse(commandListStr);
                const compareMode = args.includes('true'); // trueが指定されたか
                const onlyOneRemaining = args.includes('only'); // onlyOneRemaining が指定されたか

                if (!Array.isArray(commandList)) {
                    consoleOutput(
                        'コマンドリストは配列形式で指定してください。例: [{"team1":"command1"},{"team2":"command2"}]',
                    );
                    return;
                }

                const checkTeamCountsAndRun = () => {
                    if (compareMode) {
                        // 人数比較モード
                        let maxPlayerCount = -1;
                        let winningTeam = '';
                        let isSame = false; // 同数フラグ

                        for (const teamTag of teamTags) {
                            const teamPlayerCount = world
                                .getPlayers()
                                .filter((player) => player.hasTag(teamTag)).length;
                            if (teamPlayerCount > maxPlayerCount) {
                                maxPlayerCount = teamPlayerCount;
                                winningTeam = teamTag;
                                isSame = false; // 同数フラグをリセット
                            } else if (teamPlayerCount === maxPlayerCount) {
                                isSame = true; // 同数フラグを立てる
                                winningTeam = ''; // 同数の場合は winningTeam をリセット
                            }
                        }

                        if (isSame) {
                            // 同数の場合の処理
                            const sameCommandObj = commandList.find((obj) => obj['same']);
                            if (sameCommandObj) {
                                const sameCommand = sameCommandObj['same'];
                                //   consoleOutput(`チーム人数が同数のため、コマンド「${sameCommand}」を実行します。`);
                                system.run(() => {
                                    try {
                                        system.run(() => { world.getDimension('overworld').runCommand(sameCommand); })
                                    } catch (commandError) {
                                        consoleOutput(`コマンド実行中にエラーが発生しました: ${commandError}`);
                                    }
                                });
                            } else {
                            }
                        } else if (winningTeam !== '') {
                            // 最大人数のチームがある場合の処理 (従来の動作)
                            const commandObj = commandList.find((obj) => obj[winningTeam]);
                            if (commandObj) {
                                const command = commandObj[winningTeam];
                                // consoleOutput(`チーム ${winningTeam} の人数が最も多いため、コマンド「${command}」を実行します。`);
                                system.run(() => {
                                    try {
                                        system.run(() => world.getDimension('overworld').runCommand(command))
                                    } catch (commandError) {
                                        consoleOutput(`コマンド実行中にエラーが発生しました: ${commandError}`);
                                    }
                                });
                            } else {
                                consoleOutput(`チーム ${winningTeam} に対応するコマンドが定義されていません。`);
                            }
                        }
                    } else {
                        // 0人生存確認モード (従来の動作)
                        if (onlyOneRemaining) {
                            // onlyOneRemainingがtrueの場合
                            let aliveTeams: string[] = [];
                            for (const teamTag of teamTags) {
                                const teamPlayerCount = world
                                    .getPlayers()
                                    .filter((player) => player.hasTag(teamTag)).length;
                                if (teamPlayerCount > 0) {
                                    aliveTeams.push(teamTag);
                                }
                            }

                            if (aliveTeams.length === 1) {
                                // 生存チームが1つだけの場合
                                const winningTeam = aliveTeams[0];
                                const commandObj = commandList.find((obj) => obj[winningTeam]);
                                if (commandObj) {
                                    const command = commandObj[winningTeam];
                                    // consoleOutput(`最後のチーム ${winningTeam} が残ったため、コマンド「${command}」を実行します。`);
                                    system.run(() => {
                                        try {
                                            system.run(() => world.getDimension('overworld').runCommand(command))
                                        } catch (commandError) {
                                            consoleOutput(`コマンド実行中にエラーが発生しました: ${commandError}`);
                                        }
                                    });
                                } else {
                                    consoleOutput(`チーム ${winningTeam} に対応するコマンドが定義されていません。`);
                                }
                            }
                        } else {
                            // onlyOneRemaining が false の場合 (従来の動作)
                            for (const teamTag of teamTags) {
                                const teamPlayerCount = world
                                    .getPlayers()
                                    .filter((player) => player.hasTag(teamTag)).length;
                                if (teamPlayerCount === 0) {
                                    // コマンドリストからチームに対応するコマンドを検索
                                    const commandObj = commandList.find((obj) => obj[teamTag]);
                                    if (commandObj) {
                                        const command = commandObj[teamTag];
                                        //    consoleOutput(`チーム ${teamTag} の人数が0になったため、コマンド「${command}」を実行します。`);
                                        system.run(() => {
                                            try {
                                                system.run(() => world.getDimension('overworld').runCommand(command));
                                            } catch (commandError) {
                                                consoleOutput(`コマンド実行中にエラーが発生しました: ${commandError}`);
                                            }
                                        });
                                    } else {
                                        consoleOutput(`チーム ${teamTag} に対応するコマンドが定義されていません。`);
                                    }
                                }
                            }
                        }
                    }
                };

                // コマンド実行時にチェックを実行
                checkTeamCountsAndRun();
            } catch (error) {
                consoleOutput(`エラーが発生しました: ${error}`);
            }
        },
    });
}