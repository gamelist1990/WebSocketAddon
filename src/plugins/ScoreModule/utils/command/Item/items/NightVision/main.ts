import {
  Player,
  system
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../CustomItem";
import { registerCustomItem } from "../../custom";

// ナイトビジョン効果を付与する関数
function giveNightVision(player: Player, duration: number) {
  // 効果音（ガラスの割れる音＋エンチャント音）
  player.playSound("random.glass", { location: player.location, volume: 1.0, pitch: 1.2 });
  system.runTimeout(() => {
    player.playSound("random.orb", { location: player.location, volume: 0.7, pitch: 1.5 });
  }, 2);
  // ナイトビジョン付与
  player.addEffect("minecraft:night_vision", duration, { amplifier: 255, showParticles: false });
  player.sendMessage("§b視界が明るくなった！");
}

// カスタムアイテム定義
const boomItem = new CustomItem({
  name: "§bNightVision",
  lore: ["§7使うと数秒間ナイトビジョンで視界が明るくなる"],
  item: "minecraft:paper",
  amount: 1,
});

boomItem.then((player: Player, eventData: any) => {
  if (eventData.eventType === EventType.ItemUse) {
    system.run(()=> giveNightVision(player, 20 * 30));
    system.run(() => boomItem.removeItem(player, boomItem.get()));
  }
});

try {
  registerCustomItem(27, boomItem);
} catch (e) {
  console.error(`[Boom] 登録失敗: ${e}`);
}