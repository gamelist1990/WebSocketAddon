import { Module, moduleManager } from '../../module/module';
import { Handler } from '../../module/Handler';
import "./utils/import";
import { registerChangeTag2Command, registerChangeTagCommand } from './command/changeTag';
import { registerChestFillCommand } from './command/chestFill';
import { registerCloneBlockCommand } from './command/cloneBlock';
import { registerCloseFormCommand } from './command/closeForm';
import { registerScoreCommand } from './command/copyScore';
import { registerRandomDropCommand } from './command/dropItem';
import { registerRandomBlockCommand } from './command/randomBlock';
import { registerNumberCommand } from './command/randomNumber';
import { registerResetScoreCommand } from './command/resetScore';
import { registerScoreDeleteCommand } from './command/scoreDelete';
import { registerTeamCommand } from './command/team';
import { registerTeamCountCommand } from './command/teamCount';
import { registerRegionControlCommand } from './command/Region';
import { registerCheckBlockCommand } from './command/checkBlock';
import { registerTagCommand } from './command/tag';
import { registerItemCommand } from './command/Item/custom';
import { registerTransfer } from './command/transfer';
import { registerAutoArmorCommand } from './command/arrmor';
import { registerDuelCommand } from './command/duel';
import { registerRankCommands } from './utils/rankModule';

