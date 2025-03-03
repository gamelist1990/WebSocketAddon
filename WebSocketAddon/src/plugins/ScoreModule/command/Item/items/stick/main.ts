import {
    Player,
    PlayerSoundOptions,
    system,
    Vector3,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

const sumoStickItem = new CustomItem({
    name: "§bSumo Stick",
    lore: [
        "§7殴るとぉ？パーティクルを出す！"
        ],
    item: "minecraft:stick",
    remove: false,
}).then((player: Player, eventData) => {
    system.run(() => {
        // エンティティヒット時のみ処理
        if (!eventData.hitResult || !eventData.hitResult.entity || eventData.eventType !== EventType.EntityHit) {
            return;
        }
        const entityHit = eventData.hitResult.entity;

        // パーティクルの量を増やす定数
        const particleCount = 50;

        // パーティクルを複数回スポーン
        for (let i = 0; i < particleCount; i++) {
            const offset: Vector3 = {
                x: (Math.random() - 0.5) * 1.5,
                y: (Math.random()) * 2 + 1,
                z: (Math.random() - 0.5) * 1.5,
            };
            entityHit.dimension.spawnParticle("minecraft:villager_happy", {
                x: entityHit.location.x + offset.x,
                y: entityHit.location.y + offset.y,
                z: entityHit.location.z + offset.z,
            });
        }

        // 重厚感サウンド (音量調整版)
        function playHeavySound() {

            // メインの音 (音量とピッチを調整)
            const mainSoundOptions: PlayerSoundOptions = {
                volume: 0.7,  // 音量を下げる
                pitch: 0.6,   // ピッチを少し上げる (低音を少し弱める)
            };
            player.playSound("mob.blaze.hit", mainSoundOptions);

            // 重低音 (音量を大幅に下げる)
            const bassSoundOptions: PlayerSoundOptions = {
                volume: 0.25, // 音量を大幅に下げる
                pitch: 0.4,
            };
            system.runTimeout(() => {
                player.playSound("random.explode", bassSoundOptions);
            }, 1);

            // 金属音 (音量を下げる)
            const metallicSoundOptions: PlayerSoundOptions = {
                volume: 0.2, // 音量を下げる
                pitch: 0.7,
            };
            system.runTimeout(() => {
                player.playSound("random.anvil_land", metallicSoundOptions);
            }, 3);

            // キラキラ音 (さらに音量を下げる)
            const subSound1Options: PlayerSoundOptions = {
                volume: 0.15, // さらに音量を下げる
                pitch: 1.2,
            };
            system.runTimeout(() => {
                player.playSound("random.orb", subSound1Options);
            }, 5);
        }

        playHeavySound();
    });
});

registerCustomItem(6, sumoStickItem);