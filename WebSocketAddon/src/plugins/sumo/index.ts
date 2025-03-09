import { EntityDieAfterEvent, EntityHitEntityAfterEvent, Player, system, Vector3, world } from "@minecraft/server";
import { Handler } from "../../module/Handler";
import { Module, moduleManager } from "../../module/module";

class SumoModule implements Module {
    name = "SumoSystem";
    enabledByDefault = true;

    private sumoTagPrefix = "sumo";
    private pvpSumoTag = "pvpSumo";
    private maxSumoMatches = 10;
    private sumoMatches: Map<string, { player1: Player, player2: Player }> = new Map();
    private announcementTag = "player_sumo";
    private allSumoPlayersTag = "sumo_all";


    private config = {
        module: {
            sumoSystem: {
                enabled: true,
            }
        }
    };

    constructor() {

    }

    onEnable(): void {
        this.registerEventListeners();
    }
    onInitialize(): void {
        this.registerEventListeners();

    }

    onDisable(): void {
        this.unregisterEventListeners();
    }


    private registerEventListeners(): void {
        system.runInterval(() => {
            if (this.config.module.sumoSystem.enabled === false) return;

            world.getPlayers({ tags: [this.pvpSumoTag] }).forEach(player => {
                if (!this.getSumoTag(player)) {
                    const healthComponent = player.getComponent("minecraft:health");
                    if (healthComponent) {
                        player.addEffect("weakness", 10, { amplifier: 255, showParticles: false });
                    }
                }
            });

            Array.from(this.sumoMatches.values()).forEach(({ player1, player2 }) => {
                if (player1.hasTag(this.pvpSumoTag)) player1.removeEffect("weakness");
                if (player2.hasTag(this.pvpSumoTag)) player2.removeEffect("weakness");
            });

            this.checkSumoDistance();
            this.checkDisconnectedPlayers(); // プレイヤーの接続状況をチェック
        }, 4);


        world.afterEvents.entityDie.subscribe(this.handleEntityDie);
        world.afterEvents.entityHitEntity.subscribe(this.handleEntityHitEntity);
        world.beforeEvents.playerLeave.subscribe(this.handlePlayerLeave); // プレイヤーが退出した時のイベント

    }

    private unregisterEventListeners(): void {
        world.afterEvents.entityDie.unsubscribe(this.handleEntityDie);
        world.afterEvents.entityHitEntity.unsubscribe(this.handleEntityHitEntity);
        world.beforeEvents.playerLeave.unsubscribe(this.handlePlayerLeave);
    }



    private handleEntityDie = (event: EntityDieAfterEvent) => {
        if (this.config.module.sumoSystem.enabled === false) return;

        const deadPlayer = event.deadEntity;
        if (!(deadPlayer instanceof Player)) return;



        const sumoTag = this.getSumoTag(deadPlayer);
        if (!sumoTag) return;

        const match = this.sumoMatches.get(sumoTag);
        if (!match) return;

        const winner = match.player1.id === deadPlayer.id ? match.player2 : match.player1;
        this.determineWinner(winner, sumoTag);
    };

    private handleEntityHitEntity = (event: EntityHitEntityAfterEvent) => {
        if (this.config.module.sumoSystem.enabled === false) return;

        const { damagingEntity, hitEntity } = event;
        if (!(damagingEntity instanceof Player && hitEntity instanceof Player)) return;

        const attackingPlayer = damagingEntity;
        const hitPlayer = hitEntity;

        const attackerTag = this.getSumoTag(attackingPlayer);
        const hitPlayerTag = this.getSumoTag(hitPlayer);


        if (!attackerTag && !hitPlayerTag && attackingPlayer.hasTag(this.pvpSumoTag) && hitPlayer.hasTag(this.pvpSumoTag)) {
            const sumoTag = this.generateUniqueSumoTag();
            if (!sumoTag) {
                attackingPlayer.sendMessage("§cSumoの最大数に達しました。");
                hitPlayer.sendMessage("§cSumoの最大数に達しました。");
                return;
            }

            attackingPlayer.addTag(sumoTag);
            hitPlayer.addTag(sumoTag);
            attackingPlayer.addTag(`${sumoTag}_p_1`); // プレイヤー1のタグ
            hitPlayer.addTag(`${sumoTag}_p_2`);      // プレイヤー2のタグ
            // 両プレイヤーに allSumoPlayersTag を追加
            attackingPlayer.addTag(this.allSumoPlayersTag);
            hitPlayer.addTag(this.allSumoPlayersTag);

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
    };

    private calculateDistance(pos1: Vector3, pos2: Vector3): number {
        return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2 + (pos1.z - pos2.z) ** 2);
    }

