    import {
    Player, Dimension, Vector3, system, TeleportOptions, Entity, ExplosionOptions,
    EntityQueryOptions, GameMode, EffectTypes,
    VectorXZ,
    EntityDamageCause
} from "@minecraft/server";
import { CustomItem, CustomItemEventData, EventType } from "../../../../utils/CustomItem"; // パスは環境に合わせてください
import { registerCustomItem } from "../../custom"; // パスは環境に合わせてください
import { Vector } from "../../../../../../module/Vector"; // カスタムVectorモジュールのインポート

// --- チームタグ定義 ---
const TEAM_TAGS = ["team1", "team2", "team3", "team4", "team5"];

// --- ヘルパー関数: プレイヤーのチームタグを取得 ---
function getPlayerTeamTag(player: Player): string | undefined {
    if (!player || !player.isValid) return undefined;
    const tags = player.getTags();
    return tags.find(tag => TEAM_TAGS.includes(tag));
}


// --- 瞬歩の巻物 (Blink Scroll) --- (変更なし)
const BLINK_HORIZONTAL_RADIUS = 6;
const BLINK_MIN_UPWARD_TELEPORT = 1;
const BLINK_MAX_UPWARD_TELEPORT = 15;

function blinkAction(player: Player) {
    const playerDimension: Dimension = player.dimension;
    const playerLocation: Vector3 = player.location;

    const randomXOffset = Math.floor(Math.random() * (BLINK_HORIZONTAL_RADIUS * 2 + 1)) - BLINK_HORIZONTAL_RADIUS;
    const randomZOffset = Math.floor(Math.random() * (BLINK_HORIZONTAL_RADIUS * 2 + 1)) - BLINK_HORIZONTAL_RADIUS;
    const randomYOffset = Math.floor(Math.random() * (BLINK_MAX_UPWARD_TELEPORT - BLINK_MIN_UPWARD_TELEPORT + 1)) + BLINK_MIN_UPWARD_TELEPORT;

    const targetTeleportLocation: Vector3 = {
        x: Math.floor(playerLocation.x) + randomXOffset + 0.5,
        y: playerLocation.y + randomYOffset,
        z: Math.floor(playerLocation.z) + randomZOffset + 0.5
    };

    const teleportOptions: TeleportOptions = {
        checkForBlocks: true,
        dimension: playerDimension,
        facingLocation: player.getHeadLocation(),
        keepVelocity: false
    };

    try {
        playerDimension.playSound("mob.endermen.portal", playerLocation, { volume: 0.8, pitch: 1.2 });
        player.teleport(targetTeleportLocation, teleportOptions);

        // テレポート成功後に実行 (テレポートは非同期の場合があるため run で遅延)
        system.run(() => {
            try {
                // player.location はテレポート後の位置を指すはず
                const destinationLocation: Vector3 = player.location;
                playerDimension.playSound("mob.endermen.portal", destinationLocation, { volume: 0.8, pitch: 1.5 });
                player.sendMessage("§b瞬歩！ - §aランダムな地点§fへ移動した為[§b瞬歩の巻物§f]は消失した。");
            } catch (effectError) {
                console.warn(`[Blink Scroll] Error playing post-teleport effects: ${effectError}`);
            }
        });

    } catch (error: any) {
        // teleportが失敗した場合のエラーハンドリング
        player.sendMessage("§c障害物があり、その場所に移動できませんでした。");
        try {
            playerDimension.playSound("note.bass", playerLocation, { volume: 1.0, pitch: 0.8 });
        } catch (soundError) {
            console.warn(`[Blink Scroll] Error playing failure sound: ${soundError}`);
        }
        console.warn(`[Blink Scroll] Teleport failed: ${error}`);
        // 失敗した場合、remove: true でアイテムが消費されるか確認が必要
        // CustomItem の実装によるが、通常イベントハンドラ終了時に消費される
        // 失敗時に消費させたくない場合は、手動でアイテムを戻すロジックが必要
    }
}

