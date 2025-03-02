import { Player, system, Vector3, world } from "@minecraft/server";
import { Handler } from "../../module/Handler";
import { Module, moduleManager } from "../../module/module";

// 相撲システム
class SumoModule implements Module {
    name = "SumoSystem";
    enabledByDefault = true;

    // 相撲タグのプレフィックスと相撲システム起動用のタグ
    private sumoTagPrefix = "no"; // "sumo" + 数字 で個別の相撲を識別
    private pvpSumoTag = "pvpSumo";  // PvP 相撲モードを有効にするタグ (プレイヤーが任意でオンオフ)
    private trueSumoTag = "trueSumo"; // 強制 PvP 相撲モードを有効にするタグ (管理者用)
    private maxSumoMatches = 10;     // 同時に進行できる相撲の最大数

    private sumoSystemEnabled = false; // 相撲システム全体の有効/無効状態
    private sumoTagsInUse: string[] = []; // 使用中の相撲タグを追跡

    // config の代わりとなる内部変数 (本来は外部ファイルから読み込む)
    private config = {
        module: {
            sumoSystem: {
                enabled: true, // 初期状態では相撲システムを有効にする
            }
        }
    };

    constructor() {
        // 一定間隔で相撲の状態をチェック (0.2秒ごと)
        system.runInterval(() => {
            // 相撲システムが無効なら何もしない
            if (this.config.module.sumoSystem.enabled === false) return;

            this.checkSystemStatus(); // 強制相撲モードの状態を確認
            if (!this.sumoSystemEnabled) return; // システムが無効なら何もしない

            // pvpSumo タグを持つプレイヤーに弱体化を付与 (相撲中以外)
            const playersWithPvpSumoTag = world.getPlayers({ tags: [this.pvpSumoTag] });
            playersWithPvpSumoTag.forEach(player => {
                // 相撲中ではないプレイヤーに弱体化を付与
                if (!this.getSumoTag(player)) {
                    const healthComponent = player.getComponent("minecraft:health");
                    if (healthComponent) {
                        player.addEffect("weakness", 20, {  // 1秒間
                            amplifier: 255, // 最大レベル (効果を最大にする)
                            showParticles: false // パーティクル非表示
                        });
                    }
                }
            });

            // 使用中の相撲タグがなければ何もしない
            if (this.sumoTagsInUse.length === 0) return;

            // 進行中の各相撲について、プレイヤーが1人になったら勝者を決定
            for (const sumoTag of this.sumoTagsInUse) {
                const playersWithTag = world.getPlayers({ tags: [sumoTag] });
                if (playersWithTag.length === 1) {
                    this.determineWinner(playersWithTag[0]); // 勝者処理
                }
            }

            // 相撲中のプレイヤー間の距離をチェック
            this.checkSumoDistance();

        }, 4);

        // エンティティがエンティティを攻撃したときのイベント
        world.afterEvents.entityHitEntity.subscribe((event) => {
            // 相撲システムが無効なら何もしない
            if (this.config.module.sumoSystem.enabled === false) return;
            if (!this.sumoSystemEnabled) return; // システムが無効なら何もしない

            const { damagingEntity, hitEntity } = event;

            // 攻撃者と被攻撃者が両方プレイヤーであるか確認
            if (
                damagingEntity &&
                damagingEntity.typeId === "minecraft:player" &&
                hitEntity &&
                hitEntity.typeId === "minecraft:player"
            ) {
                const attackingPlayer = damagingEntity as Player;
                const hitPlayer = hitEntity as Player;

                const attackerTag = this.getSumoTag(attackingPlayer); // 攻撃者の相撲タグ
                const hitPlayerTag = this.getSumoTag(hitPlayer);      // 被攻撃者の相撲タグ

                // 攻撃側が相撲中でなく、被攻撃側も相撲中でなく、攻撃側が pvpSumo タグを持っている場合、相撲開始
                if (!attackerTag && !hitPlayerTag && attackingPlayer.hasTag(this.pvpSumoTag)) {
                    const sumoTag = this.generateUniqueSumoTag(); // 新しい相撲タグを生成
                    if (!sumoTag) {
                        // 相撲の数が上限に達している場合
                        attackingPlayer.sendMessage("§c相撲の最大数に達しました。");
                        hitPlayer.sendMessage("§c相撲の最大数に達しました。");
                        return;
                    }

                    // 相撲タグを両プレイヤーに付与し、使用中タグリストに追加
                    attackingPlayer.addTag(sumoTag);
                    hitPlayer.addTag(sumoTag);
                    this.sumoTagsInUse.push(sumoTag);

                    // 相撲開始メッセージ
                    attackingPlayer.sendMessage(`§a${hitPlayer.name} §fとの相撲を開始しました。`);
                    hitPlayer.sendMessage(`§a${attackingPlayer.name} §fがあなたとの相撲を開始しました。`);
                    attackingPlayer.sendMessage(`§b相撲開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                    hitPlayer.sendMessage(`§b相撲開始§f: §a${attackingPlayer.name} §fvs §a${hitPlayer.name} §f(§6${sumoTag}§f)`);
                    return;
                }

                // 相撲中でないプレイヤーが、相撲中のプレイヤーを攻撃した場合
                if (!attackerTag && hitPlayerTag) {
                    const healthComponent = damagingEntity.getComponent("minecraft:health");
                    if (healthComponent) {
                        damagingEntity.addEffect("weakness", 20 * 3, {
                            amplifier: 255,
                            showParticles: false,
                        });
                    }
                    attackingPlayer.sendMessage("§c相撲中のプレイヤーを攻撃できません。");
                    return;
                }
            }
        });
    }

    // 2点間の距離を計算する関数
    private calculateDistance(pos1: Vector3, pos2: Vector3): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz); // ユークリッド距離
    }

    // 相撲プレイヤーの距離を監視する関数 (最適化)
    private checkSumoDistance() {
        if (this.sumoTagsInUse.length === 0) return; // 進行中の相撲がない場合は何もしない

        // 相撲中のプレイヤーを取得 (相撲タグを持っているプレイヤー)
        const sumoPlayers = world.getPlayers().filter(player => this.getSumoTag(player) !== null);

        sumoPlayers.forEach((player) => {
            const sumoTag = this.getSumoTag(player)!; // プレイヤーの相撲タグを取得 (null でないことを保証)
            // 同じ相撲タグを持つ対戦相手を探す
            const opponent = sumoPlayers.find(p => p.hasTag(sumoTag) && p.id !== player.id);
            if (opponent) {
                // 距離を計算
                const distance = this.calculateDistance(player.location, opponent.location);
                // 距離が15ブロックを超えたら相撲を終了
                if (distance > 15) {
                    player.sendMessage("§c距離制限を超えたため、相撲は終了しました。");
                    opponent.sendMessage("§c距離制限を超えたため、相撲は終了しました。");
                    this.removeSumoTags(player, opponent, sumoTag); // 相撲タグを削除
                }
            }
        });
    }

    // プレイヤーの相撲タグを取得する関数 (最適化)
    private getSumoTag(player: Player): string | null {
        const sumoTagRegex = /^sumo[1-9]$|^sumo10$/; // 正規表現で相撲タグを判定 (sumo1 から sumo10)
        return player.getTags().find(tag => sumoTagRegex.test(tag)) ?? null; // 一致するタグがあれば返す、なければ null
    }

    // 相撲タグを削除する関数
    private removeSumoTags(player1: Player, player2: Player, sumoTag: string) {
        player1.removeTag(sumoTag);
        player2.removeTag(sumoTag);
        // 使用中の相撲タグリストから削除
        const index = this.sumoTagsInUse.indexOf(sumoTag);
        if (index > -1) {
            this.sumoTagsInUse.splice(index, 1);
        }
        this.checkSystemStatus(); // 強制相撲モードの状態を更新
    }


    // 一意の相撲タグを生成する関数
    private generateUniqueSumoTag(): string | null {
        // sumo1 から sumo10 まで利用可能なタグを探す
        for (let i = 1; i <= this.maxSumoMatches; i++) {
            const tag = `${this.sumoTagPrefix}${i}`;
            if (!this.sumoTagsInUse.includes(tag)) {
                return tag; // 空いているタグが見つかったら返す
            }
        }
        return null; // 利用可能なタグがない場合は null を返す
    }

    // 勝敗判定と結果の処理
    private determineWinner(player: Player) {
        const sumoTag = this.getSumoTag(player); // プレイヤーの相撲タグを取得
        if (sumoTag) {
            // 同じ相撲タグを持つプレイヤーからタグを削除 (通常は1人しか残っていないはず)
            world.getPlayers().forEach(p => {
                if (p.hasTag(sumoTag)) {
                    p.removeTag(sumoTag);
                }
            });

            // 使用中の相撲タグリストから削除
            const index = this.sumoTagsInUse.indexOf(sumoTag);
            if (index > -1) {
                this.sumoTagsInUse.splice(index, 1);
            }
            // 勝者に sumoWin タグを付与
            player.addTag("sumoWin");
            player.sendMessage("§a相撲に勝ちました！");
            this.checkSystemStatus(); // 強制相撲モードの状態を更新
        }
    }

    // システムの有効/無効状態をチェックする関数 (trueSumo タグの有無で判断)
    private checkSystemStatus() {
        this.sumoSystemEnabled = world.getPlayers().some(player => player.hasTag(this.trueSumoTag));
    }



    // コマンドを登録する関数
    registerCommands(handler: Handler): void {
        // /sumo コマンド
        handler.registerCommand("sumo", {
            moduleName: this.name,
            description: "相撲システムを制御します。",
            usage: "/sumo [enable|disable|pvp|true]", // 使用方法
            execute: (message, event) => {
                if (!(event.sourceEntity instanceof Player)) return; // プレイヤー以外からの実行は無視
                const player = event.sourceEntity;

                const args = message.split(/\s+/); // コマンド引数を分割
                if (args.length < 2) {
                    player.sendMessage("§e使用方法: §f/sumo [enable|disable|pvp|true]"); // 引数が足りない場合
                    return;
                }

                switch (args[1].toLowerCase()) { // 引数に応じて処理を分岐
                    case "enable": // 相撲システムを有効化
                        this.config.module.sumoSystem.enabled = true;
                        player.sendMessage("§a相撲システムを有効にしました。");
                        break;
                    case "disable": // 相撲システムを無効化
                        this.config.module.sumoSystem.enabled = false;
                        this.sumoTagsInUse = []; // 使用中のタグをクリア
                        // 全プレイヤーから相撲関連のタグを削除
                        world.getPlayers().forEach(p => {
                            p.getTags().forEach(tag => {
                                if (tag.startsWith("sumo")) {
                                    p.removeTag(tag);
                                }
                            });
                        });
                        player.sendMessage("§c相撲システムを無効にしました。");
                        break;
                    case "pvp": // PvP 相撲モードの切り替え
                        if (player.hasTag(this.pvpSumoTag)) {
                            player.removeTag(this.pvpSumoTag);
                            player.sendMessage("§cPvP 相撲モードを無効にしました。");
                        } else {
                            player.addTag(this.pvpSumoTag);
                            player.sendMessage("§aPvP 相撲モードを有効にしました。");
                        }
                        break;
                    case "true": // 強制 PvP 相撲モードの切り替え
                        if (player.hasTag(this.trueSumoTag)) {
                            player.removeTag(this.trueSumoTag);
                            player.sendMessage("§c強制 PvP 相撲モードを無効にしました。");
                            this.checkSystemStatus(); // システムの状態を更新
                        } else {
                            player.addTag(this.trueSumoTag);
                            player.sendMessage("§a強制 PvP 相撲モードを有効にしました。");
                            this.checkSystemStatus(); // システムの状態を更新
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