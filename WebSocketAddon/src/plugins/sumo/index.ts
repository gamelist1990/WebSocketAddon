import { Player, system, Vector3, world } from "@minecraft/server";
import { Handler } from "../../module/Handler";
import { Module, moduleManager } from "../../module/module";

class SumoModule implements Module {
    name = "SumoSystem";
    enabledByDefault = true;

    private sumoTagPrefix = "sumo";
    private pvpSumoTag = "pvpSumo";
    private maxSumoMatches = 10;
    private sumoMatches: Map<string, { player1: Player, player2: Player }> = new Map(); // Sumoの対戦情報を格納する Map
    private announcementTag = "player_sumo";

    private config = {
        module: {
            sumoSystem: {
                enabled: true,
            }
        }
    };

    constructor() {
        system.runInterval(() => {
            if (this.config.module.sumoSystem.enabled === false) return;

            // pvpSumoタグを持つプレイヤーを処理 (Weakness 付与)
            world.getPlayers({ tags: [this.pvpSumoTag] }).forEach(player => {
                if (!this.getSumoTag(player)) {
                    const healthComponent = player.getComponent("minecraft:health");
                    if (healthComponent) {
                        player.addEffect("weakness", 10, { amplifier: 255, showParticles: false });
                    }
                }
            });

            // Sumo中のプレイヤーの Weakness を解除
            Array.from(this.sumoMatches.values()).forEach(({ player1, player2 }) => {
                if (player1.hasTag(this.pvpSumoTag)) player1.removeEffect("weakness");
                if (player2.hasTag(this.pvpSumoTag)) player2.removeEffect("weakness");
            });

            // 距離制限のチェックとSumoの終了判定
            this.checkSumoDistance();
        }, 4);

        // entityDie イベントリスナー（勝利判定のみ）
        world.afterEvents.entityDie.subscribe(event => {
            if (this.config.module.sumoSystem.enabled === false) return;

            const deadPlayer = event.deadEntity;
            if (!(deadPlayer instanceof Player)) return;

            const sumoTag = this.getSumoTag(deadPlayer);
            if (!sumoTag) return;

            const match = this.sumoMatches.get(sumoTag);
            if (!match) return;

            const winner = match.player1.id === deadPlayer.id ? match.player2 : match.player1;
            this.determineWinner(winner, sumoTag);
        });


        // entityHitEntity イベントリスナー（Sumoの開始判定）
        world.afterEvents.entityHitEntity.subscribe((event) => {
            if (this.config.module.sumoSystem.enabled === false) return;

            const { damagingEntity, hitEntity } = event;
            if (!(damagingEntity instanceof Player && hitEntity instanceof Player)) return;

            const attackingPlayer = damagingEntity;
            const hitPlayer = hitEntity;

            const attackerTag = this.getSumoTag(attackingPlayer);
            const hitPlayerTag = this.getSumoTag(hitPlayer);

            // 両プレイヤーが pvpSumo タグを持ち、Sumo中でない場合、新しいSumoを開始
            if (!attackerTag && !hitPlayerTag && attackingPlayer.hasTag(this.pvpSumoTag) && hitPlayer.hasTag(this.pvpSumoTag)) {
                const sumoTag = this.generateUniqueSumoTag();
                if (!sumoTag) {
                    attackingPlayer.sendMessage("§cSumoの最大数に達しました。");
                    hitPlayer.sendMessage("§cSumoの最大数に達しました。");
                    return;
                }

                attackingPlayer.addTag(sumoTag);
                hitPlayer.addTag(sumoTag);
                this.sumoMatches.set(sumoTag, { player1: attackingPlayer, player2: hitPlayer });

                attackingPlayer.sendMessage(`§a${hitPlayer.name} §fとのSumoを開始しました。`);
                hitPlayer.sendMessage(`§a${attackingPlayer.name} §fがあなたとのSumoを開始しました。`);
                attackingPlayer.sendMessage(`§bSumo開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                hitPlayer.sendMessage(`§bSumo開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                return;
            }

            if (!attackerTag && hitPlayerTag) {
                const healthComponent = attackingPlayer.getComponent("minecraft:health");
                if (healthComponent) {
                    attackingPlayer.addEffect("weakness", 60, { amplifier: 255, showParticles: false });
                }
                attackingPlayer.sendMessage("§cSumo中のプレイヤーを攻撃できません。");
            }
        });
    }

    private calculateDistance(pos1: Vector3, pos2: Vector3): number {
        return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2 + (pos1.z - pos2.z) ** 2);
    }

