import {
    Player,
    ScoreboardIdentity,
    ScriptEventCommandMessageAfterEvent,
    system,
    world, 
} from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { Handler } from '../../../module/Handler'; 

interface Participant {
    name: string;
    score: number;
    scoreboardIdentity?: ScoreboardIdentity;
}

export const registeredRanks: {
    title: string;
    scoreboardName: string;
    rankTiers: string[];
    rankThresholds: { [key: string]: number };
    getLastKnownScore: (participant: string) => number | undefined;
    updateLastKnownScore: (participant: string, score: number) => void;
    getRankNameFromScore: (rankScore: number) => string;
    getRankScoreFromName: (rankName: string) => number;
    getPlayerRankScore: (player: Player | string | ScoreboardIdentity | Participant) => number;
    updatePlayerRank: (player: Player | string | ScoreboardIdentity, newRankScore: number, isFromRunInterval?: boolean) => void;
    updatePlayerRankTag: (player: Player, newRankName: string) => void;
    addPlayerToRank: (player: Player) => void;
    resetPlayerRank: (player: Player | string | ScoreboardIdentity) => void;
    resetAllPlayersRank: () => void;
    getRanking: (player: Player | ScoreboardIdentity) => number;
    getTopRanking: (count: number) => Participant[];
    getAllParticipants: () => Participant[];
    getAllRankNames: () => string[];
}[] = [];

/**
 * 新しいランクシステムを登録します。
 * @param {string} title
 * @param {string} scoreboardName
 * @param {string[]} rankTiers
 * @param {number[]} rankThresholds
 */
