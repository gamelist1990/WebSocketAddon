import {
    Player,
    system,
    PlayerSoundOptions,
    Vector3,
    EntityRaycastOptions,
    EntityDamageCause,
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

const pistolCooldownTicks = 1;
const pistolCooldowns = new Map<string, number>();

const pistol = new CustomItem({
    name: "§bピストル",
    lore: ["§7右クリックで弾丸を発射する", "§7弾丸は経験値を消費する"],
    item: "minecraft:wooden_hoe",
    amount: 1,
    rollback: true,
}).then(usePistol);

function usePistol(player: Player) {
    const playerName = player.name;

    // クールダウンチェック
    if (pistolCooldowns.has(playerName)) {
        const endTick = pistolCooldowns.get(playerName)!; // 必ず存在するので ! をつけてOK
        if (system.currentTick < endTick) {
            // クールダウン中
            // 残り時間を計算 (ticks)
            const remainingTicks = endTick - system.currentTick;
            // 残り時間を秒に変換 (小数点以下1桁)
            const remainingSeconds = (remainingTicks / 20).toFixed(1);
            player.sendMessage(`§cクールダウン中§6(§f${remainingSeconds}§6秒)`); // 秒表示に変更
            return;
        }
    }

    system.run(() => {
        const xpCost = 3;
        const maxDamage = 10;
        const minDamage = 5;
        const maxRange = 10;
        const particleSpacing = 0.7;
        const minY = -64;
        const maxY = 319;

        if (player.level < xpCost) {
            player.sendMessage(`経験値が足りません! (${xpCost}以上必要)`);
            return;
        }

        player.addLevels(-xpCost);

        // クールダウン開始: 現在の tick + クールダウン時間を Map に記録
        pistolCooldowns.set(playerName, system.currentTick + pistolCooldownTicks);


        const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);

        // よりピストルらしい音に変更
        playSound("item.flintandsteel.use", { pitch: 1.5 });  // 発射音
        system.runTimeout(() => playSound("item.flintandsteel.use", { pitch: 1.2 }), 2); // 薬莢が落ちるような音（少し遅延）
        system.runTimeout(() => playSound("random.click", { pitch: 1.8 }), 3); // スライドが戻る音（さらに遅延）


        const direction = player.getViewDirection();
        const headLocation = player.getHeadLocation();

        // 初期位置チェック (Y座標のみ)
        if (headLocation.y < minY || headLocation.y > maxY) {
            player.sendMessage("初期位置が不正です");
            return;
        }

        const raycastOptions: EntityRaycastOptions = { maxDistance: maxRange };
        const hitResult = player.getEntitiesFromViewDirection(raycastOptions)[0];
        const hitEntity = hitResult?.entity;
        const hitDistance = hitResult ? distance(headLocation, hitResult.entity.location) : maxRange;

        //パーティクルのループ処理
        for (let d = 0; d <= maxRange; d += particleSpacing) {
            system.runTimeout(() => {

                try {
                    const particlePos: Vector3 = {
                        x: headLocation.x + direction.x * d,
                        y: Math.min(maxY, Math.max(minY, headLocation.y + direction.y * d)),
                        z: headLocation.z + direction.z * d,
                    };

                    //パーティクルの生成
                    player.dimension.spawnParticle("minecraft:arrow_spell_emitter", particlePos);

                    // 距離が命中距離を超えたら、ループを抜ける
                    if (d > hitDistance) {
                        return;
                    }

                } catch (error: any) {
                    console.error("Error in particle loop:", error, error.stack); // エラーログ出力
                }
            }, d / particleSpacing * 1); //tickの計算
        }

        if (hitEntity) {
            const damage = Math.max(minDamage, maxDamage / (1 + 0.2 * hitDistance));

            hitEntity.applyDamage(damage, {
                damagingEntity: player,
                cause: EntityDamageCause.entityAttack,
            });

            if (hitEntity instanceof Player) {
                //player.sendMessage(`${hitEntity.name} に命中! ${damage.toFixed(1)}ダメージ!`);
            }
        }
    });
}

// --- アサルトライフル ---
const assaultRifleCooldownTicks = 1; // ピストルより短いクールダウン
const assaultRifleCooldowns = new Map<string, number>();
const assaultRifleBurstIntervalTicks = 1; // 連射間隔

