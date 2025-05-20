import {
  Player,
  system,
  Vector3,
  EntityQueryOptions,
  Dimension,
  GameMode,
  MolangVariableMap,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../CustomItem";
import { registerCustomItem } from "../../custom";
import { Vector } from "../../../../../../../module/Vector";

// ビームパーティクル生成
function spawnBeamParticles(
  dimension: Dimension,
  start: Vector3,
  end: Vector3,
  particleType: string,
  step: number
): void {
  const direction = Vector.subtract(end, start);
  const length = direction.magnitude();
  if (length < 0.1) return;
  const norm = direction.normalized();
  const particleVars = new MolangVariableMap();
  for (let d = 0; d < length; d += step) {
    const pos = Vector.from(start).add(norm.multiply(d));
    dimension.spawnParticle(
      particleType,
      { x: pos.x, y: pos.y + 0.5, z: pos.z },
      particleVars
    );
  }
}

// 導引の巻物効果 (10秒間、近くのプレイヤーにビームを発射)
function guideScrollAction(player: Player, guideScroll: CustomItem) {
    if (!player?.isValid) return;
    const duration = 10 * 20;
    const intervalTick = 10;
    const searchRadius = 20;
    let ticks = 0;
    let itemConsumed = false;  // アイテムが消費済みか判定するフラグ
    const dim = player.dimension;
    const name = player.name;
    const id = system.runInterval(() => {
        if (!player.isValid) {
            system.clearRun(id);
            return;
        }
        const query: EntityQueryOptions = {
            location: player.location,
            maxDistance: searchRadius,
            type: "minecraft:player",
            excludeGameModes: [GameMode.spectator, GameMode.creative],
            excludeNames: [name],
        };
        const targets = dim.getEntities(query).filter(e => e.isValid);
        if (targets.length) {
            const target = targets[0] as Player;
            if (!itemConsumed) {
                system.run(() => guideScroll.removeItem(player, guideScroll.get()));
                itemConsumed = true;
            }
            // ビーム発射時の効果音（エンダーパール発射音＋エンドロッド）
            player.playSound("mob.allay.item_thrown", { location: player.location, volume: 1.0, pitch: 1.1 });
            system.runTimeout(() => {
                player.playSound("chime.amethyst_block", { location: player.location, volume: 0.7, pitch: 1.3 });
            }, 2);
            spawnBeamParticles(dim, player.location, target.location, "minecraft:endrod", 0.4);
            ticks += intervalTick;
            if (ticks >= duration) system.clearRun(id);
        } else {
            // プレイヤーがいない場合は村人の「はぁん」音
            player.playSound("mob.villager.no", { location: player.location, volume: 1.0, pitch: 1.0 });
            player.sendMessage("§c近くにプレイヤーがいません");
            system.clearRun(id);
        }
    }, intervalTick);
}

// カスタムアイテム定義とイベント処理
const guideScrollItem = new CustomItem({
  name: "§e導引の巻物",
  lore: ["§7近くのプレイヤーへビーム発射 (10秒間)"],
  item: "minecraft:blaze_rod",
  amount: 1,
});

guideScrollItem.then((player: Player, eventData: any) => {
  const user = eventData?.source instanceof Player ? eventData.source : player;
  if (eventData.eventType === EventType.ItemUse && user?.isValid) {
    guideScrollAction(user, guideScrollItem);
  }
});

try {
  registerCustomItem(26, guideScrollItem);
} catch (e) {
  console.error(`[導引の巻物] 登録失敗: ${e}`);
}