export function registerRank(
    title: string,
    scoreboardName: string,
    rankTiers: string[],
    rankThresholds: number[],
) {
    let objective = world.scoreboard.getObjective(scoreboardName);
    if (!objective) {
        objective = world.scoreboard.addObjective(scoreboardName, title);
        console.warn(`スコアボード '${scoreboardName}' が作成されました。`);
    }

    const rankThresholdsObj: { [key: string]: number } = {};
    const lastKnownScores: { [participant: string]: number } = {};

    if (rankTiers.length !== rankThresholds.length) {
        throw new Error('rankTiersとrankThresholdsの長さが一致しません。');
    }

    for (let i = 0; i < rankTiers.length; i++) {
        rankThresholdsObj[rankTiers[i]] = rankThresholds[i];
    }

    const newRank = {
        title: title,
        scoreboardName: scoreboardName,
        rankTiers: rankTiers,
        rankThresholds: rankThresholdsObj,
        getLastKnownScore: (participant: string): number | undefined => {
            return lastKnownScores[participant];
        },
        updateLastKnownScore: (participant: string, score: number): void => {
            lastKnownScores[participant] = score;
        },
        getRankNameFromScore: (rankScore: number): string => {
            for (let i = rankTiers.length - 1; i >= 0; i--) {
                const rank = rankTiers[i];
                if (rankScore >= rankThresholdsObj[rank]) {
                    return rank;
                }
            }
            const lowestRank = rankTiers.find(tier => rankThresholdsObj[tier] === Math.min(...rankThresholds));
            return lowestRank ?? rankTiers[0];
        },
        getRankScoreFromName: (rankName: string): number => {
            return rankThresholdsObj[rankName] ?? 0;
        },
        getPlayerRankScore: (player: Player | string | ScoreboardIdentity | Participant): number => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) return 0;

            let identity: ScoreboardIdentity | undefined;

            if (typeof player === "string") {
                console.warn("プレイヤー名(string)でのスコア取得は推奨されません。オフラインプレイヤーの取得漏れや同名問題が発生する可能性があります。");
                const p = world.getAllPlayers().find(p => p.name === player);
                identity = p?.scoreboardIdentity;
            } else if (player instanceof Player) {
                identity = player.scoreboardIdentity;
            } else if ('id' in player && typeof player.id === 'number' && 'displayName' in player && 'type' in player) {
                identity = player as ScoreboardIdentity;
            } else if ("scoreboardIdentity" in player && player.scoreboardIdentity) {
                identity = player.scoreboardIdentity;
            } else if ("name" in player && "score" in player) {
                const p = world.getAllPlayers().find(p => p.name === player.name);
                identity = p?.scoreboardIdentity;
            }

            if (!identity || !objective.hasParticipant(identity)) {
                return 0;
            }
            try {
                return objective.getScore(identity) ?? 0;
            } catch (e) {
                return 0;
            }
        },
        updatePlayerRank: (player: Player | string | ScoreboardIdentity, newRankScore: number, isFromRunInterval: boolean = false): void => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) {
                console.error(`Objective ${scoreboardName} not found.`);
                return;
            }

            let identity: ScoreboardIdentity | undefined;
            let onlinePlayer: Player | undefined;
            let participantName: string | undefined;

            if (player instanceof Player) {
                identity = player.scoreboardIdentity;
                onlinePlayer = player;
                participantName = player.name;
            } else if (typeof player === 'string') {
                onlinePlayer = world.getAllPlayers().find(p => p.name === player);
                identity = onlinePlayer?.scoreboardIdentity;
                participantName = player;
                console.warn(`string '${player}' でのupdatePlayerRankは非推奨です。`);
            } else {
                identity = player;
                onlinePlayer = world.getAllPlayers().find(p => p.scoreboardIdentity?.id === identity?.id);
                participantName = identity.displayName;
            }

            if (!identity) {
                console.warn("有効なプレイヤーまたはScoreboardIdentityが見つからず、ランク更新をスキップしました。");
                return;
            }

            const oldRankScore = newRank.getPlayerRankScore(identity);
            const oldRankName = newRank.getRankNameFromScore(oldRankScore);
            const newRankName = newRank.getRankNameFromScore(newRankScore);

            const minScoreForNewRank = newRank.getRankScoreFromName(newRankName);
            newRankScore = Math.max(minScoreForNewRank, newRankScore);
            newRankScore = Math.max(0, newRankScore);

            try {
                objective.setScore(identity, newRankScore);

                if (participantName) {
                    newRank.updateLastKnownScore(participantName, newRankScore);
                } else if (identity) {
                    newRank.updateLastKnownScore(identity.displayName, newRankScore);
                }

                if (onlinePlayer) {
                    newRank.updatePlayerRankTag(onlinePlayer, newRankName);
                    if (oldRankName !== newRankName && !isFromRunInterval) {
                        onlinePlayer.sendMessage(
                            `§e[${title}] §rランクが ${oldRankName} から ${newRankName} に変わりました！`,
                        );
                    }
                }
            } catch (e) {
            }
        },
        updatePlayerRankTag: (player: Player, newRankName: string): void => {
            try {
                const currentTags = player.getTags();
                const prefix = `${scoreboardName}:`;
                currentTags.filter((tag) => tag.startsWith(prefix))
                    .forEach((tag) => player.removeTag(tag));
                player.addTag(`${prefix}${newRankName}`);
            } catch (e) {
            }
        },
        addPlayerToRank: (player: Player): void => {
            if (!player.scoreboardIdentity) {
                player.sendMessage("§cスコアボードに参加できませんでした（内部エラー）。");
                return;
            }
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) {
                player.sendMessage("§cランクシステムが見つかりません（内部エラー）。");
                return;
            }

            let currentScore: number | undefined;
            try {
                currentScore = objective.getScore(player.scoreboardIdentity);
            } catch (e) { }

            if (currentScore === undefined) {
                newRank.updatePlayerRank(player, 0, false);
            } else {
                player.sendMessage(`§eあなたは既に ${title} に参加しています。`);
                const correctRankName = newRank.getRankNameFromScore(currentScore);
                newRank.updatePlayerRankTag(player, correctRankName);
            }
        },
        resetPlayerRank: (player: Player | string | ScoreboardIdentity): void => {
            newRank.updatePlayerRank(player, 0, false);
        },
        resetAllPlayersRank: (): void => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) {
                console.error(`Objective ${scoreboardName} is undefined.`);
                return;
            }
            let resetCount = 0;
            try {
                for (const participant of objective.getParticipants()) {
                    newRank.resetPlayerRank(participant);
                    resetCount++;
                }
                console.warn(`[${title}] 全 ${resetCount} 参加者のランクポイントを0にリセットしました。`);
            } catch (e) {
                console.error(`Error resetting all player ranks for ${title}: ${e}`);
            }
        },
        getRanking: (player: Player | ScoreboardIdentity): number => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) return 0;

            let targetIdentity: ScoreboardIdentity | undefined;
            if (player instanceof Player) {
                targetIdentity = player.scoreboardIdentity;
            } else {
                targetIdentity = player;
            }

            if (!targetIdentity) return 0;

            try {
                const scores = objective
                    .getParticipants()
                    .map((participant) => ({
                        identity: participant,
                        score: objective.getScore(participant) ?? -Infinity,
                    }))
                    .sort((a, b) => b.score - a.score);

                const targetEntryIndex = scores.findIndex(s => s.identity.id === targetIdentity!.id);
                if (targetEntryIndex === -1) return 0;

                let rank = 1;
                for (let i = 0; i < targetEntryIndex; i++) {
                    if (scores[i].score > scores[targetEntryIndex].score) {
                        if (i === 0 || scores[i].score !== scores[i - 1].score) {
                            rank = i + 2;
                        } else if (scores[i].score > scores[i + 1].score) {
                            rank = i + 2;
                        }
                        let currentRank = 1;
                        for (let i = 0; i < scores.length; i++) {
                            if (i > 0 && scores[i].score < scores[i - 1].score) {
                                currentRank = i + 1;
                            }
                            if (scores[i].identity.id === targetIdentity.id) {
                                return currentRank;
                            }
                        }
                    }
                }
                return rank;
            } catch (e) {
                return 0;
            }
            return 0;
        },
        getTopRanking: (count: number): Participant[] => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) return [];
            try {
                return objective
                    .getParticipants()
                    .map((participant) => ({
                        name: participant.displayName,
                        score: objective.getScore(participant) ?? 0,
                        scoreboardIdentity: participant,
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, count);
            } catch (e) {
                return [];
            }
        },
        getAllParticipants: (): Participant[] => {
            const objective = world.scoreboard.getObjective(scoreboardName);
            if (!objective) return [];
            try {
                return objective.getParticipants().map((participant) => ({
                    name: participant.displayName,
                    score: objective.getScore(participant) ?? 0,
                    scoreboardIdentity: participant,
                }));
            } catch (e) {
                return [];
            }
        },
        getAllRankNames: (): string[] => {
            return Object.entries(rankThresholdsObj)
                .sort(([, scoreA], [, scoreB]) => scoreA - scoreB)
                .map(([name]) => name);
        }
    };

    registeredRanks.push(newRank);
    console.warn(`新しいランクシステム '${title}' (スコアボード: ${scoreboardName}) が登録されました。`);

    system.run(() => {
        const objective = world.scoreboard.getObjective(scoreboardName);
        if (objective) {
            try {
                for (const participant of objective.getParticipants()) {
                    const score = objective.getScore(participant);
                    if (score !== undefined) {
                        newRank.updateLastKnownScore(participant.displayName, score);
                        const player = world.getAllPlayers().find(p => p.scoreboardIdentity?.id === participant.id);
                        if (player) {
                            const rankName = newRank.getRankNameFromScore(score);
                            newRank.updatePlayerRankTag(player, rankName);
                        }
                    }
                }
            } catch (e) {
                console.error(`ランクシステム '${title}' の初期化中にエラーが発生しました: ${e}`);
            }
        }
    });

    return newRank;
}

