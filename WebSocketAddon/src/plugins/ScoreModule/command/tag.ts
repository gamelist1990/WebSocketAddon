import { Player, system, world } from "@minecraft/server";
import { Handler } from "../../../module/Handler";
import { clientdevice, getMemoryTier, InputType } from "../utils/import";

interface ClickInfo {
    readonly timestamp: number;
};

const clicks = new Map<Player, ClickInfo[]>();
const wClickClicks = new Map<Player, ClickInfo[]>(); // w:click 用のクリック情報を格納


world.afterEvents.entityHitBlock.subscribe(({ damagingEntity }) => {
    if (!(damagingEntity instanceof Player)) return;
    const isCPSTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueCps"));
    if (!isCPSTrackingEnabled) return;
    //w:clickタグを持っているか確認
    if (damagingEntity.hasTag("w:click")) return; // w:click による検知とは分離

    const clickInfo = { timestamp: Date.now() };
    const playerClicks = clicks.get(damagingEntity) || [];
    playerClicks.push(clickInfo);
    clicks.set(damagingEntity, playerClicks);
});

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) => {
    if (!(damagingEntity instanceof Player)) return;
    const isCPSTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueCps"));
    if (!isCPSTrackingEnabled) return;
    if (damagingEntity.hasTag("w:click")) return; // w:click による検知とは分離


    const clickInfo = { timestamp: Date.now() };
    const playerClicks = clicks.get(damagingEntity) || [];
    playerClicks.push(clickInfo);
    clicks.set(damagingEntity, playerClicks);
});

// w:click 用のイベントリスナー
// animation controller
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (player.hasTag("w:click")) {
            const clickInfo = { timestamp: Date.now() };
            const playerClicks = wClickClicks.get(player) || [];
            playerClicks.push(clickInfo);
            wClickClicks.set(player, playerClicks);
            player.removeTag("w:click");
        }
    }
}, 1);



const hpRegex = / \d+ §c❤§r| \d+ /;
const cpsRegex = /\n§a\[CPS: \d+\]/; // Include the newline in the regex


system.runInterval(() => {
    const isCPSTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueCps"));
    const isHPTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueHP"));
    const isTeamTrackingEnable = world.getPlayers().some(p => p.hasTag("trueTeam"));
    if (!isCPSTrackingEnabled && !isTeamTrackingEnable && !isHPTrackingEnabled) return;


    for (const player of world.getPlayers()) {
        let nameTag = player.nameTag;
        let baseName = player.name;

        // HP
        if (player.hasTag("hp")) {
            const health = player.getComponent('minecraft:health') as any; // EntityHealthComponent が存在しない場合があるため any 型に
            const playerHealth = health ? Math.floor(health.currentValue) : '';
            const newHPTag = ` ${playerHealth} §c❤§r`;

            baseName = baseName.replace(hpRegex, "").replace(player.name, player.name + newHPTag);
            nameTag = nameTag.replace(hpRegex, "");
        } else {
            baseName = baseName.replace(hpRegex, "");
            nameTag = nameTag.replace(hpRegex, "");
        }

        nameTag = nameTag.replace(player.name, baseName);


        // CPS
        if (player.hasTag("cps")) {
            const normalCPS = getPlayerCPS(player);
           // const wClickCPS = getPlayerCPSWClick(player);
            const totalCPS = normalCPS;


            player.onScreenDisplay.setActionBar(`§aCPS: ${totalCPS || 0}`);
            const newCPSTag = `\n§a[CPS: ${totalCPS || 0}]`;
            nameTag = nameTag.replace(cpsRegex, "") + newCPSTag;
        } else {
            nameTag = nameTag.replace(cpsRegex, "");
        }

        // Team
        if (isTeamTrackingEnable) {
            let teamColor = "§f";

            if (player.hasTag("team1")) {
                teamColor = "§c";
            } else if (player.hasTag("team2")) {
                teamColor = "§b";
            } else if (player.hasTag("team3")) {
                teamColor = "§e";
            } else if (player.hasTag("team4")) {
                teamColor = "§a";
            } else if (player.hasTag("team5")) {
                teamColor = "§d";
            } else if (player.hasTag("none")) {
                teamColor = "§r";
            }

            if (teamColor == "§r") {
                nameTag = player.name;
                system.run(()=>{
                    player.removeTag("none")
                })
            }

            if (teamColor !== "§f") {
                const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escapedName = escapeRegExp(player.name);
                const teamRegex = new RegExp(`§[0-9a-f]${escapedName}|${escapedName}`);
                nameTag = nameTag.replace(teamRegex, teamColor + player.name);
            }
        }


        player.nameTag = nameTag;
    }
}, 1);

export function getPlayerCPS(player: Player): number {
    const currentTime = Date.now();
    const playerClicks = clicks.get(player) || [];
    const recentClicks = playerClicks.filter(({ timestamp }) => currentTime - 1000 < timestamp);
    clicks.set(player, recentClicks);
    return recentClicks.length;
}

// w:click 用の CPS 計算関数
export function getPlayerCPSWClick(player: Player): number {
    const currentTime = Date.now();
    const playerClicks = wClickClicks.get(player) || [];
    const recentClicks = playerClicks.filter(({ timestamp }) => currentTime - 1000 < timestamp);
    wClickClicks.set(player, recentClicks);  // 1秒以上前のクリック情報を削除
    return recentClicks.length;
}


// tag コマンド
export function registerTagCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('tag', {
        moduleName: moduleName,
        description: 'プレイヤーにタグを追加/削除します。',
        usage: 'tag <add|remove> <タグ名>',
        execute: (_message, event, args) => {
            if (!(event.sourceEntity instanceof Player)) return;

            const player = event.sourceEntity;

            if (args.length < 2) {
                player.sendMessage('引数が不足しています。使用方法: tag <add|remove> <タグ名>');
                return;
            }

            const action = args[0];
            const tagName = args[1];
            const sendMessage = (message: string) => { system.run(() => player.sendMessage(message)); };

            if (action === 'add') {
                if (tagName === "w:device") {
                    const device = clientdevice(player);
                    const memoryTier = getMemoryTier(player);
                    const inputType = InputType(player);
                    const deviceName = ["PC", "Mobile", "Console"][device] ?? "??";
                    const memoryTierName = ["?", "1", "2", "4", "8", "8+"][memoryTier] ?? "?";
                    const inputTypeName = ["keyboard", "GamePad", "motionPad", "Touch"][inputType] ?? "??";

                    for (const tag of player.getTags()) {
                        if (tag.startsWith("w:device_")) {
                            player.removeTag(tag);
                        }
                    }

                    player.addTag("w:device_" + deviceName);
                    player.addTag("w:device_" + memoryTierName);
                    player.addTag("w:device_" + inputTypeName);
                    return;
                }

                // 通常のタグ
                player.addTag(tagName);
            } else if (action === 'remove') {
                if (tagName.startsWith("w:device_")) {
                    for (const tag of player.getTags()) {
                        if (tag.startsWith("w:device_")) {
                            player.removeTag(tag);
                        }
                    }
                } else {
                    player.removeTag(tagName);
                }
            } else {
                sendMessage('無効なアクションです。add または remove を指定してください。');
            }
        },
    });
}