    // 距離制限のチェックとSumoの終了判定
    private checkSumoDistance() {
        const sumoTagsToRemove: string[] = [];

        this.sumoMatches.forEach((match, sumoTag) => {
            const { player1, player2 } = match;
            const distance = this.calculateDistance(player1.location, player2.location);

            if (distance > 15) {
                player1.sendMessage("§c距離制限を超えたため、Sumoは終了しました。");
                player2.sendMessage("§c距離制限を超えたため、Sumoは終了しました。");
                sumoTagsToRemove.push(sumoTag); // 終了するSumoタグをリストに追加
            }
        });

        // 距離制限を超えたSumoをまとめて終了（タグ削除、Map から削除）
        sumoTagsToRemove.forEach(sumoTag => this.removeSumoMatch(sumoTag, false)); // 勝利判定はしない
    }


    private getSumoTag(player: Player): string | null {
        const sumoTagRegex = new RegExp(`^${this.sumoTagPrefix}[1-9]$|^${this.sumoTagPrefix}10$`);
        return player.getTags().find(tag => sumoTagRegex.test(tag)) ?? null;
    }

    private generateUniqueSumoTag(): string | null {
        for (let i = 1; i <= this.maxSumoMatches; i++) {
            const tag = `${this.sumoTagPrefix}${i}`;
            if (!this.sumoMatches.has(tag)) {
                return tag;
            }
        }
        return null;
    }

    private determineWinner(winner: Player, sumoTag: string) {
        const match = this.sumoMatches.get(sumoTag);
        if (!match) return;

        const loser = match.player1.id === winner.id ? match.player2 : match.player1;
        this.removeSumoMatch(sumoTag); // 勝利メッセージあり

        world.getPlayers({ tags: [this.announcementTag] }).forEach(player => {
            player.sendMessage(`§b[Sumo]§a ${winner.name} §fが §c${loser.name} §fに勝利しました! (${sumoTag})`);
        });
    }


    //removeSumoMatch(sumoTag: string, announceWinner: boolean = true) {
    private removeSumoMatch(sumoTag: string, _announceWinner: boolean = true) {
        const match = this.sumoMatches.get(sumoTag);
        if (!match) return;

        match.player1.removeTag(sumoTag);
        match.player2.removeTag(sumoTag);
        this.sumoMatches.delete(sumoTag);

    }

    registerCommands(handler: Handler): void {
        handler.registerCommand("sumo", {
            moduleName: this.name,
            description: "Sumoシステムを制御します。",
            usage: "/sumo [enable|disable|pvp|announce]",
            execute: (message, event) => {
                if (!(event.sourceEntity instanceof Player)) return;
                const player = event.sourceEntity;

                const args = message.split(/\s+/);
                if (args.length < 2) {
                    player.sendMessage("§e使用方法: §f/sumo [enable|disable|pvp|announce]");
                    return;
                }

                switch (args[1].toLowerCase()) {
                    case "enable":
                        this.config.module.sumoSystem.enabled = true;
                        player.sendMessage("§aSumoシステムを有効にしました。");
                        break;
                    case "disable":
                        this.config.module.sumoSystem.enabled = false;
                        this.sumoMatches.clear();
                        world.getPlayers().forEach(p => {
                            p.getTags().forEach(tag => {
                                if (tag.startsWith("sumo")) {
                                    p.removeTag(tag);
                                }
                            });
                        });
                        player.sendMessage("§cSumoシステムを無効にしました。");
                        break;
                    case "pvp":
                        if (player.hasTag(this.pvpSumoTag)) {
                            player.removeTag(this.pvpSumoTag);
                            player.sendMessage("§cPvP Sumoモードを無効にしました。");
                        } else {
                            player.addTag(this.pvpSumoTag);
                            player.sendMessage("§aPvP Sumoモードを有効にしました。");
                        }
                        break;
                    case "announce":
                        if (player.hasTag(this.announcementTag)) {
                            player.removeTag(this.announcementTag);
                            player.sendMessage("§cSumoの勝利メッセージは表示されなくなります。");
                        } else {
                            player.addTag(this.announcementTag);
                            player.sendMessage("§aSumoの勝利メッセージが表示されるようになります。");
                        }
                        break;

                    default:
                        player.sendMessage("§e使用方法: §f/sumo [enable|disable|pvp|announce]");
                }
            }
        });
    }
}

const sumoModule = new SumoModule();
moduleManager.registerModule(sumoModule);