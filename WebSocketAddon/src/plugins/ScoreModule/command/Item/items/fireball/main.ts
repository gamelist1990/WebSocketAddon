import {
    Player,
    system,
    PlayerSoundOptions,
    EntityDamageSource,
    EntityDamageCause
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

const fireballItem = new CustomItem({
    name: "§cファイヤーボール",
    lore: [
        "§7下方向: 見た地点を爆破",
        "§7真ん中/上方向: ファイヤーボールを発射",
    ],
    item: "minecraft:fire_charge",
}).then((player: Player) => {
    system.run(() => {

        const rot = player.getRotation();
        const pitchRadians = rot.y * Math.PI / 180;
        const yawRadians = rot.x * Math.PI / 180;

        const viewDirectionX = -Math.sin(yawRadians) * Math.cos(pitchRadians);
        const viewDirectionY = -Math.sin(pitchRadians);
        const viewDirectionZ = Math.cos(yawRadians) * Math.cos(pitchRadians);

        // 下方向判定
        if (viewDirectionY < -0.7) {
            const playerLocation = player.location;
            const maxDistance = 5;

            let blockLocation: { x: number; y: number; z: number } | undefined = undefined;

            for (let i = 0; i <= maxDistance * 10; i++) {
                const t = i / 10;
                const checkX = playerLocation.x + viewDirectionX * t;
                const checkY = playerLocation.y + viewDirectionY * t;
                const checkZ = playerLocation.z + viewDirectionZ * t;

                const checkBlock = player.dimension.getBlock({ x: Math.floor(checkX), y: Math.floor(checkY), z: Math.floor(checkZ) });
                if (checkBlock && checkBlock.permutation.type.id !== "minecraft:air") {
                    blockLocation = { x: Math.floor(checkX), y: Math.floor(checkY), z: Math.floor(checkZ) }
                    break;
                }
            }


            if (blockLocation) {
                player.dimension.createExplosion(blockLocation, 2, {
                    breaksBlocks: true,
                    source: player
                });

                const soundOptions: PlayerSoundOptions = {
                    volume: 1.0,
                    pitch: 1.0
                };
                player.playSound("random.explode", soundOptions);
                const damageRadius = 2;
                const damageAmount = 1;

                const entities = player.dimension.getEntities({
                    location: blockLocation,
                    maxDistance: damageRadius,
                });


                const damageSource: EntityDamageSource = ({
                    cause: EntityDamageCause.entityExplosion,
                    damagingEntity: player,
                });


                for (const entity of entities) {
                    entity.applyDamage(damageAmount, damageSource);
                }

                fireballItem.removeItem(player, fireballItem.get());
            }

        } else {
            const headLocation = {
                x: player.location.x,
                y: player.location.y + 1.62,
                z: player.location.z,
            };

            const fireball = player.dimension.spawnEntity(
                "minecraft:fireball",
                headLocation
            );

            // applyImpulse にオブジェクトリテラルを渡す
            fireball.applyImpulse({
                x: viewDirectionX * 2,
                y: viewDirectionY * 2,
                z: viewDirectionZ * 2,
            });

            const soundOptions: PlayerSoundOptions = {
                volume: 1.0,
                pitch: 1.0
            };
            player.playSound("mob.blaze.shoot", soundOptions);
            fireballItem.removeItem(player, fireballItem.get());

            system.runTimeout(() => {
                fireball.kill();
            }, 100);
        }
    });
});

registerCustomItem(5, fireballItem);