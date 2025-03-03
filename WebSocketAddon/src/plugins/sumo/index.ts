import { EntityHitEntityAfterEvent, Player, system, Vector3, world } from "@minecraft/server";
import { Handler } from "../../module/Handler";
import { Module, moduleManager } from "../../module/module";

// 相撲システム
class SumoModule implements Module {
    name = "SumoSystem";
    enabledByDefault = true;



    // 相撲タグのプレフィックスと相撲システム起動用のタグ
    private sumoTagPrefix = "sumo";
    private pvpSumoTag = "pvpSumo";  
    private trueSumoTag = "trueSumo"; 
    private maxSumoMatches = 10;

    private sumoSystemEnabled = false;
    private sumoTagsInUse: string[] = [];





    constructor() {

        system.runInterval(() => {
            this.checkSystemStatus();
            if (!this.sumoSystemEnabled) return; 

            const playersWithPvpSumoTag = world.getPlayers({ tags: [this.pvpSumoTag] });
            playersWithPvpSumoTag.forEach(player => {
                if (!this.getSumoTag(player)) {
                    const healthComponent = player.getComponent("minecraft:health");
                    if (healthComponent) {
                        player.addEffect("weakness", 1, { 
                            amplifier: 255,
                            showParticles: false 
                        });
                    }
                }
            });

            if (this.sumoTagsInUse.length === 0) return;

            for (const sumoTag of this.sumoTagsInUse) {
                const playersWithTag = world.getPlayers({ tags: [sumoTag] });
                if (playersWithTag.length === 1) {
                    this.determineWinner(playersWithTag[0]); 
                }
            }

            this.checkSumoDistance();

        }, 4);
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
        world.afterEvents.entityHitEntity.subscribe(this.hitEntity);
    }


    private unregisterEventListeners(): void {
        world.afterEvents.entityHitEntity.unsubscribe(this.hitEntity);
    }



