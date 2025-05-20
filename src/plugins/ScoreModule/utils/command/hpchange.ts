import { EntityHealthComponent, Player } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";



export function registerChangeHPCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('changeHP', {
        moduleName: moduleName,
        description: `プレイヤーのHPを指定した数値に変更します`,
        usage: `changeHP <数値>`,
        execute: (_message, event, args) => {
            const player = event.sourceEntity;
            if (player instanceof Player) {
                if (args.length < 1) {
                    player.sendMessage("§c数値を指定してください。");
                    return;
                }
                const hp = parseInt(args[0], 10);
                if (isNaN(hp) || hp < 0) {
                    player.sendMessage("§c有効なHP値を入力してください。");
                    return;
                }
                const healthComp = player.getComponent("minecraft:health") as EntityHealthComponent;
                const max = typeof healthComp.effectiveMax === "number" ? healthComp.effectiveMax : healthComp.currentValue;
                const newHp = Math.min(hp, max);
                healthComp.setCurrentValue(newHp);
            }
        },
    });
}