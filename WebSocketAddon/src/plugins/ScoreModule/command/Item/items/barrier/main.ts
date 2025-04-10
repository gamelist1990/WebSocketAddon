import { Player, system, EntityQueryOptions, EntityDamageCause, EffectTypes, Vector3, VectorXZ } from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

const barrierItem = new CustomItem({
    name: "§bバリア展開",
    lore: ["§7使用するとバリアを展開し", "§7周囲のエンティティを吹き飛ばす"],
    item: "minecraft:barrier",
    amount: 1,
    placeableOn: ["minecraft:allow"],
    remove: true,
}).then((player: Player, ev) => {
    if (ev.eventType !== EventType.ItemUse) return;
    system.run(() => {
        const location = player.location;
        const dimension = player.dimension;
        const radius = 4;

        // 世界の境界
        const minX = -30000000;
        const maxX = 30000000;
        const minY = -64; // Bedrock Edition の場合。Java Edition は -2048
        const maxY = 320;
        const minZ = -30000000;
        const maxZ = 30000000;

        // プレイヤーが境界の外にいるか確認
        if (
            location.x < minX ||
            location.x > maxX ||
            location.y < minY ||
            location.y > maxY ||
            location.z < minZ ||
            location.z > maxZ
        ) {
            // 境界外の場合は使用できないメッセージを表示して処理を終了
            player.sendMessage("§c[警告] 境界の外では使用できません！");
            return;
        }

        // 使用者のタグを確認
        const userTags = player.getTags();
        const isRedTeam = userTags.includes("red");
        const isBlueTeam = userTags.includes("blue");

        // バリア展開のエフェクト (パーティクル)
        dimension.spawnParticle("minecraft:breeze_wind_explosion_emitter", {
            x: player.location.x,
            y: player.location.y + 1,
            z: player.location.z,
        });

        // サウンドを再生
        player.playSound("random.explode", { volume: 0.5, pitch: 1.2 });
        player.playSound("mob.guardian.curse", { volume: 1, pitch: 0.8 });
        system.runTimeout(() => {
            player.playSound("mob.warden.sonic_boom", { volume: 1, pitch: 1 });
        }, 1);

        // 周囲のエンティティを検索
        const options: EntityQueryOptions = {
            location: location,
            maxDistance: radius,
            excludeNames: [player.name],
        };

        const nearbyEntities = Array.from(dimension.getEntities(options));

        // 近くのプレイヤーやエンティティを吹き飛ばす
        for (const entity of nearbyEntities) {
            // エンティティがプレイヤーかどうか確認
            if (entity.typeId === "minecraft:player") {
                const targetPlayer = entity as Player;
                const targetTags = targetPlayer.getTags();

                // 同じチームのプレイヤーには効果を適用しない
                if (
                    (isRedTeam && targetTags.includes("red")) ||
                    (isBlueTeam && targetTags.includes("blue"))
                ) {
                    continue; // 次のエンティティへ
                }

                // 継続ダメージを与える (4秒間、2秒ごとにダメージ)
                let damageTicks = 0;
                const damageInterval = system.runInterval(() => {
                    if (damageTicks < 10) {
                        targetPlayer.applyDamage(2, { // 2のダメージ (ハート1個分)
                            cause: EntityDamageCause.contact,
                            damagingEntity: player,
                        });
                        damageTicks += 1;
                    } else {
                        system.clearRun(damageInterval);
                    }
                }, 20);

            }

            const direction = {
                x: entity.location.x - location.x,
                y: entity.location.y - location.y,
                z: entity.location.z - location.z,
            };

            // ベクトルを正規化
            const length = Math.sqrt(
                direction.x ** 2 + direction.y ** 2 + direction.z ** 2
            );
            const normalizedDirection = {
                x: direction.x / length,
                y: direction.y / length,
                z: direction.z / length,
            };

            if (entity.typeId === "minecraft:player") {
                // プレイヤーにはノックバックを適用
                const player = entity as Player;
                const horizontalForce: VectorXZ = {
                    x: normalizedDirection.x * 5,
                    z: normalizedDirection.z * 5
                };
                //@ts-ignore
                player.applyKnockback(
                    horizontalForce,
                    0.1 // 垂直方向の強さ
                );

                // 鈍化のステータスを付与
                player.addEffect(EffectTypes.get("slowness")!, 60, {
                    amplifier: 6, // レベル III
                    showParticles: false,
                });

                // 吹き飛ばされたプレイヤーにメッセージとサウンドを送信
                player.sendMessage("§cバリアによって吹き飛ばされました！");
                player.sendMessage("§6現在継続ダメージを食らっています！！");
                player.playSound("mob.warden.sonic_boom", { volume: 1, pitch: 1 });
            } else {
                // プレイヤー以外のエンティティにはインパルスを適用
                const impulseVector: Vector3 = {
                    x: normalizedDirection.x * 5, // 水平方向の強さを調整
                    y: 0.1, // 垂直方向の強さを調整 (浮かせたい場合は適宜変更)
                    z: normalizedDirection.z * 5, // 水平方向の強さを調整
                };
                entity.applyImpulse(impulseVector);
            }
        }
    });
});


registerCustomItem(16, barrierItem)