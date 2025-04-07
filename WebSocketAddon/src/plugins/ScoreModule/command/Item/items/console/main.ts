import {
    Player,
    system,
    Vector3,
    EntityQueryOptions,
    GameMode,
    Dimension, // Dimension をインポート
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem"; // Adjust path as needed
import { registerCustomItem } from "../../custom"; // Adjust path as needed

// --- チームタグ定義 ---
const TEAM_TAGS = ["team1", "team2", "team3", "team4", "team5"];
const INTERVAL = 20; // tick (1秒)

// --- ヘルパー関数: プレイヤーのチームタグを取得 ---
function getPlayerTeamTag(player: Player): string | undefined {
    if (!player || !player.isValid) return undefined;
    const tags = player.getTags();
    return tags.find(tag => TEAM_TAGS.includes(tag));
}

// --- ヘルパー関数: ランダム座標生成 (変更なし) ---
function getRandomCoordinate(
    center: number,
    minRadius: number,
    maxRadius: number,
    min: number,
    max: number
): number {
    let coord: number;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    // Ensure coordinate stays within min/max world boundaries if the random offset pushes it outside
    do {
        // Generate a coordinate offset within [-radius, +radius] relative to the center
        const offset = (Math.random() * 2 - 1) * radius;
        coord = center + offset;
    } while (coord < min || coord > max); // Re-roll if outside world bounds
    // It's also possible the loop could be infinite if center is too close to min/max
    // and radius is large, but for typical player locations this is unlikely.
    // A safer approach might clamp the value after generation:
    // coord = Math.max(min, Math.min(max, center + offset));
    // Let's stick to the original re-roll logic for now.
    return coord;
}


// --- Consoleアイテムのアクション関数 (チーム対応版) ---
function runConsoleAction(player: Player, consoleItem: CustomItem) {
    // runではなくtry-catchで囲むか、run内でtry-catchを使う
    system.run(() => {
        try { // system.run 内でエラーハンドリングを行う
            const playerLocation = player.location;
            const dimension: Dimension = player.dimension; // playerからdimensionを取得
            const userTeamTag = getPlayerTeamTag(player); // 使用者のチームタグを取得
            console.log(`[Console] 使用者 ${player.name} のチーム: ${userTeamTag ?? 'なし'}`); // デバッグ用
            const RADIUS = 5;
            const TELEPORT_RADIUS = 2;
            const MIN_TELEPORT_RADIUS = 1;
            const DURATION = 10; // 秒
            const INTERVAL = 20; // tick (1秒)

            const MIN_X = -30000000;
            const MAX_X = 30000000;
            const MIN_Y = -64;
            const MAX_Y = 320;
            const MIN_Z = -30000000;
            const MAX_Z = 30000000;

            // 境界チェック (変更なし)
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

            // パーティクルとサウンド (使用者位置) (変更なし)
            dimension.spawnParticle("minecraft:end_chest", {
                x: playerLocation.x,
                y: playerLocation.y + 1,
                z: playerLocation.z,
            });
            player.playSound("random.levelup", { volume: 1, pitch: 0.8 });

            // システムメッセージ (使用者へ) (変更なし)
            player.sendMessage("§bConsole§aを使用しました！");

            // --- 付近のプレイヤーを検索 ---
            const options: EntityQueryOptions = {
                location: playerLocation,
                maxDistance: RADIUS,
                excludeNames: [player.name], // 自分自身は除外
                type: "minecraft:player",
                excludeGameModes: [GameMode.spectator, GameMode.creative],
                // excludeTags はここでは使用せず、後でフィルタリングする
            };

            const nearbyPlayers = Array.from(
                dimension.getEntities(options)
            ) as Player[];

            // --- チームフィルター ---
            const filteredPlayers = nearbyPlayers.filter(target => {
                if (!target || !target.isValid) return false; // 無効なプレイヤーは除外
                const targetTeamTag = getPlayerTeamTag(target);
                // 使用者がチームに所属しており、かつターゲットも同じチームタグを持っている場合は除外
                if (userTeamTag && targetTeamTag === userTeamTag) {
                    console.log(`[Console] ${target.name} はチームメイトのため除外`); // デバッグ用
                    return false; // 除外
                }
                return true; // 対象に含める
            });

            if (filteredPlayers.length > 0) {
                // --- フィルタリングされたリストからランダムなターゲットを選択 ---
                const targetPlayer =
                    filteredPlayers[Math.floor(Math.random() * filteredPlayers.length)];

                // --- 有効なターゲットが見つかった場合のみアイテムを消費 ---
                consoleItem.removeItem(player, consoleItem.get()); // removeItemとgetメソッドがあると仮定

                targetPlayer.sendMessage("§6あなたは§bConsole§6の影響を受けました");
                console.log(`[Console] ${player.name} が ${targetPlayer.name} をターゲットにしました`); // デバッグ用

                let ticksPassed = 0;
                const totalTicks = DURATION * 20;
                let teleportIntervalId: number | undefined = undefined;

                teleportIntervalId = system.runInterval(() => {
                    // --- インターバル内の処理 ---
                    try { // インターバル内のエラーもキャッチ
                        // ターゲットの有効性チェック
                        if (!targetPlayer || !targetPlayer.isValid) {
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined; // クリアしたことを記録
                            }
                            console.log(`[Console] ターゲット ${targetPlayer?.name ?? '不明'} が無効になりました。`); // デバッグ用
                            // 使用者への通知は任意
                            // player.sendMessage("§c対象プレイヤーが無効になったため、効果が中断されました。");
                            return;
                        }

                        // Y座標チェック (変更なし)
                        if (targetPlayer.location.y <= -62) {
                            targetPlayer.sendMessage("§cテレポートが中断されました（Y座標が-62以下）");
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined;
                            }
                            return;
                        }

                        // 効果時間チェック (変更なし)
                        if (ticksPassed >= totalTicks) {
                            if (teleportIntervalId !== undefined) {
                                system.clearRun(teleportIntervalId);
                                teleportIntervalId = undefined;
                            }
                            targetPlayer.sendMessage("§bConsole§aの効果が終了しました");
                            return;
                        }

                        // --- テレポート実行ロジック ---
                        const currentTargetLoc = targetPlayer.location;
                        const currentTargetDim = targetPlayer.dimension;

                        let randomX = getRandomCoordinate(
                            currentTargetLoc.x,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_X,
                            MAX_X
                        );
                        let randomY = getRandomCoordinate(
                            currentTargetLoc.y,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_Y,
                            MAX_Y
                        );
                        let randomZ = getRandomCoordinate(
                            currentTargetLoc.z,
                            MIN_TELEPORT_RADIUS,
                            TELEPORT_RADIUS,
                            MIN_Z,
                            MAX_Z
                        );

                        // Y座標のクランプ (変更なし)
                        randomY = Math.max(Math.min(randomY, MAX_Y), -61);

                        const targetLocation: Vector3 = { x: randomX, y: randomY, z: randomZ };

                        // テレポート実行
                        targetPlayer.teleport(targetLocation, {
                            dimension: currentTargetDim,
                        });

                        // エフェクト (テレポート先) (変更なし)
                        currentTargetDim.spawnParticle("minecraft:large_explosion", targetLocation);
                        targetPlayer.playSound("mob.endermen.portal", {
                            location: targetLocation,
                            volume: 0.5,
                            pitch: 1.2,
                        });

                    } catch (intervalError) {
                        console.error(`[Console] テレポートインターバル中にエラー: ${intervalError}`);
                        targetPlayer?.sendMessage("§cテレポート中にエラーが発生しました。"); // ターゲットがまだ有効ならメッセージ送信
                        if (teleportIntervalId !== undefined) {
                            system.clearRun(teleportIntervalId);
                            teleportIntervalId = undefined;
                        }
                    }

                    ticksPassed += INTERVAL; // 経過ティックを加算

                }, INTERVAL); // 指定間隔で実行

            } else {
                // ターゲットが見つからなかった場合のメッセージ
                const teammatesNearby = nearbyPlayers.length > 0 && filteredPlayers.length === 0;
                if (teammatesNearby) {
                    player.sendMessage("§c効果範囲内には対象となるプレイヤー（チームメイトを除く）がいません");
                } else {
                    player.sendMessage("§c効果範囲内に他のプレイヤーがいません");
                }
                // アイテムは消費されない
            }
        } catch (actionError) {
            console.error(`[Console] アイテム使用アクション中にエラー: ${actionError}`);
            player?.sendMessage("§cConsoleの使用中に予期せぬエラーが発生しました。"); // playerが有効ならメッセージ送信
        }
    });
}