class ScoreModule implements Module {
  name = 'ScoreModule';
  enabledByDefault = true;
  docs = `§lコマンド一覧§r\n
§b- resetScore <スコアボード名|-all>§r: 指定したスコアボード、または全てのスコアボードのスコアをリセットします。\n
  §7<スコアボード名>§r: リセットするスコアボードの名前。\n
  §7-all§r: 全てのスコアボードをリセット。\n
§b- number <数値1>,<数値2>,...§r: 指定された数値の中からランダムに1つを選び、'ws_number' スコアボードに設定します。\n
  §7<数値1>,<数値2>,...§r: カンマ区切りの数値リスト。\n
§b- score=<コピー元スコアボード名>§r: 指定したスコアボードの値を 'ws_<スコアボード名>' にコピー。以下のプレースホルダーが使用可能です:\n
  §7[allPlayer]§r: 全プレイヤー数\n
  §7[uptime]§r: サーバー稼働時間\n
  §7[ver]§r: スクリプトバージョン\n
  §7[time]§r: 現在時刻 (時:分)\n
  §7[tag=<タグ名>]§r: 指定したタグを持つプレイヤー数\n
  §7[score=<スコアボード名>]§r: 指定したスコアボードの最高スコア\n
  §7[score=<スコアボード名>,<プレイヤー名>]§r: 指定したスコアボードの指定したプレイヤーのスコア\n
  §7[scoreN=<スコアボード名>]§r: 指定したスコアボードの最初の参加者の名前（参加者がいない場合は'0'）\n
  §7[scoreN=<スコアボード名>, <プレイヤー名>]§r: 指定したスコアボードの指定したプレイヤーの名前。見つからない場合は'0'\n
§b- team set <チーム数>:<チーム内上限人数> <タグ名> <スコアボード名>§r: 指定した条件でプレイヤーをチーム分けし、スコアボードに記録します。\n
  §7<チーム数>§r: 作成するチームの数。\n
  §7<チーム内上限人数>§r: 各チームの最大人数。\n
  §7<タグ名>§r: チーム分けの対象となるプレイヤーが持つタグ。\n
  §7<スコアボード名>§r: チーム番号を記録するスコアボード名。\n
§b- scoreDelete form§r: スコアボードを削除するためのフォームを表示します。\n
§b- scoreDelete all§r: 'ws_module' 以外の 'ws_' で始まる全てのスコアボードを一括削除します。\n
§b- teamCount <チームタグ1,チームタグ2,...> <JSON> [true]§r: 指定したタグを持つプレイヤー数に基づき、コマンドを実行します。\n
  §7<チームタグ1,チームタグ2,...>§r: カンマ区切りのチームタグ。\n
  §7<JSON>§r: チームタグとコマンドの対応を記述したJSON配列。例: [{"team1":"cmd1"},{"team2":"cmd2"}]\n
  §7[true]§r: (オプション) 最大人数のチームを比較してコマンド実行。指定がない場合は、0人になったチームを検知してコマンド実行。同人数の場合は"same"キーのコマンド実行。\n
§b- closeForm§r: ユーザーが開いているフォームを強制的に閉じます。\n
§b- changeTag <元のタグ>,<新しいタグ>§r: 指定されたタグを持つプレイヤーのタグを別のタグに変更します。\n
  §7<元のタグ>§r: 変更前のタグ。\n
  §7<新しいタグ>§r: 変更後のタグ。\n
§b- cloneBlock <JSON>§r: 指定された座標のブロックを別の座標にクローンします。\n
  §7<JSON>§r: {"form":[{"x":0,"y":64,"z":0},...],"to":[{"x":10,"y":64,"z":10},...]} の形式。\n
§b- chestFill <JSON>§r: 指定座標のコンテナにアイテムを設定。\n
  §7<JSON>§r: 座標とアイテムのデータを定義したJSON。\n
    §8例: {"locations":[{"x":0,"y":64,"z":0}],"items":[{"id":"minecraft:diamond","amount":2,"name":"§bSpecial Diamond","lore":["§7Shiny!"]}],"randomSlot":true}\n
    §8locations: コンテナの座標の配列。\n
    §8items: 格納するアイテムの配列。\n
      §9id: アイテムID。\n
      §9amount: アイテム数 (省略可、デフォルト1)。\n
      §9data: アイテムデータ値 (省略可、デフォルト0)。\n
      §9name: アイテム名 (省略可)。\n
      §9lore: アイテム説明文 (省略可)。\n
      §9lockMode: ロックモード "slot"|"inventory" (省略可)。\n
      §9keepOnDeath: 死んだ時に保持するか (省略可)。\n
      §9enchantments: エンチャントの配列 (省略可)。例: [{"type":"sharpness","level":3}]\n
    §8randomSlot: trueの場合、ランダムなスロットにアイテムを配置 (省略可、デフォルトfalse)。§r\n
§b- randomBlock <JSON>§r: 指定された座標に、指定されたブロックをランダムに設置します。\n
  §7<JSON>§r: 座標とブロックのデータを定義したJSON。\n
    §8例: {"locations":["0 64 0", "1 64 0"],"blocks":[{"id":"minecraft:dirt","weight":3},{"id":"minecraft:stone","weight":1}]}\n
    §8locations: ブロックを設置する座標の配列 (文字列形式)。\n
    §8blocks: 設置するブロックの配列。\n
      §9id: ブロックID。\n
      §9weight: 出現率の重み (数値が大きいほど出現しやすい)。§r\n
§b- randomDrop <JSON>§r: 指定範囲内にアイテムをランダムドロップ。\n
  §7<JSON>§r: 範囲、アイテムのデータを定義したJSON。\n
    §8例: {"start":{"x":0,"y":60,"z":0},"end":{"x":20,"y":65,"z":20},"items":[{"id":"minecraft:diamond","weight":1,"amount":1,"name":"§bLucky Diamond","lore":["§7Found you!"]},{"id":"minecraft:iron_ingot","weight":5, "amount": 3},{"id":"minecraft:dirt","weight":10}],"dropCount": 5}\n
    §8start: 開始座標。\n
    §8end: 終了座標。\n
    §8items: ドロップするアイテムの配列。\n
      §9id: アイテムID。\n
      §9amount: アイテム数 (省略可、デフォルト1)。\n
      §9data: アイテムデータ値 (省略可、デフォルト0)。\n
      §9name: アイテム名 (省略可)。\n
      §9lore: アイテム説明文 (省略可)。\n
      §9lockMode: ロックモード "slot"|"inventory" (省略可)。\n
      §9keepOnDeath: 死んだ時に保持するか (省略可)。\n
      §9enchantments: エンチャント (省略可)。例: [{"type":"sharpness","level":3}]\n
      §9weight: 出現率 (重み)。\n
    §8dropCount: ドロップ数 (省略可、デフォルト1)。§r\n
§b- regionControl <JSON>§r: 指定した範囲(リージョン)内のプレイヤーに対して、様々な効果を付与します。\n
  §7<JSON>§r: リージョンの設定を記述したJSON。 \n
  §8例: [{"regionName":"name1", "start":{"x":0,"y":60,"z":0}, "end":{"x":10,"y":70,"z":10}, "tag":"tag1", "particle":true, "teleport":true, "teleportLocation":{"x":5,"y":65,"z":5}, "particleRange": 5, "particleMinDistance": 2, "ignoreY": 50, "area":{"scoreboardObjective":"objective", "scoreName":"name", "maxValue": 100}}]\n
    §8regionName: リージョン名 (文字列)。\n
    §8start: 開始座標 (x, y, z)。\n
    §8end: 終了座標 (x, y, z)。\n
    §8tag: リージョン内にいるプレイヤーに付与するタグ (文字列)。\n
    §8particle: パーティクルを表示するか (true/false)。\n
    §8teleport: リージョン内にいるプレイヤーを指定座標にテレポートさせるか (true/false)。\n
    §8teleportLocation: テレポート先の座標 (teleportがtrueの場合)。\n
    §8particleRange: パーティクルを表示する範囲(？)。\n
    §8particleMinDistance: パーティクルの最小距離(？)。\n
    §8ignoreY: Y座標を無視するか(？)。\n
    §8area: スコアボード関連の設定(？)。\n
      §9scoreboardObjective: スコアボードのオブジェクト名。\n
      §9scoreName: スコア名\n
      §9maxValue: スコアの最大値。\n
§b- tagChange2 <JSON>§r: 複数のプレイヤーのタグを一括で変更します。\n
  §7<JSON>§r: {"from":"oldTag", ... , "hideDisplayAfter": 3}の形式\n
    §8from: 変更前のタグ名\n
    §8...:  '新しいタグ名': '古いタグ名'という形でタグの対応を記述します。\n
    §8hideDisplayAfter: 変更後に表示を隠すまでの時間(秒)。\n
§b- checkBlock <JSON>§r: 指定範囲内に特定のブロックが存在するか確認し、存在する場合はコマンドを実行します。\n
  §7<JSON>§r: {"start":{"x":0,"y":64,"z":0},"end":{"x":10,"y":70,"z":10},"checkBlocks":["minecraft:dirt","minecraft:stone"],"runCommand":"say Found block at {x} {y} {z}"}の形式\n
    §8start: 開始座標 (x, y, z)。\n
    §8end: 終了座標 (x, y, z)。\n
    §8checkBlocks: 確認するブロックIDの配列。\n
    §8runCommand: ブロックが見つかった場合に実行するコマンド。{x}, {y}, {z} で座標を取得可能。\n
§b- tag <add|remove> <タグ名>§r: プレイヤーにタグを追加/削除します。\n
  §7add§r: タグを追加します。\n
  §7remove§r: タグを削除します。\n
  §7<タグ名>§r: 追加/削除するタグ名。`;



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
    registerCheckBlockCommand(handler, this.name)
    registerTagCommand(handler, this.name);
    registerItemCommand(handler, this.name);
    registerTransfer(handler, this.name);
    registerAutoArmorCommand(handler,this.name)
    registerDuelCommand(handler,this.name)
    //New
    registerRankCommands(handler, this.name);
  }

}


export const ver = "0.2.0"
const ScoreModules = new ScoreModule();
moduleManager.registerModule(ScoreModules);