const blinkScrollItem = new CustomItem({
    name: "§b瞬歩の巻物",
    lore: [
        "§7使用すると、周囲のランダムな地点へ",
        "§7瞬間移動する。",
        `§7(水平半径${BLINK_HORIZONTAL_RADIUS}m, 上方${BLINK_MIN_UPWARD_TELEPORT}-${BLINK_MAX_UPWARD_TELEPORT}m)`,
        "§c壁の中へは移動できない。",
        "§8巻物カテゴリ",
    ],
    item: "minecraft:flow_banner_pattern",
    amount: 1,
    remove: true, // teleport の成否に関わらず消費される可能性がある
});

blinkScrollItem.then((player: Player, eventData: any) => {
    const user = eventData?.source instanceof Player ? eventData.source : player;
    if (eventData.eventType === EventType.ItemUse && user?.isValid) {
        // system.runは不要かもしれない (blinkAction内で非同期処理を扱っているため)
        // ただし、他のアイテムと一貫性を保つために残しても良い
        system.run(() => blinkAction(user));
    }
});

const BLINK_SCROLL_ITEM_ID = 20;
try {
    registerCustomItem(BLINK_SCROLL_ITEM_ID, blinkScrollItem);
} catch (e) { console.error(`[Scrolls] Blink Scroll (ID ${BLINK_SCROLL_ITEM_ID}) registration failed: ${e}`); }


// --- 爆発の巻物 (Explosion Scroll) --- (変更なし)
const EXPLOSION_RADIUS = 4;
const EXPLOSION_BREAKS_BLOCKS = true;
const EXPLOSION_CAUSES_FIRE = false;

function explosionAction(player: Player) {
    const playerDimension: Dimension = player.dimension;
    const playerLocation: Vector3 = player.location;

    try {
        playerDimension.playSound("random.fuse", playerLocation, { volume: 1.0, pitch: 1.0 });

        const explosionOptions: ExplosionOptions = {
            breaksBlocks: EXPLOSION_BREAKS_BLOCKS,
            causesFire: EXPLOSION_CAUSES_FIRE,
            source: player // 爆発源を使用者として記録
        };
        // 爆発を少し遅延させて音と同期させることも考慮できる
        // system.runTimeout(() => {
        playerDimension.createExplosion(playerLocation, EXPLOSION_RADIUS, explosionOptions);
        // 爆発成功メッセージは不要かもしれない（爆発自体がフィードバックのため）
        // player.sendMessage("§c爆発！"); // 必要なら追加
        // }, 5); // 例: 5 tick (0.25秒) 遅延

    } catch (error: any) {
        player.sendMessage("§c爆発の巻物の使用に失敗しました。");
        console.warn(`[Explosion Scroll] Failed: ${error}`);
    }
}

const explosionScrollItem = new CustomItem({
    name: "§c爆発の巻物",
    lore: [
        "§7使用すると、使用者を中心に",
        `§7強力な爆発(半径§c${EXPLOSION_RADIUS}m§7)を引き起こす。`,
        "§c使用者自身も巻き込まれる！",
        "§8巻物カテゴリ",
    ],
    item: "minecraft:flower_banner_pattern",
    amount: 1,
    remove: true,
});

explosionScrollItem.then((player: Player, eventData: any) => {
    const user = eventData?.source instanceof Player ? eventData.source : player;
    if (eventData.eventType === EventType.ItemUse && user?.isValid) {
        system.run(() => explosionAction(user));
    }
});

const EXPLOSION_SCROLL_ITEM_ID = 21;
try {
    registerCustomItem(EXPLOSION_SCROLL_ITEM_ID, explosionScrollItem);
} catch (e) { console.error(`[Scrolls] Explosion Scroll (ID ${EXPLOSION_SCROLL_ITEM_ID}) registration failed: ${e}`); }