// --- カスタムアイテム定義 (lore修正) ---
const consoleItem = new CustomItem({
    name: "§bConsole",
    lore: [
        "§7使用すると周囲の§c敵プレイヤー§7を", // 説明を明確化
        "§7ランダムな位置にテレポートさせる",
        `§7効果範囲: §a${5}m§7 / 効果時間: §a${10}秒`, // 定数を参照するように変更も可
        `§7テレポート間隔: §a${INTERVAL / 20}秒`,
        "§7(§c使用者§7, §c同じチーム§7,", // チーム対応を明記
        "§cｸﾘｴｲﾃｨﾌﾞ§7, §cｽﾍﾟｸﾃｲﾀｰ§7を除く)",
    ],
    item: "minecraft:ender_eye",
    amount: 1,
    // remove: false, // アイテム消費はアクション関数内で制御
});

// --- イベント処理 (変更なし) ---
consoleItem.then((player: Player, _eventData) => {
    // イベントソースがPlayerインスタンスであることを確認する方がより安全
        runConsoleAction(player, consoleItem);
});

// --- 登録 (変更なし) ---
try {
    registerCustomItem(17, consoleItem); // IDを確認
    // console.log("[Console] カスタムアイテム 'consoleItem' をID 17で登録しました。");
} catch (e) {
    console.error(`[Console] ID 17でのカスタムアイテム登録に失敗: ${e}`);
}