import { Player, system } from "@minecraft/server";
import { Handler } from "../../../module/Handler";



export function registerTransfer(handler: Handler, moduleName: string) {
    handler.registerCommand('transfer', {
        moduleName: moduleName,
        description: `別のサーバーに転送`,
        usage: `ip:port 例: transfer 2b2e.org:19132`,
        execute: (message, event) => {
            const args = message.split(':');

            if (args.length != 2) {
                const player = event.sourceEntity;
                if (player instanceof Player) {
                    player.sendMessage(`形式はip:portです`);
                    return
                }
            }
            if (args) {
                const ip = args[0];
                const port = parseInt(args[1], 10);
                const player = event.sourceEntity;
                if (player instanceof Player) {
                    if (isNaN(port)) {
                        player.sendMessage(`Portは数値にしてください例:19132`);
                        return;
                    }
                    runTransferCommand(player, ip, port);
                }
            }
        },
    });
}


/**
 * 
 * @param player 
 * @param ip 
 * @param port 
 */
function runTransferCommand(player: Player, ip: string, port: number) {
    system.runTimeout(() => {
        //@ts-ignore
        transferPlayer(player, ip, port);
    })
}