// --- 守護の巻物 (Guardian Scroll) (チーム対応版) ---
const GUARDIAN_RADIUS = 6;
const GUARDIAN_HORIZONTAL_STRENGTH = 1.2;
const GUARDIAN_UPWARD_STRENGTH = 0.1;
const GUARDIAN_DURATION_SECONDS = 10;
const GUARDIAN_INTERVAL_TICKS = 10; // 0.5秒ごと

const guardianActivePlayers = new Map<string, number>(); // <playerId, intervalId>

function guardianAction(player: Player) {
    const playerId = player.id;
    const playerDimension: Dimension = player.dimension;
    const playerLocation: Vector3 = player.location;
    const userTeamTag = getPlayerTeamTag(player); // 使用者のチームタグを取得

    // 既に効果が発動中の場合は一旦解除
    if (guardianActivePlayers.has(playerId)) {
        const oldIntervalId = guardianActivePlayers.get(playerId);
        if (oldIntervalId !== undefined) {
            system.clearRun(oldIntervalId);
            // 既存のタイムアウトもクリアする必要があるかもしれないが、ここでは省略
        }
        guardianActivePlayers.delete(playerId);
        // 再使用メッセージなどを表示しても良い
        // player.sendMessage("§e守護の力を再展開します。");
    }

    try {
        playerDimension.playSound("random.orb", playerLocation, { volume: 1.0, pitch: 0.8 });
        playerDimension.playSound("beacon.activate", playerLocation, { volume: 0.5, pitch: 1.2 });
        player.sendMessage(`§e守護の力を展開！ ${GUARDIAN_DURATION_SECONDS}秒間、周囲の敵対存在を吹き飛ばします！`);

        const intervalId = system.runInterval(() => {
            try {
                // プレイヤーが無効になったらインターバル停止
                if (!player.isValid) {
                    if (guardianActivePlayers.get(playerId) === intervalId) {
                        system.clearRun(intervalId);
                        guardianActivePlayers.delete(playerId);
                    }
                    return;
                }
                const currentGuardianLocation = player.location; // 最新の位置を取得

                // 検索オプション (変更なし)
                const queryOptions: EntityQueryOptions = {
                    location: currentGuardianLocation,
                    maxDistance: GUARDIAN_RADIUS,
                    excludeFamilies: ["inanimate"], // アイテムなどを除外
                };

                const nearbyEntities: Entity[] = playerDimension.getEntities(queryOptions);
                // let pushedCount = 0; // デバッグ用

                nearbyEntities.forEach(entity => {
                    try {
                        if (!entity.isValid || entity.id === playerId) return; // 無効なエンティティと使用者自身は除外

                        // プレイヤーの場合の追加チェック
                        if (entity instanceof Player) {
                            // @ts-ignore - getGameMode() は Player クラスに存在するはず
                            const gameMode = entity.getGameMode();
                            if (gameMode === GameMode.spectator || gameMode === GameMode.creative) {
                                return; // スペクテイターとクリエイティブは除外
                            }

                            // --- チームチェック ---
                            const targetTeamTag = getPlayerTeamTag(entity);
                            if (userTeamTag && targetTeamTag === userTeamTag) {
                                // console.log(`[Guardian] ${entity.name} is a teammate, skipping knockback.`); // デバッグ用
                                return; // 同じチームのプレイヤーは吹き飛ばさない
                            }
                        }

                        // --- ノックバック計算 --- (変更なし)
                        const vectorFromPlayer: Vector3 = {
                            x: entity.location.x - currentGuardianLocation.x,
                            y: 0, // YはknockbackのupwardStrengthで制御
                            z: entity.location.z - currentGuardianLocation.z
                        };

                        const horizontalDistance = Vector.magnitude({ x: vectorFromPlayer.x, y: 0, z: vectorFromPlayer.z });

                        if (horizontalDistance < 0.01) return; // ほぼ同じ位置なら何もしない

                        const directionX = vectorFromPlayer.x / horizontalDistance;
                        const directionZ = vectorFromPlayer.z / horizontalDistance;

                   
                        const horizontalForce: VectorXZ = {
                            x: directionX * GUARDIAN_HORIZONTAL_STRENGTH,
                            z: directionZ * GUARDIAN_HORIZONTAL_STRENGTH
                        };

                        const verticalStrength = GUARDIAN_UPWARD_STRENGTH;

                        entity.applyKnockback(
                            horizontalForce, // 第一引数: VectorXZ オブジェクト
                            verticalStrength   // 第二引数: 垂直方向の強さ
                        );
    


                    } catch (entityError) {
                        // 特定のエンティティ処理中のエラーは警告に留め、ループを継続
                        console.warn(`[Guardian Scroll Interval] Failed to process entity ${entity.typeId} (${entity.id}): ${entityError}`);
                    }
                });
                // if (pushedCount > 0) console.log(`[Guardian] Pushed ${pushedCount} entities.`); // デバッグ用

            } catch (intervalError) {
                // インターバル全体の致命的なエラー
                console.error(`[Guardian Scroll Interval] Error during interval execution for ${player.name}: ${intervalError}`);
                if (guardianActivePlayers.get(playerId) === intervalId) {
                    system.clearRun(intervalId);
                    guardianActivePlayers.delete(playerId);
                    if (player.isValid) {
                        player.sendMessage("§c守護の力の維持中にエラーが発生しました。");
                    }
                }
            }
        }, GUARDIAN_INTERVAL_TICKS);

        // インターバルIDを保存
        guardianActivePlayers.set(playerId, intervalId);

        // 効果終了タイマー
        system.runTimeout(() => {
            // タイムアウト時に保存されているIDが現在のものと一致する場合のみクリア
            if (guardianActivePlayers.get(playerId) === intervalId) {
                system.clearRun(intervalId);
                guardianActivePlayers.delete(playerId);
                if (player.isValid) { // 終了時にプレイヤーが有効か確認
                    player.sendMessage("§e守護の力が収まった。");
                    try {
                        playerDimension.playSound("beacon.deactivate", player.location, { volume: 0.5, pitch: 1.0 });
                    } catch (soundError) {
                        console.warn(`[Guardian Scroll] Error playing deactivate sound: ${soundError}`);
                    }
                }
            }
        }, GUARDIAN_DURATION_SECONDS * 20); // 秒数をティックに変換

    } catch (error: any) {
        // 巻物使用開始時のエラー
        player.sendMessage("§c守護の巻物の使用に失敗しました。");
        console.error(`[Guardian Scroll] Failed to initiate for ${player.name}: ${error}`);
        // エラー発生時に念のためMapから削除
        if (guardianActivePlayers.has(playerId)) {
            const intervalId = guardianActivePlayers.get(playerId);
            if (intervalId !== undefined) system.clearRun(intervalId);
            guardianActivePlayers.delete(playerId);
        }
    }
}

