import {
    Player, system, EntityQueryOptions, EntityDamageCause, EffectTypes,
    VectorXZ} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";
import { Vector3 } from "../../../../../../module/Vector3";



const barrierItem = new CustomItem({
    name: "§bバリア展開",
    lore: ["§7使用するとバリアを展開し", "§7周囲のエンティティを吹き飛ばす"],
    item: "minecraft:barrier", 
    amount: 1,
    placeableOn: ["minecraft:allow"],
}).then((player: Player, ev) => {
    if (ev.eventType !== EventType.ItemUse) return;
    barrierItem.removeItem(player, barrierItem.get())
    system.run(() => {

        const playerLocation = new Vector3(player.location.x, player.location.y, player.location.z);
        const dimension = player.dimension;

        const TEAM_TAGS = ["team1", "team2", "team3", "team4", "team5"];

        function getPlayerTeamTag(player: Player): string | undefined {
            if (!player || !player.isValid) return undefined;
            const tags = player.getTags();
            return tags.find(tag => TEAM_TAGS.includes(tag));
        }

        


        // --- 定数定義 ---
        const radius = 5; // 効果範囲を少し広めに (調整可能)
        const knockbackStrength = 5; // プレイヤーへのノックバックの強さ
        const verticalImpulse = 0.3; // 吹き飛ばし時の垂直方向の力
        const slownessDurationTicks = 60; // 鈍化の効果時間 (Tick)
        const slownessAmplifier = 3; // 鈍化の強さ (0=Lv1, 1=Lv2, ...)
        const damageAmount = 2; // 継続ダメージ量
        const damageIntervalTicks = 20; // ダメージ間隔 (Tick)
        const damageDurationTicks = 4 * 20; // 継続ダメージの総時間 (Tick)
        const worldBounds = {
            minX: -30000000, maxX: 30000000,
            minY: -64, maxY: 320, 
            minZ: -30000000, maxZ: 30000000,
        };

        // --- 境界チェック ---
        if (
            playerLocation.x < worldBounds.minX || playerLocation.x > worldBounds.maxX ||
            playerLocation.y < worldBounds.minY || playerLocation.y > worldBounds.maxY ||
            playerLocation.z < worldBounds.minZ || playerLocation.z > worldBounds.maxZ
        ) {
            player.sendMessage("§c[警告] 世界の境界付近では使用できません！");
            return; // 処理中断
        }

        // --- 使用者のチームタグ確認 ---

        dimension.spawnParticle("minecraft:breeze_wind_explosion_emitter", playerLocation.add(new Vector3(0, 1, 0))); // プレイヤーの少し上に表示
        
        player.playSound("random.explode", { location: playerLocation, volume: 0.6, pitch: 1.2 });
        player.playSound("mob.guardian.curse", { location: playerLocation, volume: 1, pitch: 0.8 });
        system.runTimeout(() => {
            try { // プレイヤーがワールドから抜けた場合のエラー回避
                player.playSound("mob.warden.sonic_boom", { location: playerLocation, volume: 1.2, pitch: 1 });
            } catch (e) { }
        }, 1); // わずかに遅延させて再生


        // --- 周囲のエンティティ検索 ---
        const queryOptions: EntityQueryOptions = {
            location: playerLocation, // Vector3 をそのまま渡せる
            maxDistance: radius,
            excludeTags: player.getTags(), // 自分自身のタグを持つエンティティを除外 (より確実)
            excludeTypes: [player.typeId], // 自分自身のタイプを除外
        };
        const nearbyEntities = dimension.getEntities(queryOptions); // Generator を配列に変換しない方が効率的な場合もある

        // --- ループ内で使い回す Vector3 インスタンス ---
        const entityLocation = new Vector3();
        const direction = new Vector3();

        // --- 近くのエンティティへの処理 ---
        for (const entity of nearbyEntities) {            
            entityLocation.set(entity.location.x, entity.location.y, entity.location.z);
            direction.copy(entityLocation).subtractInPlace(playerLocation);
            if (direction.lengthSquared() < 1e-6) {
                continue;
            }

            // --- 方向ベクトルを正規化 (単位ベクトルにする) ---
            direction.normalizeInPlace(); // インプレースで正規化

            // --- エンティティがプレイヤーの場合 ---
            if (entity.typeId === "minecraft:player") {
                const targetPlayer = entity as Player;
                const targetTags = getPlayerTeamTag(targetPlayer);
                const host = getPlayerTeamTag(player);
                if (host && targetTags === host) {
                    continue;
                }


                // --- ノックバック計算 ---
                const horizontalForce: VectorXZ = {
                    x: direction.x * knockbackStrength,
                    z: direction.z * knockbackStrength
                };
                try {
                    targetPlayer.applyKnockback(horizontalForce, verticalImpulse); // こちらの形式でも良いはず
                } catch (e) {
                }


                // --- 鈍化効果 ---
                targetPlayer.addEffect(EffectTypes.get("slowness")!, slownessDurationTicks, {
                    amplifier: slownessAmplifier,
                    showParticles: false,
                });

                // --- 継続ダメージ ---
                let totalDamageApplied = 0;
                const damageInterval = system.runInterval(() => {
                    try {
                        if (!targetPlayer.isValid || totalDamageApplied >= damageAmount * (damageDurationTicks / damageIntervalTicks)) {
                            system.clearRun(damageInterval);
                            return;
                        }
                        // targetPlayer がまだ存在するか確認してからダメージを与える
                        if (targetPlayer.dimension.id === dimension.id) { // 同じディメンションにいるか確認
                            targetPlayer.applyDamage(damageAmount, {
                                cause: EntityDamageCause.contact, // ダメージ要因
                                damagingEntity: player, // ダメージを与えたエンティティ
                            });
                            totalDamageApplied += damageAmount;
                        } else {
                            system.clearRun(damageInterval); // 違うディメンションなら終了
                        }

                    } catch (e) {
                        // targetPlayer が無効になった場合など
                        system.clearRun(damageInterval);
                    }
                }, damageIntervalTicks);
                // 安全のため、一定時間後に強制的にクリア
                system.runTimeout(() => system.clearRun(damageInterval), damageDurationTicks + 20);


                // --- ターゲットプレイヤーへの通知 ---
                targetPlayer.sendMessage("§cバリアによって吹き飛ばされました！ §6継続ダメージ発生中！");
                targetPlayer.playSound("mob.warden.sonic_boom", { location: targetPlayer.location, volume: 1, pitch: 1.1 });

            }
        }
    });
});

// --- カスタムアイテム登録 ---
registerCustomItem(16, barrierItem);