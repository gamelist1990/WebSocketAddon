import {
    Player,
    system,
    Vector3,
    GameMode,
    world,
    Entity,
    ProjectileHitBlockAfterEvent,
    ProjectileHitEntityAfterEvent,
    EntityDamageCause
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../CustomItem"; // パスは環境に合わせて調整してください
import { registerCustomItem } from "../../custom"; // パスは環境に合わせて調整してください

// --- ファイヤーボールの設定 ---
const FIREBALL_ID = 31; // ユニークID
const FIREBALL_SPEED = 2.0; // ファイヤーボールの速度
const FIREBALL_RANGE = "無限"; // ファイヤーボールの最大飛行距離
const KNOCKBACK_RADIUS = 8; // ノックバック範囲
const KNOCKBACK_STRENGTH = 10.0; // ノックバック強度

// アクティブなファイヤーボールをMapで管理（重複防止）
const activeFireballs = new Map<string, {
    playerId: string;
    spawnTime: number;
}>();

// エンティティ着弾イベントリスナーを管理
class FireballEventManager {
    private static instance: FireballEventManager | null = null;
    private blockHitListener: ((eventData: ProjectileHitBlockAfterEvent) => void) | null = null;
    private entityHitListener: ((eventData: ProjectileHitEntityAfterEvent) => void) | null = null;
    private isListenerRegistered = false;

    static getInstance(): FireballEventManager {
        if (!this.instance) {
            this.instance = new FireballEventManager();
        }
        return this.instance;
    }

    private constructor() { }

    registerListener() {
        if (this.isListenerRegistered) return;        // ブロック着弾イベント
        this.blockHitListener = (eventData: ProjectileHitBlockAfterEvent) => {
            try {
                const projectile = eventData.projectile;
                const hitLocation = eventData.location;
                if (projectile.typeId === "minecraft:fireball" && activeFireballs.has(projectile.id)) {
                    const fireballData = activeFireballs.get(projectile.id)!;
                    const timeDiff = Date.now() - fireballData.spawnTime;
                    // 1秒以内に爆発した場合、使用者に回復効果を与える
                    if (timeDiff <= 55) {
                        try {
                            const players = world.getAllPlayers();
                            const player = players.find(p => p.id === fireballData.playerId);
                            if (player && player.isValid) {
                                player.addEffect("instant_health", 1, {
                                    amplifier: 10,
                                    showParticles: false
                                });
                            }
                        } catch (healError) {
                            console.warn(`回復効果付与エラー: ${healError}`);
                        }
                    }

                    activeFireballs.delete(projectile.id);

                    // 着弾位置からノックバック効果を適用
                    this.applyKnockbackEffect(hitLocation, projectile.dimension);

                    // 全てのファイヤーボールが処理完了したらリスナーを削除
                    if (activeFireballs.size === 0) {
                        this.unregisterListener();
                    }
                }
            } catch (error) {
                console.warn(`ファイヤーボールブロック着弾処理エラー: ${error}`);
            }
        };        // エンティティ着弾イベント
        this.entityHitListener = (eventData: ProjectileHitEntityAfterEvent) => {
            try {
                const projectile = eventData.projectile;
                const hitLocation = eventData.location;
                const hitEntity = eventData.getEntityHit()?.entity;

                if (projectile.typeId === "minecraft:fireball" && activeFireballs.has(projectile.id)) {
                    const fireballData = activeFireballs.get(projectile.id)!;
                    if (hitEntity && hitEntity.typeId === "minecraft:player" && hitEntity.id !== fireballData.playerId) {
                        try {
                            // 使用したプレイヤーを取得
                            const players = world.getAllPlayers();
                            const attackingPlayer = players.find(p => p.id === fireballData.playerId);

                            hitEntity.applyDamage(5, {
                                cause: EntityDamageCause.entityExplosion,
                                damagingEntity: attackingPlayer || projectile 
                            });
                        } catch (damageError) {
                            console.warn(`プレイヤーダメージ処理エラー: ${damageError}`);
                        }
                    }

                    activeFireballs.delete(projectile.id);

                    // 着弾位置からノックバック効果を適用
                    this.applyKnockbackEffect(hitLocation, projectile.dimension);

                    // 全てのファイヤーボールが処理完了したらリスナーを削除
                    if (activeFireballs.size === 0) {
                        this.unregisterListener();
                    }
                }
            } catch (error) {
                console.warn(`ファイヤーボールエンティティ着弾処理エラー: ${error}`);
            }
        };

        world.afterEvents.projectileHitBlock.subscribe(this.blockHitListener);
        world.afterEvents.projectileHitEntity.subscribe(this.entityHitListener);
        this.isListenerRegistered = true;
    } private applyKnockbackEffect(hitLocation: Vector3, dimension: any) {
        try {
            // より大きな範囲でエンティティを検索
            const nearbyEntities = dimension.getEntities({
                location: hitLocation,
                maxDistance: KNOCKBACK_RADIUS,
                excludeTypes: ["minecraft:item", "minecraft:fireball"]
            });

            // console.log(`着弾位置: ${hitLocation.x}, ${hitLocation.y}, ${hitLocation.z}`);
            // console.log(`範囲内エンティティ数: ${nearbyEntities.length}`);
            // 範囲内のエンティティにノックバックを適用
            for (const entity of nearbyEntities) {
                if (entity.isValid) {
                    this.applyKnockback(entity, hitLocation);
                }
            }
        } catch (error) {
            console.warn(`ノックバック効果適用エラー: ${error}`);
        }
    }

    private applyKnockback(entity: Entity, explodeLocation: Vector3) {
        try {
            const distance = Math.sqrt(
                Math.pow(entity.location.x - explodeLocation.x, 2) +
                Math.pow(entity.location.y - explodeLocation.y, 2) +
                Math.pow(entity.location.z - explodeLocation.z, 2)
            );

            if (distance <= KNOCKBACK_RADIUS && distance > 0) {
                // ノックバック方向を計算
                const knockbackDirection = {
                    x: (entity.location.x - explodeLocation.x) / distance,
                    z: (entity.location.z - explodeLocation.z) / distance
                };

                // 距離に応じてノックバック強度を調整
                const adjustedStrength = KNOCKBACK_STRENGTH * (1 - distance / KNOCKBACK_RADIUS);

                // console.log(`エンティティ ${entity.typeId} にノックバック適用 (距離: ${distance.toFixed(2)}, 強度: ${adjustedStrength.toFixed(2)})`);

                // ノックバックを適用
                entity.applyKnockback(
                    {
                        x: knockbackDirection.x * adjustedStrength,
                        z: knockbackDirection.z * adjustedStrength
                    },
                    0.9 // 垂直方向のノックバック強度
                );
            }
        } catch (error) {
            console.warn(`個別ノックバック適用エラー: ${error}`);
        }
    }

    unregisterListener() {
        if (this.blockHitListener && this.entityHitListener && this.isListenerRegistered) {
            world.afterEvents.projectileHitBlock.unsubscribe(this.blockHitListener);
            world.afterEvents.projectileHitEntity.unsubscribe(this.entityHitListener);
            this.blockHitListener = null;
            this.entityHitListener = null;
            this.isListenerRegistered = false;
        }
    }

    addFireball(fireballId: string, playerId: string) {
        activeFireballs.set(fireballId, {
            playerId: playerId,
            spawnTime: Date.now()
        });

        // 必要に応じてリスナーを登録
        this.registerListener();
    }
}


const fireball = new CustomItem({
    name: "§6ファイヤーボール",
    lore: [
        "§7右クリックでファイヤーボールを発射！",
        "§7爆発でブロックを破壊し、敵にダメージを与えます。",
        `§7射程距離: §e${FIREBALL_RANGE}ブロック`,
        `§7速度: §e${FIREBALL_SPEED}`
    ],
    item: "minecraft:magma_cream"
})
    .then((player: Player, eventData) => {
        if (eventData.eventType !== EventType.ItemUse) return;

        const gameMode = player.getGameMode();
        if (gameMode === GameMode.spectator) {
            player.onScreenDisplay.setTitle("§cサバイバルモードまたはアドベンチャーモードでのみ使用可能です。");
            return;
        }

        system.run(() => {
            try {
                // ファイヤーボール発射音
                player.playSound("mob.ghast.fireball", {
                    location: player.location,
                    volume: 1.0,
                    pitch: 1.0
                });

                // プレイヤーの視線方向を取得
                const viewDirection = player.getViewDirection();

                // ファイヤーボールの初期位置（プレイヤーの少し前）
                const startLocation: Vector3 = {
                    x: player.location.x + viewDirection.x * 1.5,
                    y: player.location.y + 1 + viewDirection.y * 1.5,
                    z: player.location.z + viewDirection.z * 1.5
                };

                const fireballEntity = player.dimension.spawnEntity("minecraft:fireball", startLocation);

                // ファイヤーボールに速度を設定
                const velocity: Vector3 = {
                    x: viewDirection.x * FIREBALL_SPEED,
                    y: viewDirection.y * FIREBALL_SPEED,
                    z: viewDirection.z * FIREBALL_SPEED
                };
                fireballEntity.applyImpulse(velocity);

                // ファイヤーボールをイベントマネージャーに登録
                const eventManager = FireballEventManager.getInstance();
                eventManager.addFireball(fireballEntity.id, player.id);

                // アイテムを消費
                fireball.removeItem(player, fireball.get());

            } catch (e) {
                console.warn(`ファイヤーボール召喚中にエラー: ${e}`);
                player.playSound("note.bass", {
                    location: player.location,
                    pitch: 0.5,
                    volume: 0.7
                });
            }
        });
    });

registerCustomItem(FIREBALL_ID, fireball);