    private checkSumoDistance() {
        const sumoTagsToRemove: string[] = [];

        this.sumoMatches.forEach((match, sumoTag) => {
            const { player1, player2 } = match;
            const distance = this.calculateDistance(player1.location, player2.location);

            if (distance > 15) {
                player1.sendMessage("§c距離制限を超えたため、Sumoは終了しました。");
                player2.sendMessage("§c距離制限を超えたため、Sumoは終了しました。");
                sumoTagsToRemove.push(sumoTag);
            }
        });
        sumoTagsToRemove.forEach(sumoTag => this.removeSumoMatch(sumoTag, false));
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
        this.removeSumoMatch(sumoTag);

        if (winner) {
            system.run(() => {
                winner.addTag(`sumoWin`)
            })
        }

        world.getPlayers({ tags: [this.announcementTag] }).forEach(player => {
            player.sendMessage(`§b[Sumo]§a ${winner.name} §fが §c${loser.name} §fに勝利しました! (${sumoTag})`);
        });
    }


    private removeSumoMatch(sumoTag: string, _announceWinner: boolean = true) {
        const match = this.sumoMatches.get(sumoTag);
        if (!match) return;

        match.player1.removeTag(sumoTag);
        match.player2.removeTag(sumoTag);

        // プレイヤー固有のタグを削除
        match.player1.removeTag(`${sumoTag}_p_1`);
        match.player2.removeTag(`${sumoTag}_p_2`);
        // 両プレイヤーから allSumoPlayersTag を削除 (試合が終了したら)
        match.player1.removeTag(this.allSumoPlayersTag);
        match.player2.removeTag(this.allSumoPlayersTag);


        this.sumoMatches.delete(sumoTag);

    }

    private handlePlayerLeave = (event: { player: Player }) => {
        const player = event.player;
        const sumoTag = this.getSumoTag(player);

        if (sumoTag) {
            const match = this.sumoMatches.get(sumoTag);
            if (match) {
                // 退出したプレイヤーがいる試合を即座に終了させる（勝敗はつけない）
                this.removeSumoMatch(sumoTag, false); // 勝者アナウンスなし
                const otherPlayer = match.player1.id === player.id ? match.player2 : match.player1;
                // 残ったプレイヤーにメッセージを表示（相手が退出したこと）
                if (this.isPlayerOnline(otherPlayer)) {  // 残りのプレイヤーがオンラインか確認
                    otherPlayer.sendMessage(`§c対戦相手の ${player.name} が退出したため、Sumoは終了しました。`);
                }
            }
        }
    };

    private checkDisconnectedPlayers() {
        const sumoTagsToRemove: string[] = [];

        this.sumoMatches.forEach((match, sumoTag) => {
            const player1Online = this.isPlayerOnline(match.player1);
            const player2Online = this.isPlayerOnline(match.player2);

            if (!player1Online || !player2Online) {
                sumoTagsToRemove.push(sumoTag);
            }
        });

        sumoTagsToRemove.forEach(sumoTag => {
            const match = this.sumoMatches.get(sumoTag);
            if (!match) return;

            const player1Online = this.isPlayerOnline(match.player1);
            const player2Online = this.isPlayerOnline(match.player2);

            // 両プレイヤーがオフラインの場合、試合を削除
            if (!player1Online && !player2Online) {
                this.removeSumoMatch(sumoTag, false);
                return;
            }

            // 片方のプレイヤーだけがオンラインの場合、試合を強制終了。
            if (!player1Online || !player2Online) {
                this.removeSumoMatch(sumoTag, false); // 勝敗のアナウンスはしない
                if (player1Online) {
                    match.player1.sendMessage("§c対戦相手が切断したため、Sumoは終了しました。");
                }
                if (player2Online) {
                    match.player2.sendMessage("§c対戦相手が切断したため、Sumoは終了しました。");
                }

            }
        });
    }

    private isPlayerOnline(player: Player): boolean {
        return world.getPlayers().some(p => p.name === player.name); // または p.id === player.id
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
                                // allSumoPlayersTag も削除
                                if (tag === this.allSumoPlayersTag) {
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