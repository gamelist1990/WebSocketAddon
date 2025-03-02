import {
    Player,
    system,
    PlayerSoundOptions,
    VectorXZ,
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

const upBlowWoodenSword = new CustomItem({
    name: "§6アッパーソード",
    lore: ["§7使用すると上方向に吹き飛ばされる"],
    item: "minecraft:wooden_sword",
}).then((player: Player) => {
    system.run(() => {
        const playerLocation = player.location;

        if (playerLocation.y <= -40) {
            const horizontalForce: VectorXZ = { x: 0, z: 0 };
            //@ts-ignore
            player.applyKnockback(horizontalForce, 3);

            const mainSoundOptions: PlayerSoundOptions = {
                volume: 1.0,
                pitch: 1.0,
            };

            const subSoundOptions: PlayerSoundOptions = {
                volume: 0.6,
                pitch: 1.2,
            };
            player.playSound("strong_wind", mainSoundOptions);

            system.runTimeout(() => {
                player.playSound("ambient.cave", subSoundOptions);
            }, 3);
            upBlowWoodenSword.removeItem(player, upBlowWoodenSword.get());
        } else {
            player.sendMessage("§cこの高さではアッパーソードは使用できません！");
        }
    });
});

registerCustomItem(2, upBlowWoodenSword);