/**
 * ランクシステムのメインUIを表示する関数
 * @param {Player} player - UIを表示するプレイヤー
 * @param {any} rankSystem - 対象のランクシステム
 */
export async function showRankListUI(player: Player, rankSystem: any) {
    let playerScore = 0;
    let playerRankName = "未参加";
    let playerRank = 0;
    if (player.scoreboardIdentity) {
        playerScore = rankSystem.getPlayerRankScore(player);
        playerRankName = rankSystem.getRankNameFromScore(playerScore);
        playerRank = rankSystem.getRanking(player);
    } else {
        player.sendMessage("§cランク情報を取得できませんでした。再ログインをお試しください。");
        return;
    }

    const form = new ActionFormData();
    form.title(rankSystem.title);
    form.body(`現在のランク: ${playerRankName}\n現在の順位: ${playerRank > 0 ? `${playerRank}位` : 'ランク外'}\nポイント: ${playerScore}`);
    form.button('ランク帯リスト', 'textures/ui/icon_steve');
    form.button('プレイヤー検索', 'textures/ui/magnifying_glass');
    form.button('トップランキング', 'textures/ui/icon_best3');

    try {
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined) return;

        switch (response.selection) {
            case 0:
                await showRankTiersUI(player, rankSystem);
                break;
            case 1:
                await showSearchPlayerUI(player, rankSystem);
                break;
            case 2:
                await showTopRankingUI(player, rankSystem);
                break;
        }
    } catch (error) {
        console.error("ランクUIの表示中にエラーが発生しました:", error);
    }
}

/**
 * トップランキングを表示する関数
 * @param {Player} player
 * @param {any} rankSystem
 */
async function showTopRankingUI(player: Player, rankSystem: any) {
    const limit = 10;
    const onlineOnly = false;
    let topRanking = rankSystem.getTopRanking(limit);

    if (onlineOnly) {
        const onlinePlayerNames = new Set(world.getAllPlayers().map(p => p.name));
        topRanking = topRanking.filter((entry) => onlinePlayerNames.has(entry.name));
    }

    if (topRanking.length === 0) {
        player.sendMessage(`§c! ${rankSystem.title} に参加しているプレイヤーはいません`);
        system.run(() => showRankListUI(player, rankSystem));
        return;
    }

    const form = new ActionFormData();
    form.title(`${rankSystem.title} トップ${limit}`);
    form.body(`オンライン・オフライン含む`);

    const rankColors = ["§6", "§7", "§e"];

    topRanking.forEach((entry, index) => {
        const rankColor = rankColors[index] ?? '§f';
        const displayName = entry.name === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : entry.name;
        const iconPath = index === 0 ? 'textures/ui/icon_goldmedal' : index === 1 ? 'textures/ui/icon_silvermedal' : index === 2 ? 'textures/ui/icon_bronzemedal' : 'textures/ui/icon_ μόλυβδος';

        form.button(
            `${rankColor}${index + 1}位: ${displayName}§r\nスコア: §e${entry.score}`,
            iconPath
        );
    });

    form.button('戻る', 'textures/ui/undo');

    try {
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined || response.selection === topRanking.length) {
            system.run(() => showRankListUI(player, rankSystem));
            return;
        }

        const selectedEntry = topRanking[response.selection];
        if (selectedEntry && selectedEntry.scoreboardIdentity) {
            await showPlayerInfoUI(player, rankSystem, selectedEntry.scoreboardIdentity, () => showTopRankingUI(player, rankSystem));
        } else {
            player.sendMessage(`§c! 選択されたプレイヤーの情報が見つかりませんでした。`);
            system.run(() => showTopRankingUI(player, rankSystem));
        }
    } catch (error) {
        console.error("トップランキングUIの表示エラー:", error);
        system.run(() => showRankListUI(player, rankSystem));
    }
}

/**
 * ランク帯にいるプレイヤーを表示するUI
 * @param {Player} player
 * @param {any} rankSystem
 */
export async function showRankTiersUI(player: Player, rankSystem: any) {
    const form = new ActionFormData();
    form.title(`${rankSystem.title} ランク一覧`);

    form.button('戻る', 'textures/ui/undo');

    const rankNamesSorted = rankSystem.getAllRankNames();
    const allParticipants = rankSystem.getAllParticipants();

    const buttonData = rankNamesSorted.map(rankTier => {
        const threshold = rankSystem.getRankScoreFromName(rankTier);
        const count = allParticipants.filter((p: Participant) =>
            p.scoreboardIdentity && rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(p.scoreboardIdentity)) === rankTier
        ).length;
        return { rankTier, threshold, count };
    });

    buttonData.forEach(data => {
        form.button(`${data.rankTier} (§e${data.threshold}§r~) (${data.count}人)`, 'textures/ui/icon_steve');
    });

    try {
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined || response.selection === 0) {
            system.run(() => showRankListUI(player, rankSystem));
            return;
        }

        const selectedData = buttonData[response.selection - 1];
        const selectedRank = selectedData.rankTier;

        const sameRankPlayers = allParticipants
            .filter((p: Participant) =>
                p.scoreboardIdentity && rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(p.scoreboardIdentity)) === selectedRank
            )
            .sort((a: Participant, b: Participant) =>
                rankSystem.getPlayerRankScore(b.scoreboardIdentity!) - rankSystem.getPlayerRankScore(a.scoreboardIdentity!)
            );

        if (sameRankPlayers.length === 0) {
            player.sendMessage(`§c現在、${selectedRank} ランクのプレイヤーはいません。`);
            system.run(() => showRankTiersUI(player, rankSystem));
            return;
        }

        await showRankPlayerListUI(player, rankSystem, selectedRank, sameRankPlayers);

    } catch (error) {
        console.error("ランク帯UIの表示エラー:", error);
        system.run(() => showRankListUI(player, rankSystem));
    }
}