const assaultRifle = new CustomItem({
    name: "§aアサルトライフル",
    lore: ["§7右クリックで弾丸を連射する", "§7弾丸は経験値を消費する"],
    item: "minecraft:iron_hoe",  // 別のアイテムを使用
    amount: 1,
}).then(useAssaultRifle);


function useAssaultRifle(player: Player) {
    const playerName = player.name;

    if (assaultRifleCooldowns.has(playerName)) {
        const endTick = assaultRifleCooldowns.get(playerName)!;
        if (system.currentTick < endTick) {
            const remainingSeconds = ((endTick - system.currentTick) / 20).toFixed(1);
            player.sendMessage(`§cクールダウン中§6(§f${remainingSeconds}§6秒)`);
            return;
        }
    }

    // 連射処理用の関数
    function fireBurst(shotCount: number) {

        system.run(() => {
            if (shotCount <= 0) {
                // クールダウン開始 (全弾撃ち終わった後)
                assaultRifleCooldowns.set(playerName, system.currentTick + assaultRifleCooldownTicks);
                return;
            }

            const xpCostPerShot = 1; // 1発あたりのXPコスト (小数)
            const maxDamage = 3;
            const minDamage = 1;
            const maxRange = 20; //射程
            const particleSpacing = 0.5;
            const minY = -64;
            const maxY = 319;

            if (player.level < xpCostPerShot) {
                player.sendMessage(`経験値が足りません! (${xpCostPerShot.toFixed(1)}以上必要)`);
                // クールダウンは開始しない（経験値不足）
                return;
            }

            player.addLevels(-xpCostPerShot);

            const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);
            playSound("fire.ignite", { pitch: 1.8, volume: 0.8 }); // 発射音

            const direction = player.getViewDirection();
            const headLocation = player.getHeadLocation();

            // 初期位置とY座標のチェック
            if (headLocation.y < minY || headLocation.y > maxY) {
                player.sendMessage("初期位置が不正です");
                return;
            }

            const raycastOptions: EntityRaycastOptions = { maxDistance: maxRange };
            const hitResult = player.getEntitiesFromViewDirection(raycastOptions)[0];
            const hitEntity = hitResult?.entity;
            const hitDistance = hitResult ? distance(headLocation, hitResult.entity.location) : maxRange;


            // パーティクル生成ループ
            for (let d = 0; d <= maxRange; d += particleSpacing) {
                system.runTimeout(() => {
                    try {
                        const particlePos: Vector3 = {
                            x: headLocation.x + direction.x * d,
                            y: Math.min(maxY, Math.max(minY, headLocation.y + direction.y * d)),
                            z: headLocation.z + direction.z * d,
                        };
                        player.dimension.spawnParticle("minecraft:falling_border_dust_particle", particlePos); // パーティクル変更

                        if (d > hitDistance) {
                            return;
                        }

                    } catch (error: any) {
                        console.error("Error in particle loop:", error, error.stack);
                    }

                }, d / particleSpacing);
            }
            if (hitEntity) {
                const damage = Math.max(minDamage, maxDamage / (1 + 0.2 * hitDistance));
                hitEntity.applyDamage(damage, {
                    damagingEntity: player,
                    cause: EntityDamageCause.entityAttack,
                });

                if (hitEntity instanceof Player) {
                  //  player.sendMessage(`${hitEntity.name} に命中! ${damage.toFixed(1)}ダメージ!`);
                }
            }

            // 次の弾の発射をスケジュール (連射間隔後)
            system.runTimeout(() => {
                fireBurst(shotCount - 1);
            }, assaultRifleBurstIntervalTicks);
        });
    }
    const burstCount = 3; // 3点バースト
    fireBurst(burstCount); // 初回の発射を開始

}


// 3次元ベクトル間の距離を計算 (ピストルと共通)
function distance(pos1: Vector3, pos2: Vector3): number {
    return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2 + (pos1.z - pos2.z) ** 2);
}


registerCustomItem(3, pistol);
registerCustomItem(4, assaultRifle); // アサルトライフルを登録 (IDは重複しないように)