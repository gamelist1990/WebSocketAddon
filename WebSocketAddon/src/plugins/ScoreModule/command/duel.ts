import { Handler } from "../../../module/Handler";
import { Player, world, Vector3 } from "@minecraft/server";
import { DuelManager } from "../utils/duel";

export function registerDuelCommand(handler: Handler, moduleName: string) {
    const duelManager = new DuelManager();

    handler.registerCommand("duel", {
        moduleName: moduleName,
        description: "プレイヤー間のデュエルを管理します。",
        usage:
            "duel create <名前> <x1> <y1> <z1> <x2> <y2> <z2> <キット> <終了x> <終了y> <終了z>\n" +
            "duel form\n" +
            "duel show\n" +
            "duel automatch\n" +
            "duel r <プレイヤー名> [マップ名]\n" +
            "duel a <プレイヤー名>\n" +
            "duel leave (退出)\n" +
            "duel kit <キット名> <x1> <y1> <z1> [x2] [y2] [z2]",
        execute: (_message, event,args) => {
            const player = event.sourceEntity;
            const subCommand = args[0] ? args[0].toLowerCase() : "";

            if (args.length < 1) {
                const msg = "§c無効なデュエルコマンドです。`/help duel`で使用法を確認してください。";
                if (player instanceof Player) {
                    player.sendMessage(msg);
                } else {
                    console.warn(msg);
                }
                return;
            }


            switch (subCommand) {
                case "create": {
                    if (args.length !== 12) {
                        const errorMessage = "§c使用法: duel create <名前> <x1> <y1> <z1> <x2> <y2> <z2> <キット> <終了x> <終了y> <終了z>";
                        if (player instanceof Player) {
                            player.sendMessage(errorMessage);
                        } else {
                            console.warn(errorMessage);
                        }
                        return;
                    }
                    const name = args[1];
                    const x1 = parseFloat(args[2]);
                    const y1 = parseFloat(args[3]);
                    const z1 = parseFloat(args[4]);
                    const x2 = parseFloat(args[5]);
                    const y2 = parseFloat(args[6]);
                    const z2 = parseFloat(args[7]);
                    const kit = args[8].toLowerCase();
                    const endX = parseFloat(args[9]);
                    const endY = parseFloat(args[10]);
                    const endZ = parseFloat(args[11]);


                    if (isNaN(x1) || isNaN(y1) || isNaN(z1) || isNaN(x2) || isNaN(y2) || isNaN(z2) || isNaN(endX) || isNaN(endY) || isNaN(endZ)) {
                        const errorMessage = "§c無効な座標、キット、または終了位置です。";
                        if (player instanceof Player) {
                            player.sendMessage(errorMessage);
                        } else {
                            console.warn(errorMessage);
                        }
                        return;
                    }

                    duelManager.addDuelConfig(name, {
                        name: name,
                        pos1: { x: x1, y: y1, z: z1 },
                        pos2: { x: x2, y: y2, z: z2 },
                        kit: kit,
                        endPos: { x: endX, y: endY, z: endZ },
                    });
                    break;
                }
                case "kit": {
                    // "duel kit <キット名> <x1> <y1> <z1> [x2] [y2] [z2]"
                    if (args.length < 5 || args.length === 6 || args.length > 8) {
                        const errorMessage = "§c使用法: duel kit <キット名> <x1> <y1> <z1> [x2] [y2] [z2]";
                        if (player instanceof Player) {
                            player.sendMessage(errorMessage);
                        } else {
                            console.warn(errorMessage);
                        }
                        return;
                    }

                    const kitName = args[1];
                    const x1 = parseFloat(args[2]);
                    const y1 = parseFloat(args[3]);
                    const z1 = parseFloat(args[4]);
                    let pos1: Vector3 = { x: x1, y: y1, z: z1 };
                    let pos2: Vector3 | undefined = undefined;


                    if (isNaN(x1) || isNaN(y1) || isNaN(z1)) {
                        const errormsg = "§c無効な座標です pos1";
                        if (player instanceof Player) player.sendMessage(errormsg);
                        else console.warn(errormsg)
                        return;
                    }

                    if (args.length >= 7) {
                        const x2 = parseFloat(args[5]);
                        const y2 = parseFloat(args[6]);
                        const z2 = parseFloat(args[7]);
                        if (isNaN(x2) || isNaN(y2) || isNaN(z2)) {
                            const errormsg = "§c無効な座標です pos2";
                            if (player instanceof Player) player.sendMessage(errormsg);
                            else console.warn(errormsg)
                            return;
                        }
                        pos2 = { x: x2, y: y2, z: z2 };

                    }
                    duelManager.registerKitChest(kitName, pos1, pos2);
                    break;
                }

                case "form":
                case "show":
                case "automatch":
                case "r":
                case "a":
                case "leave":
                    if (!(player instanceof Player)) {
                        console.warn("このコマンドはプレイヤーのみが使用できます。");
                        return;
                    }

                    switch (subCommand) {
                        case "form":
                            duelManager.showDuelForm(player);
                            break;

                        case "leave":
                            duelManager.leaveDuel(player);
                            break;

                        case "show":
                            duelManager.show(player);
                            break;

                        case "automatch":
                            duelManager.autoMatch(player);
                            break;

                        case "r": { // request (r)
                            if (args.length < 2) {
                                player.sendMessage("§c使用法: duel r <プレイヤー名> [マップ名]");
                                return;
                            }
                            const targetName = args[1];
                            const mapName = args[2];

                            // ターゲットプレイヤーが存在するか確認
                            const targetPlayer = world.getAllPlayers().find(p => p.name === targetName);
                            if (!targetPlayer) {
                                player.sendMessage("§c対象のプレイヤーが見つかりません。");
                                return;
                            }

                            duelManager["sendDuelRequest"](player, targetName, mapName); // マップ名を渡す
                            break;
                        }

                        case "a": { // accept (a)
                            if (args.length !== 2) {
                                player.sendMessage("§c使用法: duel a <プレイヤー名>");
                                return;
                            }
                            const requesterName = args[1];

                            // 自分宛のリクエストがあるか確認.
                            const request = duelManager["duelRequests"].find(req => req.requester === requesterName && req.target === player.name);
                            if (!request) {
                                player.sendMessage(`§c${requesterName} からのデュエルリクエストは見つかりません。`);
                                return;
                            }

                            const requestIndex = duelManager["duelRequests"].findIndex(req => req.target === player.name && req.requester === requesterName);

                            if (requestIndex === -1) {
                                player.sendMessage("§cこのプレイヤーからのデュエルリクエストは見つかりません。");
                                return;
                            }

                            duelManager["duelRequests"].splice(requestIndex, 1);

                            const mapNameToUse = request.map ?? duelManager["findAvailableMap"]();

                            if (!mapNameToUse) {
                                player.sendMessage("§c利用可能なデュエルマップがありません。");
                                return;
                            }
                            duelManager.startDuel(requesterName, player.name, mapNameToUse);
                            break;
                        }
                    }
                    break;

                default:
                    if (player instanceof Player) {
                        player.sendMessage("§c無効なデュエルコマンドです。`/help duel`で使用法を確認してください。");
                    } else {
                        console.warn("§c無効なデュエルコマンドです。`/help duel`で使用法を確認してください。");
                    }
            }
        },
    });
}