/**
 * 特定ランク帯のプレイヤーリストを表示するUI (showRankTiersUIから呼ばれる)
 * @param player
 * @param rankSystem
 * @param rankName
 * @param playersInRank
 */
async function showRankPlayerListUI(player: Player, rankSystem: any, rankName: string, playersInRank: Participant[]) {
    const form = new ActionFormData();
    form.title(`${rankName} ランクのプレイヤー (${playersInRank.length}人)`);
    form.body(`スコア降順`);

    form.button('戻る (ランク帯一覧へ)', 'textures/ui/undo');

    const displayLimit = 20;

    playersInRank.slice(0, displayLimit).forEach((participant: Participant, index: number) => {
        const displayName = participant.name === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : participant.name;
        const score = rankSystem.getPlayerRankScore(participant.scoreboardIdentity!);
        form.button(`${index + 1}. ${displayName}\nスコア: §e${score}`, 'textures/ui/icon_steve');
    });

    if (playersInRank.length > displayLimit) {
        form.button(`...他 ${playersInRank.length - displayLimit}人`, 'textures/ui/arrow_down_large');
    }

    try {//@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined || response.selection === 0) {
            system.run(() => showRankTiersUI(player, rankSystem));
            return;
        }

        const totalButtons = Math.min(displayLimit, playersInRank.length) + 1 + (playersInRank.length > displayLimit ? 1 : 0);
        if (playersInRank.length > displayLimit && response.selection === totalButtons - 1) {
            player.sendMessage(`§e${rankName}ランクには${playersInRank.length}人のプレイヤーがいます。`);
            system.run(() => showRankPlayerListUI(player, rankSystem, rankName, playersInRank));
            return;
        }

        const selectedParticipantData = playersInRank[response.selection - 1];
        if (selectedParticipantData?.scoreboardIdentity) {
            await showPlayerInfoUI(player, rankSystem, selectedParticipantData.scoreboardIdentity, () => showRankPlayerListUI(player, rankSystem, rankName, playersInRank));
        } else {
            player.sendMessage(`§c! 選択されたプレイヤーの情報が見つかりませんでした。`);
            system.run(() => showRankPlayerListUI(player, rankSystem, rankName, playersInRank));
        }
    } catch (error) {
        console.error("ランク別プレイヤーリストUIエラー:", error);
        system.run(() => showRankTiersUI(player, rankSystem));
    }
}

/**
 * プレイヤーの詳細情報を表示するUI (戻り先を指定可能)
 * @param {Player} player
 * @param {any} rankSystem
 * @param {ScoreboardIdentity} participant
 * @param {() => void | Promise<void>} backAction - 戻るボタンを押したときに実行される関数
 */
export async function showPlayerInfoUI(
    player: Player,
    rankSystem: any,
    participant: ScoreboardIdentity,
    backAction: () => void | Promise<void>
) {
    const form = new ActionFormData();
    const displayName = participant.displayName === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : participant.displayName;
    let score = 0;
    let rank = "未参加";
    let overallRank = 0;

    score = rankSystem.getPlayerRankScore(participant);
    rank = rankSystem.getRankNameFromScore(score);
    overallRank = rankSystem.getRanking(participant);

    form.title(`${displayName} のランク情報`);
    form.body(
        `システム: ${rankSystem.title}\n` +
        `ランク: ${rank}\n` +
        `スコア: ${score}\n` +
        `全体順位: ${overallRank > 0 ? `${overallRank}位` : 'ランク外'}`
    );
    form.button('戻る', 'textures/ui/undo');

    try {//@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === 0) {
            system.run(async () => await backAction());
            return;
        }
    } catch (error) {
        console.error("プレイヤー情報UIエラー:", error);
        system.run(async () => await backAction());
    }
}

/**
 * プレイヤーを検索するUI (推測機能、スコア範囲指定)
 * @param {Player} player
 * @param {any} rankSystem
 */
