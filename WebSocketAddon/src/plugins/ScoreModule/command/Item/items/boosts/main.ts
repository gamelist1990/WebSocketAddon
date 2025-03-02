import { Player, system, EffectTypes, PlayerSoundOptions, VectorXZ } from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

// --- アイテム定義 ---
const boostFeather = new CustomItem({
    name: "§bHiveの羽",
    lore: ["§7使用すると前方向にダッシュし", "§7一時的に移動速度が上昇する"], // §7 で色を灰色に
    item: "minecraft:feather",
    amount: 1,
    remove: true,
}).then((player: Player) => {

    system.run(() => {
        const direction = player.getViewDirection();
        const horizontalForce: VectorXZ = { x: direction.x * 4, z: direction.z * 4 }
        //@ts-ignore
        player.applyKnockback(horizontalForce, 0.6);



        // 移動速度上昇のエフェクトを付与 (3秒間)
        player.addEffect(EffectTypes.get("speed")!, 60, {
            amplifier: 2,
            showParticles: false
        });

        // サウンドを再生 (複数のサウンドを組み合わせ、ディレイで臨場感を出す)
        const mainSoundOptions: PlayerSoundOptions = {
            volume: 1.0,
            pitch: 1.0,
        };

        const subSoundOptions: PlayerSoundOptions = {
            volume: 0.7,
            pitch: 1.2, // 少し高めにして変化をつける
        };
        const subSoundOptions2: PlayerSoundOptions = {
            volume: 0.4,
            pitch: 0.9, // 少し低めにして変化をつける
        };

        // メインのサウンド (例: 馬のジャンプ音)
        player.playSound("mob.horse.jump", mainSoundOptions);

        system.runTimeout(() => {
            player.playSound("mob.blaze.shoot", subSoundOptions); // 例: ブレイズの発射音
        }, 3); // 3 tick 後 (0.15秒) に再生

        system.runTimeout(() => {
            player.playSound("mob.elytra.loop", subSoundOptions2);
        }, 5);
        system.runTimeout(() => {
            player.playSound("mob.blaze.breathe", subSoundOptions2);
        }, 7);

    })
});

registerCustomItem(1,boostFeather)