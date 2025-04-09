import {
    Player,
    system,
    EntityQueryOptions,
    GameMode,
    Dimension,
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";
import { Vector3 } from "../../../../../../module/Vector3";

const TEAM_TAGS = ["team1", "team2", "team3", "team4", "team5"];
const INTERVAL = 20;

function getPlayerTeamTag(player: Player): string | undefined {
    if (!player || !player.isValid) return undefined;
    const tags = player.getTags();
    return tags.find(tag => TEAM_TAGS.includes(tag));
}

function getRandomCoordinate(
    center: number,
    minRadius: number,
    maxRadius: number,
    min: number,
    max: number
): number {
    let coord: number;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    do {
        const offset = (Math.random() * 2 - 1) * radius;
        coord = center + offset;
    } while (coord < min || coord > max);
    return coord;
}

function runConsoleAction(player: Player, consoleItem: CustomItem) {
    system.run(() => {
        try {
            const playerLocation = new Vector3(player.location.x, player.location.y, player.location.z);
            const dimension: Dimension = player.dimension;
            const userTeamTag = getPlayerTeamTag(player);
            const RADIUS = 5;
            const TELEPORT_RADIUS = 2;
            const MIN_TELEPORT_RADIUS = 1;
            const DURATION = 10;
            const INTERVAL_TICKS = 20;

            const MIN_X = -30000000;
            const MAX_X = 30000000;
            const MIN_Y = -64;
            const MAX_Y = 320;
            const MIN_Z = -30000000;
            const MAX_Z = 30000000;

            if (
                playerLocation.x < MIN_X ||
                playerLocation.x > MAX_X ||
                playerLocation.y < MIN_Y ||
                playerLocation.y > MAX_Y ||
                playerLocation.z < MIN_Z ||
                playerLocation.z > MAX_Z
            ) {
                player.sendMessage("§c[警告] 境界の外では使用できません！");
                return;
            }

            dimension.spawnParticle("minecraft:end_chest", playerLocation.add(new Vector3(0, 1, 0)));
            player.playSound("random.levelup", { location: playerLocation, volume: 1, pitch: 0.8 });

            player.sendMessage("§bConsole§aを使用しました！");

            const options: EntityQueryOptions = {
                location: playerLocation,
                maxDistance: RADIUS,
                excludeNames: [player.name],
                type: "minecraft:player",
                excludeGameModes: [GameMode.spectator, GameMode.creative],
            };

            const nearbyPlayers = Array.from(
                dimension.getEntities(options)
            ) as Player[];

            const filteredPlayers = nearbyPlayers.filter(target => {
                if (!target || !target.isValid) return false;
                const targetTeamTag = getPlayerTeamTag(target);
                if (userTeamTag && targetTeamTag === userTeamTag) {
                    return false;
                }
                return true;
            });

            if (filteredPlayers.length > 0) {
                const targetPlayer =
                    filteredPlayers[Math.floor(Math.random() * filteredPlayers.length)];

                consoleItem.removeItem(player, consoleItem.get());

                targetPlayer.sendMessage("§6あなたは§bConsole§6の影響を受けました");

                let ticksPassed = 0;
                const totalTicks = DURATION * 20;
                let teleportIntervalId: number | undefined = undefined;
                const currentTargetLocVec = new Vector3(); // 使い回すVector3
                const targetLocationVec = new Vector3(); // 使い回すVector3

                teleportIntervalId = system.runInterval(() => {
                    try {
                        if (!targetPlayer || !targetPlayer.isValid) {
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined;
                            }
                            return;
                        }

                        currentTargetLocVec.set(targetPlayer.location.x, targetPlayer.location.y, targetPlayer.location.z);
                        const currentTargetDim = targetPlayer.dimension;

                        if (currentTargetLocVec.y <= -62) {
                            targetPlayer.sendMessage("§cテレポートが中断されました（Y座標が-62以下）");
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined;
                            }
                            return;
                        }

                        if (ticksPassed >= totalTicks) {
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined;
                            }
                            targetPlayer.sendMessage("§bConsole§aの効果が終了しました");
                            return;
                        }

                        let randomX = getRandomCoordinate(
                            currentTargetLocVec.x,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_X,
                            MAX_X
                        );
                        let randomY = getRandomCoordinate(
                            currentTargetLocVec.y,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_Y,
                            MAX_Y
                        );
                        let randomZ = getRandomCoordinate(
                            currentTargetLocVec.z,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_Z,
                            MAX_Z
                        );

                        randomY = Math.max(Math.min(randomY, MAX_Y), -61);

                        targetLocationVec.set(randomX, randomY, randomZ);

                        targetPlayer.teleport(targetLocationVec, {
                            dimension: currentTargetDim,
                        });

                        currentTargetDim.spawnParticle("minecraft:large_explosion", targetLocationVec);
                        targetPlayer.playSound("mob.endermen.portal", {
                            location: targetLocationVec,
                            volume: 0.5,
                            pitch: 1.2,
                        });

                    } catch (intervalError) {
                        console.error(`[Console] テレポートインターバル中にエラー: ${intervalError}`);
                        if (targetPlayer?.isValid) {
                            targetPlayer.sendMessage("§cテレポート中にエラーが発生しました。");
                        }
                        if (teleportIntervalId !== undefined) {
                            system.clearRun(teleportIntervalId);
                            teleportIntervalId = undefined;
                        }
                    }
                    ticksPassed += INTERVAL_TICKS;
                }, INTERVAL_TICKS);

            } else {
                const teammatesNearby = nearbyPlayers.length > 0 && filteredPlayers.length === 0;
                if (teammatesNearby) {
                    player.sendMessage("§c効果範囲内には対象となるプレイヤー（チームメイトを除く）がいません");
                } else {
                    player.sendMessage("§c効果範囲内に他のプレイヤーがいません");
                }
            }
        } catch (actionError) {
            console.error(`[Console] アイテム使用アクション中にエラー: ${actionError}`);
            if (player?.isValid) {
                player.sendMessage("§cConsoleの使用中に予期せぬエラーが発生しました。");
            }
        }
    });
}

const consoleItem = new CustomItem({
    name: "§bConsole",
    lore: [
        "§7使用すると周囲の§c敵プレイヤー§7を",
        "§7ランダムな位置にテレポートさせる",
        `§7効果範囲: §a5m§7 / 効果時間: §a10秒`,
        `§7テレポート間隔: §a${INTERVAL / 20}秒`,
        "§7(§c使用者§7, §c同じチーム§7,",
        "§cｸﾘｴｲﾃｨﾌﾞ§7, §cｽﾍﾟｸﾃｲﾀｰ§7を除く)",
    ],
    item: "minecraft:ender_eye",
    amount: 1,
});

consoleItem.then((player: Player, _eventData) => {
    if (player instanceof Player && player.isValid) {
        runConsoleAction(player, consoleItem);
    }
});

try {
    registerCustomItem(17, consoleItem);
} catch (e) {
    console.error(`[Console] ID 17でのカスタムアイテム登録に失敗: ${e}`);
}