export async function showSearchPlayerUI(player: Player, rankSystem: any) {
    const form = new ModalFormData();
    form.title(`${rankSystem.title} プレイヤー検索`);
    form.textField('名前 (部分一致)', 'プレイヤー名 or オフライン');
    form.textField('最低スコア (任意)', '0');
    form.textField('最高スコア (任意)', '');

    try {//@ts-ignore
        const response = await form.show(player);
        if (response.canceled || !response.formValues) {
            system.run(() => showRankListUI(player, rankSystem));
            return;
        }

        const [nameQuery = '', minScoreStr = '', maxScoreStr = ''] = response.formValues as (string | number)[];
        const lowerCaseNameQuery = String(nameQuery).toLowerCase();
        const minScore = parseInt(String(minScoreStr)) || 0;
        const maxScore = parseInt(String(maxScoreStr));

        let results = rankSystem.getAllParticipants() as Participant[];

        results = results.filter((p: Participant) => {
            const score = p.score;
            const scoreValid = score >= minScore && (isNaN(maxScore) || score <= maxScore);
            return scoreValid;
        });

        if (lowerCaseNameQuery.length > 0) {
            results = results.filter(p =>
                p.name.toLowerCase().includes(lowerCaseNameQuery) ||
                (lowerCaseNameQuery === "オフライン" && p.name === 'commands.scoreboard.players.offlinePlayerName')
            );
        }

        if (results.length === 0) {
            if (String(nameQuery).length > 0) {
                const allParticipantsInScoreRange = (rankSystem.getAllParticipants() as Participant[])
                    .filter(p => {
                        const score = p.score;
                        return score >= minScore && (isNaN(maxScore) || score <= maxScore);
                    })
                    .map(p => p.name)
                    .filter(name => name !== 'commands.scoreboard.players.offlinePlayerName');

                const suggestions = getPlayerNameSuggestions(String(nameQuery), allParticipantsInScoreRange, 3);

                if (suggestions.length > 0) {
                    await showSearchSuggestionsUI(player, rankSystem, String(nameQuery), suggestions, minScore, maxScore);
                    return;
                }
            }
            player.sendMessage(`§c一致するプレイヤーは見つかりませんでした。` + `${(!isNaN(minScore) || !isNaN(maxScore)) ? ` (スコア ${minScore}~${isNaN(maxScore) ? '∞' : maxScore})` : ''}`);
            system.run(() => showSearchPlayerUI(player, rankSystem));
        } else {
            await showSearchResultsUI(player, rankSystem, results, String(nameQuery), minScore, maxScore);
        }

    } catch (error) {
        console.error("検索UIエラー:", error);
        system.run(() => showRankListUI(player, rankSystem));
    }
}

/**
 * 検索候補を表示するUI
 */
async function showSearchSuggestionsUI(
    player: Player,
    rankSystem: any,
    originalQuery: string,
    suggestions: string[],
    minScore: number,
    maxScore: number
) {
    const form = new ActionFormData();
    form.title(`検索候補 - "${originalQuery}"`);
    form.body(`もしかして:\nスコア範囲: ${minScore}~${isNaN(maxScore) ? '∞' : maxScore}`);

    suggestions.forEach(suggestion => {
        const participant = (rankSystem.getAllParticipants() as Participant[]).find(p => p.name === suggestion);
        const scoreDisplay = participant ? `§e${participant.score}` : '§7?';
        form.button(`${suggestion}\nスコア: ${scoreDisplay}`);
    });

    form.button('再検索 / 戻る', 'textures/ui/undo');

    try {//@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined || response.selection === suggestions.length) {
            system.run(() => showSearchPlayerUI(player, rankSystem));
            return;
        }

        const selectedName = suggestions[response.selection];
        let results = (rankSystem.getAllParticipants() as Participant[])
            .filter((p: Participant) => {
                const score = p.score;
                return score >= minScore && (isNaN(maxScore) || score <= maxScore);
            })
            .filter(p => p.name === selectedName);

        await showSearchResultsUI(player, rankSystem, results, selectedName, minScore, maxScore);

    } catch (error) {
        console.error("検索候補UIエラー:", error);
        system.run(() => showSearchPlayerUI(player, rankSystem));
    }
}

/**
 * 検索結果を表示するUI
 */
async function showSearchResultsUI(
    player: Player,
    rankSystem: any,
    results: Participant[],
    query: string,
    minScore: number,
    maxScore: number
) {
    const form = new ActionFormData();
    form.title(`検索結果 (${results.length}件)`);
    form.body(`クエリ: "${query}"\nスコア: ${minScore}~${isNaN(maxScore) ? '∞' : maxScore}\nスコア降順`);

    form.button('再検索 / 戻る', 'textures/ui/undo');

    const displayLimit = 20;
    results
        .sort((a, b) => b.score - a.score)
        .slice(0, displayLimit)
        .forEach((participant, index) => {
            const displayName = participant.name === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : participant.name;
            form.button(`${index + 1}. ${displayName}\nスコア: §e${participant.score}`, 'textures/ui/icon_steve');
        });

    if (results.length > displayLimit) {
        form.button(`...他 ${results.length - displayLimit}人`, 'textures/ui/arrow_down_large');
    }

    try {//@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined || response.selection === 0) {
            system.run(() => showSearchPlayerUI(player, rankSystem));
            return;
        }

        const totalButtons = Math.min(displayLimit, results.length) + 1 + (results.length > displayLimit ? 1 : 0);
        if (results.length > displayLimit && response.selection === totalButtons - 1) {
            player.sendMessage(`§e検索結果が${results.length}件見つかりました。`);
            system.run(() => showSearchResultsUI(player, rankSystem, results, query, minScore, maxScore));
            return;
        }

        const selectedParticipantData = results.sort((a, b) => b.score - a.score)[response.selection - 1];

        if (selectedParticipantData?.scoreboardIdentity) {
            await showPlayerInfoUI(player, rankSystem, selectedParticipantData.scoreboardIdentity, () => showSearchResultsUI(player, rankSystem, results, query, minScore, maxScore));
        } else {
            player.sendMessage(`§c! 選択されたプレイヤーの情報が見つかりませんでした。`);
            system.run(() => showSearchResultsUI(player, rankSystem, results, query, minScore, maxScore));
        }
    } catch (error) {
        console.error("検索結果UIエラー:", error);
        system.run(() => showSearchPlayerUI(player, rankSystem));
    }
}

