import { Module, moduleManager } from "../../module/module";
import { Handler } from "../../module/Handler";
import "./utils/import";
import {
  registerChangeTag2Command,
  registerChangeTagCommand,
  registerKnockbackCommand,
  registerRenameCommand,
} from "./utils/command/changeTag";
import { registerChestFillCommand } from "./utils/command/chestFill";
import { registerCloneBlockCommand } from "./utils/command/cloneBlock";
import { registerCloseFormCommand } from "./utils/command/closeForm";
import { registerScoreCommand } from "./utils/command/copyScore";
import { registerRandomDropCommand } from "./utils/command/dropItem";
import { registerRandomBlockCommand } from "./utils/command/randomBlock";
import { registerNumberCommand } from "./utils/command/randomNumber";
import { registerResetScoreCommand } from "./utils/command/resetScore";
import { registerScoreDeleteCommand } from "./utils/command/scoreDelete";
import { registerTeamCommand } from "./utils/command/team";
import { registerTeamCountCommand } from "./utils/command/teamCount";
import { registerRegionControlCommand } from "./utils/command/Region";
import { registerCheckBlockCommand } from "./utils/command/checkBlock";
import { registerTagCommand } from "./utils/command/tag";
import { registerItemCommand } from "./utils/command/Item/custom";
import { registerTransfer } from "./utils/command/transfer";
import {
  registerAutoArmorCommand,
  registerAutoHotBarCommand,
  registerAutoInvCommand,
} from "./utils/command/arrmor";
import { registerDuelCommand } from "./utils/command/duel";
import { registerRankCommands } from "./utils/rankModule";
import { registerFillCommand } from "./utils/command/fill";
import { registerChangeHPCommand } from "./utils/command/hpchange";
import { registerShopCommands } from "./utils/command/shop";

class ScoreModule implements Module {
  name = "ScoreModule";
  enabledByDefault = true;
  docs = `§lコマンド一覧§r\n
§b- resetScore <スコアボード名|-all>§r: 指定したスコアボード、または全てのスコアボードのスコアをリセットします。\n  §7<スコアボード名>§r: リセットするスコアボードの名前。\n  §7-all§r: 全てのスコアボードをリセット。\n§b- resetTag [タグ名]§r: 実行者の全タグ、または指定したタグ名に類似するタグを削除します。\n  §7[タグ名]§r: (省略可) 類似するタグのみ削除。\n§b- resetJson§r: 実行者の全ダイナミックプロパティをクリアします。\n§b- number <数値1>,<数値2>,...§r: 指定された数値の中からランダムに1つを選び、'ws_number' スコアボードに設定します。\n  §7<数値1>,<数値2>,...§r: カンマ区切りの数値リスト。\n§b- score=<コピー元スコアボード名>§r: 指定したスコアボードの値を 'ws_<スコアボード名>' にコピー。\n  §7[allPlayer]§r: 全プレイヤー数\n  §7[uptime]§r: サーバー稼働時間\n  §7[ver]§r: スクリプトバージョン\n  §7[time]§r: 現在時刻 (時:分)\n  §7[tag=<タグ名>]§r: 指定タグを持つプレイヤー数\n  §7[score=<スコアボード名>]§r: 指定スコアボードの最高スコア\n  §7[score=<スコアボード名>,<プレイヤー名>]§r: 指定スコアボードの指定プレイヤーのスコア\n  §7[scoreN=<スコアボード名>]§r: 指定スコアボードの最初の参加者名\n  §7[scoreN=<スコアボード名>,<プレイヤー名>]§r: 指定スコアボードの指定プレイヤー名\n§b- team set <チーム数>:<上限人数> <タグ名> <スコアボード名>§r: 指定条件でプレイヤーをチーム分けし、スコアボードに記録。\n  §7<チーム数>:<上限人数>§r: 例 3:5\n  §7<タグ名>§r: 対象プレイヤーのタグ\n  §7<スコアボード名>§r: チーム番号を記録\n  または team set <チーム名1> <上限1> ... <タグ名> <スコアボード名> 形式も可\n§b- scoreDelete form§r: スコアボード削除フォームを表示。\n§b- scoreDelete all§r: 'ws_module'以外の'ws_'で始まる全スコアボードを一括削除。\n§b- teamCount <チームタグ1,チームタグ2,...> <JSON> [true] [onlyOneRemaining]§r: 指定タグを持つ人数に応じてコマンド実行。\n  §7<チームタグ1,チームタグ2,...>§r: カンマ区切り\n  §7<JSON>§r: 例 [{"team1":"cmd1"},{"team2":"cmd2"}]\n  §7[true]§r: (オプション) 最大人数チームで判定\n  §7[onlyOneRemaining]§r: (オプション) 最後の1チーム検知\n§b- closeForm§r: ユーザーの開いているフォームを強制的に閉じる\n§b- changeTag <元タグ>,<新タグ>§r: 指定タグを持つプレイヤーのタグを変更\n§b- tagChange2 <JSON>§r: 複数プレイヤーのタグを一括変更。例 {"from":"oldTag","to":"newTag",...}\n§b- cloneBlock <JSON>§r: 指定座標のブロックを別座標にクローン。\n  例 {"form":[{"x":0,"y":64,"z":0}],"to":[{"x":10,"y":64,"z":10}]}\n§b- chestFill <JSON>§r: 指定座標のコンテナにアイテムを設定。\n  例 {"locations":[{"x":0,"y":64,"z":0}],"items":[{"id":"minecraft:diamond","amount":2}],"randomSlot":true}\n§b- randomBlock <JSON>§r: 指定座標にランダムでブロック設置。\n  例 {"locations":["0 64 0"],"blocks":[{"id":"minecraft:dirt","weight":3}]}\n§b- randomDrop <JSON>§r: 指定範囲にアイテムをランダムドロップ。\n  例 {"start":{"x":0,"y":60,"z":0},"end":{"x":20,"y":65,"z":20},"items":[{"id":"minecraft:diamond","weight":1}],"dropCount":5}\n§b- regionControl <JSON>§r: 指定範囲(リージョン)内のプレイヤーに効果付与。\n  例 [{"regionName":"name1","start":{"x":0,"y":60,"z":0},"end":{"x":10,"y":70,"z":10},"tag":"tag1","particle":true}]\n§b- checkBlock <JSON>§r: 指定範囲に特定ブロックが存在するか確認し、存在時コマンド実行。\n  例 {"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":70,"z":10},"checkBlocks":["minecraft:dirt"],"runCommand":"say Found {x} {y} {z}"}\n§b- tag <add|remove> <タグ名>§r: プレイヤーにタグを追加/削除。\n  §7add§r: タグ追加\n  §7remove§r: タグ削除\n  §7<タグ名>§r: 追加/削除するタグ名\n§b- item give <item名> [amount] [itemLock] [slot]§r: カスタムアイテム付与。item info <item名>: 情報表示。item list: 一覧\n§b- transfer <fromタグ> <toタグ> <scoreboard>§r: fromタグ持ち→toタグ持ちへスコア転送\n§b- autoArmor <chestX> <chestY> <chestZ> <tagName> <headSlotMode> <chestSlotMode> <legsSlotMode> <feetSlotMode>§r: 指定タグ持ちのアーマー装備をチェストから一括設定。\n  スロットモード: none/slot/inventory\n§b- autoInv <chestX> <chestY> <chestZ> <tagName>§r: 指定タグ持ちのインベントリをチェストから一括設定。\n§b- autoHotBar <tagName> [fromChest] [chestX] [chestY] [chestZ]§r: 指定タグ持ちのホットバーをチェストから一括設定。\n§b- fill <x1> <y1> <z1> <x2> <y2> <z2> <mode> <blockId> [filterBlockId]§r: 範囲内を指定ブロックでfill。mode: replace/outline/hollow/keep\n§b- rename <新しい名前>§r: 実行者の表示名を変更\n§b- knockback <x> <z> <y>§r: 指定方向にノックバック\n§b- changeHP <数値>§r: 実行者のHPを変更\n§b- duel <サブコマンド> ...§r: デュエル管理。詳細は /help duel 参照\n  例: duel create {JSON}, duel kit <kit名> <x1> <y1> <z1> [x2] [y2] [z2], duel form, duel show, duel give <kit名>\n§b- rank <システム名> <サブコマンド> ...§r: ランクシステム管理。詳細は /help rank 参照\n  例: rank <system> join/reset/add/remove/list ...\n§b- registerRank <タイトル> <スコアボード名> <ランク名,...> <閾値,...>§r: 新しいランクシステムを登録。`;