const guardianScrollItem = new CustomItem({
    name: "§e守護の巻物",
    lore: [
        "§7使用すると、使用者を中心に",
        `§7${GUARDIAN_DURATION_SECONDS}秒間、反発フィールドを展開(半径${GUARDIAN_RADIUS}m)。`,
        "§7範囲内の敵対的な存在や§c他のチームの§7プレイヤーを吹き飛ばす。", // チーム対応を明記
        "§7(§c同じチーム§7, §cｸﾘｴｲﾃｨﾌﾞ§7, §cｽﾍﾟｸﾃｲﾀｰ§7を除く)", // 除外対象を明記
        "§8巻物カテゴリ",
    ],
    item: "minecraft:guster_banner_pattern",
    amount: 1,
    remove: true, // 使用時に消費
});

guardianScrollItem.then((player: Player, eventData: any) => {
    const user = eventData?.source instanceof Player ? eventData.source : player;
    if (eventData.eventType === EventType.ItemUse && user?.isValid) {
        system.run(() => guardianAction(user));
    }
});

const GUARDIAN_SCROLL_ITEM_ID = 22;
try {
    registerCustomItem(GUARDIAN_SCROLL_ITEM_ID, guardianScrollItem);
} catch (e) { console.error(`[Scrolls] Guardian Scroll (ID ${GUARDIAN_SCROLL_ITEM_ID}) registration failed: ${e}`); }