/**
 * プレイヤー名の推測を取得する関数 (レーベンシュタイン距離)
 * @param {string} inputName - 入力されたプレイヤー名
 * @param {string[]} nameList - 検索対象のプレイヤー名のリスト
 * @param {number} limit - 取得する推測の数
 * @returns {string[]} 推測されたプレイヤー名の配列
 */
function getPlayerNameSuggestions(
    inputName: string,
    nameList: string[],
    limit: number
): string[] {
    const lowerInputName = inputName.toLowerCase();
    const distances = nameList.map((name) => ({
        name: name,
        distance: calculateLevenshteinDistance(lowerInputName, name.toLowerCase()),
    }))
        .sort((a, b) => {
            if (a.distance !== b.distance) {
                return a.distance - b.distance;
            }
            return a.name.localeCompare(b.name);
        });

    const threshold = Math.max(1, Math.floor(inputName.length / 2.5));
    return distances
        .filter(d => d.distance > 0 && d.distance <= threshold)
        .slice(0, limit)
        .map((d) => d.name);
}

/**
 * レーベンシュタイン距離を計算する
 * @param {string} s1
 * @param {string} s2
 * @returns {number} 距離
 */
function calculateLevenshteinDistance(s1: string, s2: string): number {
    if (s1.length < s2.length) { [s1, s2] = [s2, s1]; }

    const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
    const currentRow = Array(s2.length + 1).fill(0);

    for (let i = 0; i < s1.length; i++) {
        currentRow[0] = i + 1;
        for (let j = 0; j < s2.length; j++) {
            const cost = s1[i] === s2[j] ? 0 : 1;
            currentRow[j + 1] = Math.min(
                currentRow[j] + 1,
                previousRow[j + 1] + 1,
                previousRow[j] + cost
            );
        }
        for (let k = 0; k <= s2.length; k++) {
            previousRow[k] = currentRow[k];
        }
    }

    return previousRow[s2.length];
}

/**
 * ランクシステムへのコマンドを処理します。Handlerから呼び出される。
 * @param event - スクリプトイベント
 * @param args - コマンド引数配列 (要素0=システム名, 要素1=サブコマンド, ...)
 * @param rankSystemName - 対象のランクシステム名
 */