  async registerCommands(handler: Handler): Promise<void> {
    registerResetScoreCommand(handler, this.name);
    registerNumberCommand(handler, this.name);
    registerScoreCommand(handler, this.name);
    registerTeamCommand(handler, this.name);
    registerScoreDeleteCommand(handler, this.name);
    registerTeamCountCommand(handler, this.name);
    registerCloseFormCommand(handler, this.name);
    registerChangeTagCommand(handler, this.name);
    registerCloneBlockCommand(handler, this.name);
    registerChestFillCommand(handler, this.name);
    registerRandomBlockCommand(handler, this.name);
    registerRandomDropCommand(handler, this.name);
    registerRegionControlCommand(handler, this.name);
    registerChangeTag2Command(handler, this.name);
    registerCheckBlockCommand(handler, this.name);
    registerTagCommand(handler, this.name);
    registerItemCommand(handler, this.name);
    registerTransfer(handler, this.name);
    registerAutoArmorCommand(handler, this.name);
    registerDuelCommand(handler, this.name);
    //New
    registerRankCommands(handler, this.name);
    registerAutoInvCommand(handler, this.name);
    registerFillCommand(handler, this.name);
    registerRenameCommand(handler, this.name);
    registerKnockbackCommand(handler, this.name);
    registerAutoHotBarCommand(handler, this.name);
    registerChangeHPCommand(handler, this.name);
    registerShopCommands(handler, this.name);
  }
}

// スティック使用時のフォーム表示
/**
 * world.beforeEvents.itemUse.subscribe((event) => {
  if (event.itemStack.typeId === "minecraft:stick") {
    system.run(()=>{
      const form = new ActionFormData()
        .title("§m§dtest")
        .body("スティックを使いました。")
        .button("OK","textures/ui/buy_now_hover.png");
      //@ts-ignore
      form.show(event.source).then((response) => {
        if (response.selection === 0) {
          //@ts-ignore
          event.source.sendMessage("ボタン1が押されました。");
        }
      });
    })
  }
});
 */
export const ver = "0.2.0";
const ScoreModules = new ScoreModule();
moduleManager.registerModule(ScoreModules);