// --- 上昇の巻物 (Ascension Scroll) ---
const ASCENSION_EFFECT_DURATION_SECONDS = 7;
const ASCENSION_EFFECT_AMPLIFIER = 1; // レベル2 (0から始まるため)
const LEVITATION_EFFECT_TYPE_ID = "levitation";

function ascensionAction(player: Player) {
    const playerDimension: Dimension = player.dimension;
    const playerLocation: Vector3 = player.location;
    const durationTicks = ASCENSION_EFFECT_DURATION_SECONDS * 20;

    try {
        const levitationEffect = EffectTypes.get(LEVITATION_EFFECT_TYPE_ID);
        if (!levitationEffect) {
            // EffectTypes.get が undefined を返す場合のエラーハンドリング
            throw new Error(`Effect type '${LEVITATION_EFFECT_TYPE_ID}' not found or unavailable.`);
        }

        playerDimension.playSound("mob.elytra.loop", playerLocation, { volume: 0.6, pitch: 1.4 });
        // addEffect の amplifier は 0 がレベル 1 に対応
        player.addEffect(levitationEffect, durationTicks, { amplifier: ASCENSION_EFFECT_AMPLIFIER, showParticles: true });
        player.sendMessage(`§d浮遊！ - §f[上昇の巻物]の力で${ASCENSION_EFFECT_DURATION_SECONDS}秒間体が浮き上がる！`);

    } catch (error: any) {
        player.sendMessage("§c上昇の巻物の使用に失敗しました。");
        console.error(`[Ascension Scroll] Failed for ${player.name}: ${error}`); // エラーログを詳細に
        try {
            playerDimension.playSound("note.bass", playerLocation, { volume: 1.0, pitch: 0.8 });
        } catch (soundError) {
            console.warn(`[Ascension Scroll] Error playing failure sound: ${soundError}`);
        }
    }
}

const ascensionScrollItem = new CustomItem({
    name: "§d上昇の巻物",
    lore: [
        "§7使用すると、短時間だけ",
        `§7浮遊(レベル${ASCENSION_EFFECT_AMPLIFIER + 1})の効果を得て上昇する。`,
        `§7効果時間: ${ASCENSION_EFFECT_DURATION_SECONDS}秒`,
        "§7高所からの落下ダメージ軽減にも使えるかも？",
        "§8巻物カテゴリ",
    ],
    item: "minecraft:mojang_banner_pattern",
    amount: 1,
    remove: true,
});

ascensionScrollItem.then((player: Player, eventData: any) => {
    const user = eventData?.source instanceof Player ? eventData.source : player;
    if (eventData.eventType === EventType.ItemUse && user?.isValid) {
        system.run(() => ascensionAction(user));
    }
});

const ASCENSION_SCROLL_ITEM_ID = 23;
try {
    registerCustomItem(ASCENSION_SCROLL_ITEM_ID, ascensionScrollItem);
} catch (e) { console.error(`[Scrolls] Ascension Scroll (ID ${ASCENSION_SCROLL_ITEM_ID}) registration failed: ${e}`); }






const RAMMING_TARGET_RADIUS = 10; // Maximum distance to search for targets

// Damage Range (Closer = Higher Damage)
const MAX_RAMMING_DAMAGE = 12; // Damage when target is very close
const MIN_RAMMING_DAMAGE = 4;  // Damage when target is at RAMMING_TARGET_RADIUS

// Horizontal Knockback Strength Range (Closer = Stronger Knockback for player)
const MAX_RAMMING_HORIZONTAL_STRENGTH = 4.5; // Max horizontal force (like GUARDIAN_HORIZONTAL_STRENGTH used before)
const MIN_RAMMING_HORIZONTAL_STRENGTH = 2.0; // Min horizontal force at max range