function processRankCommand(event: ScriptEventCommandMessageAfterEvent, args: string[], rankSystemName: string) {
    const initiator = event.sourceEntity;

    if (!(initiator instanceof Player)) {
        console.warn("このコマンドはプレイヤーから実行される必要があります。");
        return;
    }
    if (!initiator.scoreboardIdentity) {
        initiator.sendMessage("§cコマンドを実行できませんでした（内部エラー）。再ログインしてください。");
        return;
    }

    const rankSystem = registeredRanks.find((rank) => rank.scoreboardName === rankSystemName);

    if (!rankSystem) {
        initiator.sendMessage(`§cランクシステム '${rankSystemName}' は見つかりません。`);
        const availableSystems = registeredRanks.map(r => r.scoreboardName).join(', ') || 'なし';
        initiator.sendMessage(`§e利用可能なシステム: ${availableSystems}`);
        return;
    }

    const subCommand = args[1]?.toLowerCase() ?? 'list';
    const subArgs = args.slice(2);

    switch (subCommand) {
        case 'join':
            rankSystem.addPlayerToRank(initiator);
            break;
        case 'reset': {
            if (subArgs.length < 1) {
                initiator.sendMessage(`§c使用法: rank ${rankSystemName} reset <プレイヤー名 | all>`);
                return;
            }
            const targetArg = subArgs[0];

            if (targetArg.toLowerCase() === 'all') {
                if (initiator.isOp()) {
                    rankSystem.resetAllPlayersRank();
                    initiator.sendMessage(`§a[${rankSystem.title}] 全参加者のランクをリセットしました。`);
                } else {
                    initiator.sendMessage('§cこの操作を実行する権限がありません。');
                }
            } else {
                if (!initiator.isOp()) {
                    initiator.sendMessage('§c他のプレイヤーのランクをリセットする権限がありません。');
                    return;
                }

                const objective = world.scoreboard.getObjective(rankSystem.scoreboardName);
                if (!objective) {
                    initiator.sendMessage(`§cスコアボード '${rankSystem.scoreboardName}' が見つかりません。`);
                    return;
                }
                const targetParticipant = objective.getParticipants().find(p => p.displayName === targetArg);

                if (targetParticipant) {
                    rankSystem.resetPlayerRank(targetParticipant);
                    initiator.sendMessage(`§a参加者 ${targetParticipant.displayName} のランクをリセットしました。`);
                } else {
                    initiator.sendMessage(`§c参加者 '${targetArg}' が見つかりません。`);
                }
            }
            break;
        }
        case 'add':
        case 'remove': {
            if (!initiator.isOp()) {
                initiator.sendMessage('§cこの操作を実行する権限がありません。');
                return;
            }
            if (subArgs.length < 2) {
                initiator.sendMessage(`§c使用法: rank ${rankSystemName} ${subCommand} <プレイヤー名> <値>`);
                return;
            }
            const targetArg = subArgs[0];
            const scoreChange = parseInt(subArgs[1]);

            if (isNaN(scoreChange) || scoreChange <= 0) {
                initiator.sendMessage('§cエラー: 値には正の整数を指定してください。');
                return;
            }

            const objective = world.scoreboard.getObjective(rankSystem.scoreboardName);
            if (!objective) {
                initiator.sendMessage(`§cスコアボード '${rankSystem.scoreboardName}' が見つかりません。`);
                return;
            }
            const targetParticipant = objective.getParticipants().find(p => p.displayName === targetArg);

            if (targetParticipant) {
                const currentScore = rankSystem.getPlayerRankScore(targetParticipant);
                let newScore = subCommand === 'add' ? currentScore + scoreChange : currentScore - scoreChange;
                newScore = Math.max(0, newScore);

                rankSystem.updatePlayerRank(targetParticipant, newScore);
                initiator.sendMessage(`§a参加者 ${targetParticipant.displayName} のスコアを ${scoreChange} ${subCommand === 'add' ? '加算' : '減算'}しました (新スコア: ${newScore})。`);
            } else {
                initiator.sendMessage(`§c参加者 '${targetArg}' が見つかりません。`);
            }
            break;
        }
        case 'list': {
            const listOption = subArgs[0]?.toLowerCase() ?? 'info';
            const listArgs = subArgs.slice(1);

            switch (listOption) {
                case 'info':
                    const rankScore = rankSystem.getPlayerRankScore(initiator);
                    const currentRank = rankSystem.getRankNameFromScore(rankScore);
                    const playerRank = rankSystem.getRanking(initiator);
                    initiator.sendMessage(
                        `§e§l== あなたのランク情報 (${rankSystem.title}) ==\n§r§6ランク: §a${currentRank}\n§6ポイント: §a${rankScore}\n§6順位: §a${playerRank > 0 ? `${playerRank}位` : 'ランク外'}\n§r`,
                    );
                    break;
                case 'ui':
                    showRankListUI(initiator, rankSystem);
                    break;
                case 'show': {
                    const viewDirectionHit = initiator.getEntitiesFromViewDirection({ maxDistance: 10 });
                    if (viewDirectionHit.length === 0 || !(viewDirectionHit[0].entity instanceof Player) || !viewDirectionHit[0].entity.scoreboardIdentity) {
                        initiator.sendMessage(`§c見ている先に情報表示可能なプレイヤーがいません。`);
                        return;
                    }
                    const targetEntity = viewDirectionHit[0].entity as Player;
                    const targetScore = rankSystem.getPlayerRankScore(targetEntity);
                    const targetRankName = rankSystem.getRankNameFromScore(targetScore);
                    const targetOverallRank = rankSystem.getRanking(targetEntity);
                    initiator.sendMessage(`§e§l== ${targetEntity.name} のランク情報 (${rankSystem.title}) ==\n§r§6ランク: §a${targetRankName}\n§6ポイント: §a${targetScore}\n§6順位: §a${targetOverallRank > 0 ? `${targetOverallRank}位` : 'ランク外'}\n§r`);
                    break;
                }
                case 'rank': {
                    const limit = parseInt(listArgs[0]) || 5;
                    const onlineOnly = listArgs[1]?.toLowerCase() === 'online';
                    let topRanking = rankSystem.getTopRanking(limit);
                    if (onlineOnly) {
                        const onlinePlayerNames = new Set(world.getAllPlayers().map(p => p.name));
                        topRanking = topRanking.filter((entry) => onlinePlayerNames.has(entry.name));
                    }
                    if (topRanking.length === 0) {
                        initiator.sendMessage(`§c${rankSystem.title} に参加している${onlineOnly ? 'オンライン' : ''}プレイヤーはいません`);
                        return;
                    }
                    const rankTitle = `§b§l[${rankSystem.title} ランキング Top ${limit}${onlineOnly ? ' (オンラインのみ)' : ''}]`;
                    const rankingMessages = [
                        rankTitle,
                        ...topRanking.map((entry, index) => {
                            const rankColor = index === 0 ? '§6' : index === 1 ? '§7' : index === 2 ? '§e' : '§f';
                            const displayName = entry.name === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : entry.name;
                            return ` §b${index + 1}位: ${rankColor}${displayName} §r§7- §e${entry.score}pt`;
                        }),
                    ];
                    initiator.sendMessage(rankingMessages.join('\n'));
                    break;
                }
                case 'check': {
                    const playerRankName = rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(initiator));
                    const limit = parseInt(listArgs[0]) || 5;
                    const sameRankPlayers = rankSystem.getAllParticipants().filter((p: Participant) =>
                        p.scoreboardIdentity && rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(p.scoreboardIdentity)) === playerRankName
                    )
                        .sort((a: Participant, b: Participant) => rankSystem.getPlayerRankScore(b.scoreboardIdentity!) - rankSystem.getPlayerRankScore(a.scoreboardIdentity!));

                    if (sameRankPlayers.length === 0) {
                        initiator.sendMessage(`§c現在、あなたと同じ ${playerRankName} ランクのプレイヤーはいません。`);
                        return;
                    }
                    const rankCheckMessages = [
                        `§b§l[${rankSystem.title} ${playerRankName} ランク一覧 (Top ${Math.min(limit, sameRankPlayers.length)})]`,
                        ...sameRankPlayers.slice(0, limit).map((entry, index) => {
                            const displayName = entry.name === 'commands.scoreboard.players.offlinePlayerName' ? '§7オフライン§r' : entry.name;
                            const isSelf = entry.scoreboardIdentity?.id === initiator.scoreboardIdentity?.id;
                            return `${isSelf ? '§a>>' : '  '}§b${index + 1}: §f${displayName} §r§7- §e${rankSystem.getPlayerRankScore(entry.scoreboardIdentity!)}pt`;
                        }),
                    ];
                    initiator.sendMessage(rankCheckMessages.join('\n'));
                    break;
                }
                case 'all': {
                    const allRankNames = rankSystem.getAllRankNames();
                    const playerRankName = rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(initiator));
                    const sortOrder = listArgs[0]?.toLowerCase() === 'desc' ? 'desc' : 'asc';
                    const rankAllMessages = [
                        `§b§l[${rankSystem.title} 全ランク一覧 (${sortOrder === 'asc' ? '昇順' : '降順'})]`,
                        ...(sortOrder === 'asc' ? allRankNames : [...allRankNames].reverse()).map(
                            (rankName) => {
                                const isPlayerRank = rankName === playerRankName;
                                const threshold = rankSystem.getRankScoreFromName(rankName);
                                const count = rankSystem.getAllParticipants().filter((p: Participant) =>
                                    p.scoreboardIdentity && rankSystem.getRankNameFromScore(rankSystem.getPlayerRankScore(p.scoreboardIdentity)) === rankName
                                ).length;
                                return `${isPlayerRank ? '§a>>' : '  '}§b${rankName} §r(§e${threshold}pt§r~) §7(${count}人)`;
                            },
                        ),
                    ];
                    initiator.sendMessage(rankAllMessages.join('\n'));
                    break;
                }
                default:
                    initiator.sendMessage(`§c不明な list オプション: ${listOption}`);
                    initiator.sendMessage(`§e利用可能なオプション: info, ui, show, rank [件数] [online], check [件数], all [asc|desc]`);
                    break;
            }
            break;
        }
        default:
            initiator.sendMessage(`§c不明なサブコマンド: ${subCommand}`);
            initiator.sendMessage('§e利用可能なサブコマンド: join, reset, add, remove, list');
            break;
    }
}