    private hitEntity(event:EntityHitEntityAfterEvent) {
        if (!this.sumoSystemEnabled) return; 

        const { damagingEntity, hitEntity } = event;

        if (
            damagingEntity &&
            damagingEntity.typeId === "minecraft:player" &&
            hitEntity &&
            hitEntity.typeId === "minecraft:player"
        ) {
            const attackingPlayer = damagingEntity as Player;
            const hitPlayer = hitEntity as Player;

            const attackerTag = this.getSumoTag(attackingPlayer);
            const hitPlayerTag = this.getSumoTag(hitPlayer);  

            if (!attackerTag && !hitPlayerTag && attackingPlayer.hasTag(this.pvpSumoTag)) {
                const sumoTag = this.generateUniqueSumoTag();
                if (!sumoTag) {
                    attackingPlayer.sendMessage("§c相撲の最大数に達しました。");
                    hitPlayer.sendMessage("§c相撲の最大数に達しました。");
                    return;
                }
                attackingPlayer.addTag(sumoTag);
                hitPlayer.addTag(sumoTag);
                this.sumoTagsInUse.push(sumoTag);

                attackingPlayer.sendMessage(`§a${hitPlayer.name} §fとの相撲を開始しました。`);
                hitPlayer.sendMessage(`§a${attackingPlayer.name} §fがあなたとの相撲を開始しました。`);
                attackingPlayer.sendMessage(`§b相撲開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                hitPlayer.sendMessage(`§b相撲開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                return;
            }

            if (!attackerTag && hitPlayerTag) {
                const healthComponent = damagingEntity.getComponent("minecraft:health");
                if (healthComponent) {
                    damagingEntity.addEffect("weakness", 1, {
                        amplifier: 255,
                        showParticles: false,
                    });
                }
                attackingPlayer.sendMessage("§c相撲中のプレイヤーを攻撃できません。");
                return;
            }
        }
    }

    private calculateDistance(pos1: Vector3, pos2: Vector3): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private checkSumoDistance() {
        if (this.sumoTagsInUse.length === 0) return; 
        const sumoPlayers = world.getPlayers().filter(player => this.getSumoTag(player) !== null);

        sumoPlayers.forEach((player) => {
            const sumoTag = this.getSumoTag(player)!;
            const opponent = sumoPlayers.find(p => p.hasTag(sumoTag) && p.id !== player.id);
            if (opponent) {
                const distance = this.calculateDistance(player.location, opponent.location);
                if (distance > 15) {
                    player.sendMessage("§c距離制限を超えたため、相撲は終了しました。");
                    opponent.sendMessage("§c距離制限を超えたため、相撲は終了しました。");
                    this.removeSumoTags(player, opponent, sumoTag);
                }
            }
        });
    }

    // プレイヤーの相撲タグを取得する関数 (最適化)
    private getSumoTag(player: Player): string | null {
        const sumoTagRegex = /^sumo[1-9]$|^sumo10$/; 
        return player.getTags().find(tag => sumoTagRegex.test(tag)) ?? null; 
    }

    private removeSumoTags(player1: Player, player2: Player, sumoTag: string) {
        player1.removeTag(sumoTag);
        player2.removeTag(sumoTag);
        const index = this.sumoTagsInUse.indexOf(sumoTag);
        if (index > -1) {
            this.sumoTagsInUse.splice(index, 1);
        }
        this.checkSystemStatus();
    }


    private generateUniqueSumoTag(): string | null {
        for (let i = 1; i <= this.maxSumoMatches; i++) {
            const tag = `${this.sumoTagPrefix}${i}`;
            if (!this.sumoTagsInUse.includes(tag)) {
                return tag; 
            }
        }
        return null;
    }

    // 勝敗判定と結果の処理
    private determineWinner(player: Player) {
        const sumoTag = this.getSumoTag(player);
        if (sumoTag) {
            world.getPlayers().forEach(p => {
                if (p.hasTag(sumoTag)) {
                    p.removeTag(sumoTag);
                }
            });

            const index = this.sumoTagsInUse.indexOf(sumoTag);
            if (index > -1) {
                this.sumoTagsInUse.splice(index, 1);
            }
            player.addTag("w:sumo_win");
            player.sendMessage("§l§f>> §bSumo §aWin §f<<");
            this.checkSystemStatus(); 
        }
    }

    private checkSystemStatus() {
        this.sumoSystemEnabled = world.getPlayers().some(player => player.hasTag(this.trueSumoTag));
    }



    registerCommands(handler: Handler): void {
        handler.registerCommand("sumo", {
            moduleName: this.name,
            description: "相撲システムを制御します。",
            usage: "/sumo [enable|disable|pvp|true]",
            execute: (message, event) => {
                if (!(event.sourceEntity instanceof Player)) return;
                const player = event.sourceEntity;

                const args = message.split(/\s+/);
                if (args.length < 2) {
                    player.sendMessage("§e使用方法: §f/sumo [enable|disable|pvp|true]");
                    return;
                }

                switch (args[1].toLowerCase()) { 
                    case "enable": 
                        this.sumoSystemEnabled = true;
                        player.sendMessage("§a相撲システムを有効にしました。");
                        break;
                    case "disable": 
                        this.sumoSystemEnabled = false;
                        this.sumoTagsInUse = []; 
                        world.getPlayers().forEach(p => {
                            p.getTags().forEach(tag => {
                                if (tag.startsWith("sumo")) {
                                    p.removeTag(tag);
                                }
                            });
                        });
                        player.sendMessage("§c相撲システムを無効にしました。");
                        break;
                    case "pvp":
                        if (player.hasTag(this.pvpSumoTag)) {
                            player.removeTag(this.pvpSumoTag);
                            player.sendMessage("§cPvP 相撲モードを無効にしました。");
                        } else {
                            player.addTag(this.pvpSumoTag);
                            player.sendMessage("§aPvP 相撲モードを有効にしました。");
                        }
                        break;
                    case "true": 
                        if (player.hasTag(this.trueSumoTag)) {
                            player.removeTag(this.trueSumoTag);
                            player.sendMessage("§c強制 PvP 相撲モードを無効にしました。");
                            this.checkSystemStatus(); 
                        } else {
                            player.addTag(this.trueSumoTag);
                            player.sendMessage("§a強制 PvP 相撲モードを有効にしました。");
                            this.checkSystemStatus(); 
                        }
                        break;
                    default:
                        player.sendMessage("§e使用方法: §f/sumo [enable|disable|pvp|true]"); // 不明な引数
                }
            }
        });
    }
}

// モジュールを登録
const sumoModule = new SumoModule();
moduleManager.registerModule(sumoModule);