// Vertical Knockback Strength (Let's keep this constant for simplicity, or make it slightly variable if desired)
const RAMMING_UPWARD_STRENGTH = 0.45; // Vertical lift for the player (like GUARDIAN_UPWARD_STRENGTH used before)



function rammingAction(player: Player) {
    const playerId = player.id;
    const playerDimension: Dimension = player.dimension;
    const playerLocation: Vector3 = player.location;
    const userTeamTag = getPlayerTeamTag(player);

    try {
        // 1. Find potential targets
        const queryOptions: EntityQueryOptions = {
            location: playerLocation,
            maxDistance: RAMMING_TARGET_RADIUS,
            excludeFamilies: ["inanimate"],
            excludeGameModes: [GameMode.spectator, GameMode.creative],
            excludeTags: [playerId]
        };
        const nearbyEntities: Entity[] = playerDimension.getEntities(queryOptions);

        // 2. Filter targets
        const validTargets = nearbyEntities.filter(entity => {
            if (!entity.isValid || entity.id === playerId) return false;

            if (entity instanceof Player) {
                const targetTeamTag = getPlayerTeamTag(entity);
                if (userTeamTag && targetTeamTag === userTeamTag) {
                    return false; // Is a teammate
                }
                return true; // Valid player target
            } else {
                // Add more filtering here if needed (e.g., exclude passive mobs)
                // if (entity.typeId === "minecraft:villager") return false;
                return true; // Valid non-player entity target
            }
        });

        // 3. Check if any target exists and select one
        if (validTargets.length === 0) {
            player.sendMessage("§c周囲に突進する対象が見つかりませんでした。");
            playerDimension.playSound("note.bass", playerLocation, { volume: 1.0, pitch: 0.8 });
            return;
        }

        const targetEntity = validTargets[Math.floor(Math.random() * validTargets.length)];
        const targetLocation = targetEntity.location;

        // 4. Calculate direction and distance
        const vectorToTarget: Vector3 = {
            x: targetLocation.x - playerLocation.x,
            y: targetLocation.y - playerLocation.y,
            z: targetLocation.z - playerLocation.z
        };

        const horizontalDistance = Vector.magnitude({ x: vectorToTarget.x, y: 0, z: vectorToTarget.z });

        // Check for edge case (target directly above/below)
        if (horizontalDistance < 0.1) { // Use a small threshold instead of 0.01
            player.sendMessage("§c対象が真上または真下にいるため、水平方向への突進はキャンセルされました。");
            playerDimension.playSound("note.bass", playerLocation, { volume: 1.0, pitch: 0.8 });
            return;
        }

        // --- Calculate Distance-Based Intensity ---

        // Normalize distance (0 = max radius, 1 = close) - Inverse relationship for interpolation
        // Clamp distance to avoid values outside the intended range due to floating point inaccuracies
        const clampedDistance = Math.max(0, Math.min(horizontalDistance, RAMMING_TARGET_RADIUS));
        const normalizedDistanceFactor = clampedDistance / RAMMING_TARGET_RADIUS; // 0 (close) to 1 (far)

        // Interpolate Damage (Closer = MAX, Farther = MIN)
        const currentDamage = Math.round(
            MAX_RAMMING_DAMAGE - (MAX_RAMMING_DAMAGE - MIN_RAMMING_DAMAGE) * normalizedDistanceFactor
        );
        const finalDamage = Math.max(MIN_RAMMING_DAMAGE, Math.min(MAX_RAMMING_DAMAGE, currentDamage)); // Clamp result

        // Interpolate Horizontal Strength (Closer = MAX, Farther = MIN)
        const currentHorizontalStrength = MAX_RAMMING_HORIZONTAL_STRENGTH -
            (MAX_RAMMING_HORIZONTAL_STRENGTH - MIN_RAMMING_HORIZONTAL_STRENGTH) * normalizedDistanceFactor;
        const finalHorizontalStrength = Math.max(MIN_RAMMING_HORIZONTAL_STRENGTH, Math.min(MAX_RAMMING_HORIZONTAL_STRENGTH, currentHorizontalStrength)); // Clamp result


        // 5. Calculate direction vector (Normalized)
        const directionX = vectorToTarget.x / horizontalDistance;
        const directionZ = vectorToTarget.z / horizontalDistance;

        // 6. Apply Knockback (Speed) to player based on calculated strength
        const horizontalForceVector: VectorXZ = {
            x: directionX * finalHorizontalStrength,
            z: directionZ * finalHorizontalStrength
        };
        const verticalStrength = RAMMING_UPWARD_STRENGTH; // Using the constant vertical strength

        player.applyKnockback(
            horizontalForceVector,
            verticalStrength
        );

        // 7. Deal Damage to the target based on calculated damage
        targetEntity.applyDamage(finalDamage, {
            cause: EntityDamageCause.entityAttack,
            damagingEntity: player
        });

        rammingScrollItem.removeItem(player, rammingScrollItem.get())


        

        // 8. Feedback
        playerDimension.playSound("mob.ravager.attack", playerLocation, { volume: 0.9 + (finalHorizontalStrength - MIN_RAMMING_HORIZONTAL_STRENGTH) / (MAX_RAMMING_HORIZONTAL_STRENGTH - MIN_RAMMING_HORIZONTAL_STRENGTH) * 0.3, pitch: 1.1 }); // Slightly vary volume based on strength
        playerDimension.playSound("random.explode", targetLocation, { volume: 0.3 + (finalDamage / MAX_RAMMING_DAMAGE) * 0.3, pitch: 1.5 + (finalDamage / MAX_RAMMING_DAMAGE) * 0.3 }); // Slightly vary impact sound based on damage
        player.sendMessage(`§6突進！ §e${targetEntity.nameTag || targetEntity.typeId}§6 に向かって突撃し、§c${finalDamage}ダメージ§6を与えた！ (距離: ${horizontalDistance.toFixed(1)}m)`);


    } catch (error: any) {
        player.sendMessage("§c突進の巻物の使用中にエラーが発生しました。");
        console.error(`[Ramming Scroll] Failed for ${player.name}: ${error}`);
        if (!playerDimension) return; // Avoid errors if dimension is undefined in catch block
        try {
            playerDimension.playSound("note.bass", playerLocation || player.location, { volume: 1.0, pitch: 0.8 });
        } catch (soundError) {
            console.warn(`[Ramming Scroll] Error playing failure sound: ${soundError}`);
        }
    }
}