/**
 * Handlerにランク関連コマンドを登録します。
 * @param {Handler} handler - Handlerクラスのインスタンス
 * @param {string} moduleName - このコマンドが属するモジュール名
 */
export function registerRankCommands(handler: Handler, moduleName: string) {

    handler.registerCommand('rank', {
        moduleName: moduleName,
        description: "ランクシステムの管理・情報表示を行います。",
        usage: "rank <システム名> [サブコマンド] [...]",
        execute: (_message, event, args) => {

            if (args.length < 2) {
                const initiator = event.sourceEntity;
                if (initiator instanceof Player) {
                    initiator.sendMessage(`§c使用法: rank <システム名> [サブコマンド] [...]`);
                    const availableSystems = registeredRanks.map(r => r.scoreboardName).join(', ') || 'なし';
                    initiator.sendMessage(`§e利用可能なシステム: ${availableSystems}`);
                }
                return;
            }
            const systemName = args[1];
            processRankCommand(event, args.slice(1), systemName);
        },
    });

    handler.registerCommand('registerRank', {
        moduleName: moduleName,
        description: "新しいランクシステムを登録します。",
        usage: "registerRank <タイトル> <スコアボード名> <ランク名,...> <閾値,...>",
        execute: (_message, event, args) => {
            const initiator = event.sourceEntity;

            if (!(initiator instanceof Player)) {
                console.warn("§c'registerRank'コマンドはプレイヤーのみ実行できます。");
                return;
            }

            if (!initiator.isOp()) {
                initiator.sendMessage("§cこのコマンドを実行する権限がありません。");
                return;
            }

            if (args.length !== 5) {
                initiator.sendMessage(`§c引数の数が正しくありません。\n使用法: registerRank <タイトル> <スコアボード名> <ランク名,...> <閾値,...>`);
                return;
            }

            const title = args[1];
            const scoreboardName = args[2];
            const rankNamesStr = args[3];
            const thresholdsStr = args[4];

            const rankNames = rankNamesStr.split(',').map(name => name.trim()).filter(name => name.length > 0);
            const thresholds = thresholdsStr.split(',').map(Number);

            if (rankNames.length === 0 || thresholds.length === 0) {
                initiator.sendMessage("§cランク名または閾値が指定されていません。カンマ区切りで1つ以上指定してください。");
                return;
            }
            if (rankNames.length !== thresholds.length) {
                initiator.sendMessage("§cランク名の数と閾値の数が一致しません。");
                return;
            }
            if (thresholds.some(isNaN)) {
                initiator.sendMessage("§c閾値には有効な数値をカンマ区切りで指定してください。");
                return;
            }
            for (let i = 0; i < thresholds.length - 1; i++) {
                if (thresholds[i] >= thresholds[i + 1]) {
                    initiator.sendMessage(`§c閾値は昇順で指定する必要があります。(例: 0,100,500)\n検出箇所: ${thresholds[i]} >= ${thresholds[i + 1]}`);
                    return;
                }
            }

            try {
                if (world.scoreboard.getObjective(scoreboardName)) {
                    if (registeredRanks.some(r => r.scoreboardName === scoreboardName)) {
                        initiator.sendMessage(`§cエラー: スコアボード名 '${scoreboardName}' は既に別のランクシステムで使われています。`);
                        return;
                    }
                    initiator.sendMessage(`§cエラー: スコアボード名 '${scoreboardName}' は既に存在します。別の名前を指定してください。`);
                    return;
                }

                registerRank(title, scoreboardName, rankNames, thresholds);
            } catch (error: any) {
                initiator.sendMessage(`§cランクシステムの登録に失敗しました: ${error.message}`);
                console.error(`ランクシステム登録エラー (${title}, ${scoreboardName}):`, error);
            }
        },
    });
}