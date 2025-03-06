import { Player, system, PlayerSoundOptions } from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

export class MagmaBomb {
    static readonly config = {
        id: 15,
        name: "§cマグマボム",
        lore: [
            "§7使用すると3ブロック先で爆発する",
            "§eStatus:",
            "  §f- 攻撃力: §c1-3",
            "  §f- 特殊効果: §c爆発と炎の粒子",
            "  §f- 爆発力: §c中",
            "  §f- 説明: 不安定なマグマの塊。投げると爆発する。",
            "§c注意: 使用者も吹き飛ばされます"
        ],
        item: "minecraft:magma_cream",
        particle: "minecraft:huge_explosion_emitter",
        particleCount: 1,
        soundOptions: {
            mainSound: [
                { sound: "random.explode", volume: 1.0, pitch: 1.2 },
                { sound: "mob.blaze.shoot", volume: 0.6, pitch: 0.8, delay: 1 },
                { sound: "fire.fire", volume: 0.4, pitch: 1.0, delay: 3 }
            ],
        },
        knockback: {
            horizontalStrength: 2.0,
            verticalStrength: 1.0
        }
    };

    static register(): void {
        const customMagmaBomb = new CustomItem({
            name: this.config.name,
            lore: this.config.lore,
            item: this.config.item,
            remove: true,
        }).then((player: Player, eventData) => {
            if (eventData.eventType !== EventType.ItemUse) return;
            this.handleUse(player);
        });

        registerCustomItem(this.config.id, customMagmaBomb);
    }

    private static handleUse(player: Player): void {
        system.run(() => {
            const spawnPos = this.calculateSpawnPosition(player);
            this.spawnEffects(player, spawnPos);
            this.playSound(player);
            this.applyExplosionEffects(player, spawnPos);
        });
    }

    private static calculateSpawnPosition(player: Player) {
        const direction = player.getViewDirection();
        return {
            x: player.location.x + direction.x * 3,
            y: player.location.y + direction.y * 3 + 1,
            z: player.location.z + direction.z * 3
        };
    }

    private static spawnEffects(player: Player, spawnPos: { x: number, y: number, z: number }): void {
        player.dimension.spawnParticle(this.config.particle, spawnPos);

        for (let i = 0; i < 20; i++) {
            const offset = {
                x: (Math.random() - 0.5) * 2,
                y: (Math.random() - 0.5) * 2,
                z: (Math.random() - 0.5) * 2
            };
            player.dimension.spawnParticle("minecraft:basic_flame_particle", {
                x: spawnPos.x + offset.x,
                y: spawnPos.y + offset.y,
                z: spawnPos.z + offset.z
            });
        }
    }

    private static playSound(player: Player): void {
        for (const soundInfo of this.config.soundOptions.mainSound) {
            const options: PlayerSoundOptions = {
                volume: soundInfo.volume,
                pitch: soundInfo.pitch
            };
            if (soundInfo.delay) {
                system.runTimeout(() => {
                    player.playSound(soundInfo.sound, options);
                }, soundInfo.delay);
            } else {
                player.playSound(soundInfo.sound, options);
            }
        }
    }

    private static applyExplosionEffects(player: Player, spawnPos: { x: number, y: number, z: number }): void {
        const nearbyEntities = [...player.dimension.getEntities({
            location: spawnPos,
            maxDistance: 5
        })];

        for (const entity of nearbyEntities) {
            const dx = entity.location.x - spawnPos.x;
            const dy = entity.location.y - spawnPos.y;
            const dz = entity.location.z - spawnPos.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance > 0) {
                const knockbackMultiplier = (5 - distance) / 5;
                if (knockbackMultiplier > 0) {
                    const knockbackForce = {
                        x: (dx / distance) * this.config.knockback.horizontalStrength * knockbackMultiplier,
                        z: (dz / distance) * this.config.knockback.horizontalStrength * knockbackMultiplier
                    };

                    //@ts-ignore
                    entity.applyKnockback(
                        knockbackForce,
                        this.config.knockback.verticalStrength * knockbackMultiplier
                    );

                    if (entity !== player) {
                        entity.applyDamage(Math.random() * 2 + 1);
                    }
                }
            }
        }
    }
}