const rammingScrollItem = new CustomItem({
    name: "§6突進の巻物",
    lore: [
        "§7使用すると、周囲(半径§e" + RAMMING_TARGET_RADIUS + "m§7)の",
        "§7敵対的な存在や§c他チームの§7プレイヤー",
        "§71体に向かって高速で突進する。",
        "§7対象へのダメージ(§c" + MIN_RAMMING_DAMAGE + "～" + MAX_RAMMING_DAMAGE + "§7)と",
        "§7自身の突進速度は、対象との距離が",
        "§7近いほど大きくなる。",
        "§7(§c同じチーム§7, §cｸﾘｴｲﾃｨﾌﾞ§7, §cｽﾍﾟｸﾃｲﾀｰ§7を除く)",
        "§8巻物カテゴリ",
    ],
    item: "minecraft:piglin_banner_pattern", // Example item
    amount: 1,
});


rammingScrollItem.then((player: Player, eventData: CustomItemEventData) => {
    if (eventData.eventType === EventType.ItemUse) {
        system.run(() => rammingAction(player));
    } 
});

const RAMMING_SCROLL_ITEM_ID = 24; // Next available ID
try {
    registerCustomItem(RAMMING_SCROLL_ITEM_ID, rammingScrollItem);
} catch (e) {
    console.error(`[Scrolls] Ramming Scroll (ID ${RAMMING_SCROLL_ITEM_ID}) registration failed: ${e}`);
}