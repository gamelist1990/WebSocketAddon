import {
    Player,
    PlayerSoundOptions,
    system,
    Vector3,
    Entity
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

interface StickItemData {
    id: number;
    name: string;
    lore: string[];
    item: string;
    particle: string;
    particleCount: number;
    soundOptions: {
        mainSound: { sound: string; volume: number; pitch: number; delay?: number; }[];
    };
    knockback?: {
        horizontalStrength: number;
        verticalStrength: number;
    };
}

const stickItemsData: StickItemData[] = [
    {
        id: 7,
        name: "§bSumo Stick",
        lore: [
            "§7殴るとぉ？パーティクルを出す！",
            "§7一般的に使われている§bSumo Stick",
            "§eStatus:",
            "  §f- 攻撃力: §a並",
            "  §f- 特殊効果: §eパーティクル発生",
            "  §f- 汎用性: §b高",
            "  §f- 説明: 基本的なSumo Stick。訓練用に最適。"
        ],
        item: "minecraft:stick",
        particle: "minecraft:villager_happy",
        particleCount: 10,
        soundOptions: {
            mainSound: [
                { sound: "mob.blaze.hit", volume: 0.7, pitch: 0.6 },
                { sound: "random.explode", volume: 0.25, pitch: 0.4, delay: 1 },
                { sound: "random.anvil_land", volume: 0.2, pitch: 0.7, delay: 3 },
                { sound: "random.orb", volume: 0.15, pitch: 1.2, delay: 5 },
            ],
        },
    },
    {
        id: 8,
        name: "§aNature Stick",
        lore: [
            "§7自然の力を感じる...",
            "§7なぜ殴ると葉じゃなくて雪なのか...(真相は不明)",
            "§eStatus:",
            "  §f- 攻撃力: §a並",
            "  §f- 特殊効果: §b雪の粒子",
            "  §f- 自然属性: §a高",
            "  §f- 説明: 自然の精霊が宿る杖。隠された力を持つ...?"
        ],
        item: "minecraft:bamboo",
        particle: "minecraft:falling_dust_top_snow_particle",
        particleCount: 30,
        soundOptions: {
            mainSound: [
                { sound: "mob.sheep.say", volume: 0.8, pitch: 1.2 },
                { sound: "dig.grass", volume: 0.6, pitch: 0.9, delay: 1 },
                { sound: "ambient.weather.rain", volume: 0.4, pitch: 1.5, delay: 3 },
            ],
        }
    },
    {
        id: 9,
        name: "§6Fire Stick",
        lore: [
            "§7炎の力が宿っている！",
            "§7熱々だよ",
            "§eStatus:",
            "  §f- 攻撃力: §c並",
            "  §f- 特殊効果: §6炎の粒子",
            "  §f- 火炎属性: §6極大",
            "  §f- 説明: 灼熱の炎をまとう杖。取り扱いに注意。"
        ],
        item: "minecraft:blaze_rod",
        particle: "minecraft:basic_flame_particle",
        particleCount: 40,
        soundOptions: {
            mainSound: [
                { sound: "mob.blaze.breathe", volume: 0.9, pitch: 0.8 },
                { sound: "fire.ignite", volume: 0.7, pitch: 1.0, delay: 1 },
                { sound: "random.fizz", volume: 0.4, pitch: 1.3, delay: 2 },
                { sound: "fire.fire", volume: 0.2, pitch: 0.8, delay: 2 },
            ],
        },
    },
    {
        id: 10,
        name: "§3Aqua Stick",
        lore: [
            "§7水の力を解き放て！",
            "§7水の純水精霊lv100",
            "§eStatus:",
            "  §f- 攻撃力: §b並",
            "  §f- 特殊効果: §3泡の粒子",
            "  §f- 水属性: §3極大",
            "  §f- 説明: 水の精霊の加護を受けた杖。浄化の力を持つ。"
        ],
        item: "minecraft:diamond_sword",
        particle: "minecraft:bubble_pop",
        particleCount: 60,
        soundOptions: {
            mainSound: [
                { sound: "liquid.water", volume: 0.7, pitch: 1.1 },
                { sound: "random.splash", volume: 0.8, pitch: 0.9, delay: 0.5 },
                { sound: "liquid.lava", volume: 0.2, pitch: 0.6, delay: 2 },
                { sound: "mob.guardian.death", volume: 0.3, pitch: 1.5, delay: 1 },
            ],
        }
    },
    {
        id: 11,
        name: "§dMagic Stick",
        lore: [
            "§7魔法の力を秘めた杖",
            "§7どこぞの宅急便が愛用してた杖",
            "§eStatus:",
            "  §f- 攻撃力: §b並",
            "  §f- 特殊効果: §dトーテム粒子",
            "  §f- 魔法属性: §d高",
            "  §f- 説明: 古代魔法が封印された杖。未知の力を秘める。"
        ],
        item: "minecraft:prismarine_crystals",
        particle: "minecraft:totem_particle",
        particleCount: 25,
        soundOptions: {
            mainSound: [
                { sound: "random.levelup", volume: 0.6, pitch: 1.2 },
                { sound: "mob.endermen.portal", volume: 0.8, pitch: 0.9, delay: 0.5 },
                { sound: "mob.shulker.shoot", volume: 0.4, pitch: 1.4, delay: 1.5 },
                { sound: "firework.twinkle", volume: 0.6, pitch: 0.9, delay: 1 },
            ],
        }
    },
    {
        id: 12,
        name: "§5Super Stick",
        lore: [
            "§8エンドの力を凝縮した杖",
            "§8全てを無に還す...?",
            "§8エンドラ抹殺",
            "§eStatus:",
            "  §f- 攻撃力: §8極大",
            "  §f- 特殊効果: §5ドラゴンの息吹",
            "  §f- 虚無属性: §8極大",
            "  §f- 説明: 終焉の力を宿した杖。全てを破壊する。",
            "§c危険: 使用には十分注意してください。"
        ],
        item: "minecraft:end_rod",
        particle: "minecraft:dragon_breath_trail",
        particleCount: 70,
        soundOptions: {
            mainSound: [
                { sound: "mob.enderdragon.growl", volume: 1.0, pitch: 0.7 },
                { sound: "mob.endermen.stare", volume: 0.8, pitch: 0.5, delay: 0.5 },
                { sound: "ambient.weather.thunder", volume: 0.4, pitch: 0.8, delay: 1 },
                { sound: "entity.enderdragon.flap", volume: 0.6, pitch: 1.3, delay: 1 },
                { sound: "item.trident.thunder", volume: 0.9, pitch: 0.5, delay: 2 },

            ],
        },
    },
    {
        id: 13,
        name: "§7Wind Stick",
        lore: [
            "§7風を操る力を秘めた杖",
            "§7ブリーズのように...",
            "§eStatus:",
            "  §f- 攻撃力: §a並",
            "  §f- 特殊効果: §7風の粒子",
            "  §f- 風属性: §7高",
            "  §f- 説明: 風の精霊が宿る杖。空を舞う力を得る。"
        ],
        item: "minecraft:breeze_rod",
        particle: "minecraft:wind_charged_emitter",
        particleCount: 15,
        soundOptions: {
            mainSound: [
                { sound: "mob.breeze.idle", volume: 0.4, pitch: 1.0 },
                { sound: "wind_charge.burst", volume: 0.3, pitch: 0.8, delay: 0.5 }
            ],
        },
    },
    {
        id: 14,
        name: "§eNimo",
        lore: [
            "§7殴るとぽん！と音がする",
            "§eStatus:",
            "  §f- 攻撃力: §e皆無",
            "  §f- 特殊効果: §eかわいい音",
            "  §f- 癒し効果: §e極大",
            "  §f- 説明: 戦闘には全く向かない。ただ可愛い。"
        ],
        item: "minecraft:tropical_fish",
        particle: "minecraft:bubble_pop_particle",
        particleCount: 1,
        soundOptions: {
            mainSound: [
                { sound: "bubble.pop", volume: 1.0, pitch: 1.0 },
            ],
        }
    },
];

for (const stickData of stickItemsData) {
    const customStick = new CustomItem({
        name: stickData.name,
        lore: stickData.lore,
        item: stickData.item,
        remove: false,
    }).then((player: Player, eventData) => {
        system.run(() => {
            if (!eventData.hitResult || !eventData.hitResult.entity || eventData.eventType !== EventType.EntityHit) {
                return;
            }
            const entityHit: Entity = eventData.hitResult.entity;

            if (stickData.knockback) {
                const directionX = entityHit.location.x - player.location.x;
                const directionZ = entityHit.location.z - player.location.z;
                const magnitude = Math.sqrt(directionX * directionX + directionZ * directionZ);
                const horizontalDirX = magnitude > 0 ? directionX / magnitude : 0;
                const horizontalDirZ = magnitude > 0 ? directionZ / magnitude : 0;
                const horizontalForceX = horizontalDirX * stickData.knockback.horizontalStrength;
                const horizontalForceZ = horizontalDirZ * stickData.knockback.horizontalStrength;


                //Minecraft/server-alpha版
                //@ts-ignore
                entityHit.applyKnockback(
                    { x: horizontalForceX, z: horizontalForceZ },
                    stickData.knockback.verticalStrength
                );
            }


            for (let i = 0; i < stickData.particleCount; i++) {
                const offset: Vector3 = {
                    x: (Math.random() - 0.5) * 1.5,
                    y: (Math.random()) * 2 + 1,
                    z: (Math.random() - 0.5) * 1.5,
                };
                entityHit.dimension.spawnParticle(stickData.particle, {
                    x: entityHit.location.x + offset.x,
                    y: entityHit.location.y + offset.y,
                    z: entityHit.location.z + offset.z,
                });
            }


            function playCustomSound() {
                for (const soundInfo of stickData.soundOptions.mainSound) {
                    const options: PlayerSoundOptions = {
                        volume: soundInfo.volume,
                        pitch: soundInfo.pitch,
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
            playCustomSound();
        });
    });
    registerCustomItem(stickData.id, customStick);
}