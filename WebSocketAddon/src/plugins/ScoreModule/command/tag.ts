import { Player, system, world } from "@minecraft/server";
import { Handler } from "../../../module/Handler";
import { clientdevice, getMemoryTier, InputType } from "../utils/import";

interface ClickInfo {
    readonly timestamp: number;
};

const clicks = new Map<Player, ClickInfo[]>();


world.afterEvents.entityHitBlock.subscribe(({ damagingEntity }) => {
    if (!(damagingEntity instanceof Player) || !damagingEntity.hasTag("cps")) return;
    // trueCps プレイヤーが存在するかチェック
    const isCPSTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueCps"));
    if (!isCPSTrackingEnabled) return;

    const clickInfo = { timestamp: Date.now() };
    const playerClicks = clicks.get(damagingEntity) || [];
    playerClicks.push(clickInfo);
    clicks.set(damagingEntity, playerClicks);
});

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) => {
    if (!(damagingEntity instanceof Player) || !damagingEntity.hasTag("cps")) return;
    const isCPSTrackingEnabled = world.getPlayers().some(p => p.hasTag("trueCps"));
    if (!isCPSTrackingEnabled) return;

    const clickInfo = { timestamp: Date.now() };
    const playerClicks = clicks.get(damagingEntity) || [];
    playerClicks.push(clickInfo);
    clicks.set(damagingEntity, playerClicks);
});

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


        // CPS (HPまたはプレイヤー名から改行)
        if (player.hasTag("cps")) {
            const cps = getPlayerCPS(player);
            player.onScreenDisplay.setActionBar(`§aCPS: ${cps || 0}`);
            const newCPSTag = `\n§a[CPS: ${cps || 0}]`;
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


// tag コマンド
export function registerTagCommand(handler: Handler, moduleName: string) {
    handler.registerCommand('tag', {
        moduleName: moduleName,
        description: 'プレイヤーにタグを追加/削除します。',
        usage: 'tag <add|remove> <タグ名>',
        execute: (message, event) => {
            if (!(event.sourceEntity instanceof Player)) return;

            const player = event.sourceEntity;
            const args = message.split(/\s+/);

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
                    const deviceName = ["PC", "MB", "CS"][device] ?? "??";
                    const memoryTierName = ["?", "1.5", "2", "4", "8", "8+"][memoryTier] ?? "?";
                    const inputTypeName = ["KM", "GP", "MC", "TC"][inputType] ?? "??";

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
                sendMessage(`タグ '${tagName}' を追加しました。`);

            } else if (action === 'remove') {
                if (tagName.startsWith("w:device_")) {
                    for (const tag of player.getTags()) {
                        if (tag.startsWith("w:device_")) {
                            player.removeTag(tag);
                        }
                    }
                    sendMessage(`タグ '${tagName}'とその関連タグを削除しました`);
                } else {
                    player.removeTag(tagName);
                    sendMessage(`タグ '${tagName}' を削除しました。`);
                }
            } else {
                sendMessage('無効なアクションです。add または remove を指定してください。');
            }
        },
    });
}