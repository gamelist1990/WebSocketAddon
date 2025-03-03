import {
    Player,
    system,
    PlayerSoundOptions,
    Vector3,
    EntityRaycastOptions,
    EntityDamageCause,
    Entity,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

// --- 抽象クラス BaseGun ---
abstract class BaseGun {
    protected cooldowns = new Map<string, number>();
    protected reloadingPlayers = new Map<string, { endTime: number; reloadAmount: number }>();
    protected ammo = new Map<string, number>();
    public customItem: CustomItem;
    protected reloadPromptShown = new Map<string, boolean>();

    constructor(
        public name: string,
        public lore: string[],
        public item: string,
        public maxAmmo: number,
        public maxDamage: number,
        public minDamage: number,
        public maxRange: number,
        public cooldownTicks: number,
        public reloadTicks: number,
        public particleId: string,
        public bulletSpeed: number
    ) {
        this.customItem = new CustomItem({
            name: this.name,
            lore: this.lore,
            item: this.item,
            amount: 1,
            rollback: true,
        });

        this.customItem.then((player, eventData) => {
            if (eventData.eventType === EventType.ItemUse) {
                this.use(player);
                this.updateActionBar(player);
            } else if (eventData.eventType === EventType.EntityHit || eventData.eventType === EventType.BlockHit) {
                this.reload(player); // forcedReload 引数を削除
            }
        });
    }

    abstract use(player: Player): void;

    // forcedReload 引数を削除
    protected reload(player: Player) {
        const playerName = player.name;

        if (this.reloadingPlayers.has(playerName)) {
            return;
        }

        let currentAmmo = this.ammo.get(playerName) ?? this.maxAmmo;

        if (currentAmmo >= this.maxAmmo) {
            player.onScreenDisplay.setActionBar("§c弾薬はすでに満タンです!");
            return;
        }

        // XP チェック (常に必要)
        const availableXp = player.level;
        if (availableXp <= 0) {
            player.onScreenDisplay.setActionBar("§cリロードに必要なXPがありません!");
            return;
        }

        // リロード量を計算 (XP の範囲内、かつ、上限を超えない)
        const reloadAmount = Math.min(availableXp, this.maxAmmo - currentAmmo);

        // リロード量が 0 の場合は、処理を中断
        if (reloadAmount <= 0) {
            player.onScreenDisplay.setActionBar("§cリロードに必要なXPがありません!");
            return;
        }

        this.reloadingPlayers.set(playerName, { endTime: system.currentTick + this.reloadTicks, reloadAmount });
        this.updateActionBar(player);

        system.run(() => {
            this.playSound(player, "random.lever_click", { pitch: 0.8 }); // よりリアルなリロード音

            system.runTimeout(() => {
                // XP を消費 (常に消費)
                player.addLevels(-reloadAmount);
                this.ammo.set(playerName, currentAmmo + reloadAmount);
                this.reloadingPlayers.delete(playerName);
                this.updateActionBar(player);
                this.playSound(player, "item.shield.block", { pitch: 1.5 });  // リロード完了音をより適切に
            }, this.reloadTicks);
        });
    }
    protected fireProjectile(player: Player, onHit: (hitEntity: Entity, damage: number) => void) {

        const headLocation = player.getHeadLocation();
        const direction = player.getViewDirection();

        if (headLocation.y < -64 || headLocation.y > 319) {
            player.onScreenDisplay.setActionBar("初期位置が不正です");
            return;
        }

        const raycastOptions: EntityRaycastOptions = { maxDistance: this.maxRange };
        const hitResult = player.getEntitiesFromViewDirection(raycastOptions)[0];
        const hitEntity = hitResult?.entity;
        const hitDistance = hitResult ? distance(headLocation, hitResult.entity.location) : this.maxRange;

        for (let d = 0; d <= this.maxRange; d += this.bulletSpeed) {
            const delayTicks = d / this.bulletSpeed;
            system.runTimeout(() => {
                try {
                    const particlePos: Vector3 = {
                        x: headLocation.x + direction.x * d,
                        y: Math.min(319, Math.max(-64, headLocation.y + direction.y * d)),
                        z: headLocation.z + direction.z * d
                    };
                    player.dimension.spawnParticle(this.particleId, particlePos);

                    if (hitEntity && d >= hitDistance) {
                        const damage = Math.max(this.minDamage, this.maxDamage / (1 + 0.2 * hitDistance));
                        onHit(hitEntity, damage);
                        return;
                    }
                } catch (error: any) {
                    console.error("Error in projectile loop:", error, error.stack);
                }
            }, delayTicks);
        }
    }


    protected updateActionBar(player: Player) {

        system.run(() => {
            const itemStack = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
            if (!itemStack || itemStack.typeId !== this.item || itemStack.nameTag !== this.name) {
                return;
            }

            const playerName = player.name;
            const ammoCount = this.ammo.get(playerName) ?? this.maxAmmo;
            const reloadingData = this.reloadingPlayers.get(playerName);


            if (this.reloadPromptShown.get(playerName)) {
                this.reloadPromptShown.set(playerName, false);
                return;
            }

            if (reloadingData) {
                const remainingTicks = reloadingData.endTime - system.currentTick;
                const remainingSeconds = (remainingTicks / 20).toFixed(1);

                if (remainingTicks > 0) {
                    const reloadProgress = Math.floor((reloadingData.reloadAmount * (this.reloadTicks - remainingTicks)) / this.reloadTicks);
                    player.onScreenDisplay.setActionBar(`リロード中... (${remainingSeconds}秒)  [${reloadProgress} / ${reloadingData.reloadAmount}]`);
                } else {

                    player.onScreenDisplay.setActionBar(`§aリロード完了!  ${ammoCount} / ${this.maxAmmo}`);
                }
            } else {

                if (ammoCount > 0) {
                    const ammoDisplay = `${ammoCount} / ${this.maxAmmo}`;
                    player.onScreenDisplay.setActionBar(`残弾数: ${ammoDisplay}`);
                }
            }
        });
    }
    protected playSound(player: Player, soundId: string, options?: PlayerSoundOptions, world?: boolean) {
        system.run(() => {
            if (!world) {
                player.playSound(soundId, options);
            }
            if (world) {
                player.dimension.playSound(soundId, player.location, options)
            }
        })
    }

    protected checkCooldown(player: Player): boolean {
        const playerName = player.name;
        if (this.cooldowns.has(playerName)) {
            const endTick = this.cooldowns.get(playerName)!;
            if (system.currentTick < endTick) {
                const remainingSeconds = ((endTick - system.currentTick) / 20).toFixed(1);
                system.run(() => {
                    player.onScreenDisplay.setActionBar(`§cクールダウン中§6(§f${remainingSeconds}§6秒)`);
                });
                return true;
            }
        }
        return false;
    }

    protected showReloadPrompt(player: Player) {
        const playerName = player.name;
        system.run(() => {
            this.playSound(player, "mob.villager.no");
            player.onScreenDisplay.setActionBar("§c弾切れです! ブロック/エンティティを攻撃してリロードしてください。");
            this.reloadPromptShown.set(playerName, true);

        });
    }
}

// --- Pistol クラス ---
class Pistol extends BaseGun {
    constructor() {
        const pistolLore = [
            "§7----- Pistol Status -----",
            "",
            "  Damage  |  §c" + 5 + " - " + 10,
            "  Range   |  §a" + 10,
            "  Ammo    |  §b" + 16,
            "",
            "  Fire      |  右クリ/RightClick",
            "  Reload    |  攻撃/Attack(§eXP§r)",
            "",
            "§7----- " + (40 / 20) + "s Reload -----",
        ];
        super("§bピストル", pistolLore, "minecraft:wooden_hoe", 16, 10, 5, 10, 1, 40, "minecraft:balloon_gas_particle", 1);
    }

    use(player: Player) {
        const playerName = player.name;

        if (this.reloadingPlayers.has(playerName)) { 
            return;
        }
        if (this.checkCooldown(player)) { 
            return;
        }


        let currentAmmo = this.ammo.get(playerName) ?? this.maxAmmo;

        if (currentAmmo <= 0) {
            this.showReloadPrompt(player);
            return;
        }

        this.ammo.set(playerName, --currentAmmo);
        this.cooldowns.set(playerName, system.currentTick + this.cooldownTicks);
        this.updateActionBar(player);

        system.run(() => {
            this.playSound(player, "fire.ignite", { pitch: 1.9, volume: 0.7 }, true); 
            this.playSound(player, "ambient.weather.rain", { pitch: 2.2, volume: 0.3 }, true);
            system.runTimeout(() => {
                this.playSound(player, "random.pop", { pitch: 1.5, volume: 0.3 }, true); 
            }, 2)


            this.fireProjectile(player,
                (hitEntity, damage) => { hitEntity.applyDamage(damage, { damagingEntity: player, cause: EntityDamageCause.entityAttack }); }
            );
        });
    }
}

// --- AssaultRifle クラス ---
class AssaultRifle extends BaseGun {
    private burstIntervalTicks = 1;
    constructor() {
        const assaultRifleLore = [
            "§7----- Assault Rifle Status -----",
            "",
            "  Damage      |  §c" + 1 + " - " + 3,
            "  Range       |  §a" + 20,
            "  Ammo        |  §b" + 32,
            "  Burst       |  §63",
            "",
            "  Fire        |  右クリ/RightClick",
            "  Reload      |  攻撃/Attack(§eXP§r)",
            "",
            "§7----- " + (60 / 20) + "s Reload / " + 1 + "tick Burst -----",
        ];
        super("§aアサルトライフル", assaultRifleLore, "minecraft:iron_hoe", 32, 3, 1, 20, 1, 60, "minecraft:falling_border_dust_particle", 1.5);
    }

    use(player: Player) {
        const playerName = player.name;

        if (this.reloadingPlayers.has(playerName)) {
            return;
        }
        if (this.checkCooldown(player)) {
            return;
        }

        let currentAmmo = this.ammo.get(playerName) ?? this.maxAmmo;

        if (currentAmmo <= 0) {
            this.showReloadPrompt(player);
            return;
        }

        // バースト射撃関数 (クロージャを使用)
        const fireBurst = (shotCount: number) => {
            system.run(() => {
                if (shotCount <= 0) {
                    this.cooldowns.set(playerName, system.currentTick + this.cooldownTicks);
                    return;
                }

                if (currentAmmo <= 0) {
                    this.showReloadPrompt(player);
                    return;
                }

                this.ammo.set(playerName, --currentAmmo);
                this.updateActionBar(player);

                // よりリアルなアサルトライフルの射撃音
                this.playSound(player, "fire.ignite", { pitch: 1.6, volume: 0.5 }, true);
                this.playSound(player, "cauldron.explode", { pitch: 1.2, volume: 0.2 }, true);  // 小さな爆発音で、発砲の衝撃を表現
                system.runTimeout(() => {
                    this.playSound(player, "random.pop", { pitch: 1.8, volume: 0.15 }, true); // 薬莢の音（高め）
                }, 1);


                this.fireProjectile(player,
                    (hitEntity, damage) => { hitEntity.applyDamage(damage, { damagingEntity: player, cause: EntityDamageCause.entityAttack }); }
                );

                system.runTimeout(() => { fireBurst(shotCount - 1); }, this.burstIntervalTicks);
            });
        };
        const burstCount = 3;
        fireBurst(burstCount);
    }
}

// --- SniperRifle クラス ---
class SniperRifle extends BaseGun {
    constructor() {
        const sniperRifleLore = [
            "§7----- Sniper Rifle Status -----",
            "",
            "  Damage  |  §c" + 20 + " - " + 40,
            "  Range   |  §a" + 50,
            "  Ammo    |  §b" + 5,
            "",
            "  Fire      |  右クリ/RightClick",
            "  Reload    |  攻撃/Attack(§eXP§r)",
            "",
            "§7----- " + (80 / 20) + "s Reload -----",
        ];
        super("§dスナイパーライフル", sniperRifleLore, "minecraft:golden_hoe", 5, 40, 20, 50, 40, 80, "minecraft:dragon_breath_fire", 3);
    }

    use(player: Player) {
        const playerName = player.name;
        if (this.reloadingPlayers.has(playerName)) {
            return
        }
        if (this.checkCooldown(player)) {
            return;
        }


        let currentAmmo = this.ammo.get(playerName) ?? this.maxAmmo;

        if (currentAmmo <= 0) {
            this.showReloadPrompt(player);
            return;
        }
        this.ammo.set(playerName, --currentAmmo);
        this.cooldowns.set(playerName, system.currentTick + this.cooldownTicks);
        this.updateActionBar(player);

        this.playSound(player, "ambient.weather.thunder", { pitch: 1.2, volume: 0.8 }, true);
        system.runTimeout(() => this.playSound(player, "random.explode", { pitch: 1.5, volume: 0.6 }, true), 2);

        this.fireProjectile(player, (hitEntity, damage) => {
            hitEntity.applyDamage(damage, { damagingEntity: player, cause: EntityDamageCause.entityAttack });
        });
    }
}

function distance(pos1: Vector3, pos2: Vector3): number {
    return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2 + (pos1.z - pos2.z) ** 2);
}

// インスタンス生成と登録
const pistol = new Pistol();
const assaultRifle = new AssaultRifle();
const sniperRifle = new SniperRifle();
registerCustomItem(3, assaultRifle.customItem);
registerCustomItem(4, pistol.customItem);
registerCustomItem(5, sniperRifle.customItem);