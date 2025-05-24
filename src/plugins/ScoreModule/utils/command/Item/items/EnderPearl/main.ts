import {
    Player,
    system,
    BlockRaycastOptions,
    EntityRaycastOptions,
    DimensionLocation,
    GameMode // To prevent use in certain game modes
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../CustomItem"; // パスは環境に合わせて調整してください
import { registerCustomItem } from "../../custom"; // パスは環境に合わせて調整してください

// --- 即着エンダーパールの設定 ---
const INSTANT_ENDER_PEARL_ID = 28; // アックスとは別のユニークID
const MAX_TELEPORT_DISTANCE = 48; // エンダーパールの最大テレポート距離 (お好みで調整)


const instantEnderPearl = new CustomItem({
    name: "§dエンパ",
    lore: [
        "§7投げずに即座にテレポートするエンダーパール。",
        "§7見ているブロック、または途中のエンティティに移動します。",
        `§7最大距離: §e${MAX_TELEPORT_DISTANCE}ブロック`
    ],
    item: "minecraft:ender_pearl"
})
.then((player: Player, eventData) => {
    if (eventData.eventType !== EventType.ItemUse) return;

    const gameMode = player.getGameMode();
    if (gameMode === GameMode.spectator) {
        player.onScreenDisplay.setTitle("§cサバイバルモードまたはアドベンチャーモードでのみ使用可能です。");
        return; 
    }

    system.run(() => {
        //投げる音
        let didTeleport = false;
        const entityRaycastOptions: EntityRaycastOptions = {
            maxDistance: MAX_TELEPORT_DISTANCE
        };
        const entityHits = player.getEntitiesFromViewDirection(entityRaycastOptions);

        // 自分自身を除外する
        const validEntityHits = entityHits.filter(hit => hit.entity.id !== player.id);

        if (validEntityHits.length > 0) {
            const targetEntity = validEntityHits[0].entity;
            try {
                player.teleport(targetEntity.location, {
                    dimension: targetEntity.dimension,
                    checkForBlocks: true, // 安全な場所にテレポートさせる
                    rotation: player.getRotation() // プレイヤーの向きを維持
                });
                didTeleport = true;
            } catch (e) {
                console.warn(`エンティティへのテレポート中にエラー: ${e}`);
            }
        } else {
            // 2. エンティティがいなければブロックへのヒットを試みる
            const blockRaycastOptions: BlockRaycastOptions = {
                maxDistance: MAX_TELEPORT_DISTANCE,
                includeLiquidBlocks: false,      // 液体ブロックの表面をターゲットにしない (お好みでtrue)
                includePassableBlocks: false,    // 空気や草などをターゲットにしない
            };
            const blockHit = player.getBlockFromViewDirection(blockRaycastOptions);

            if (blockHit && blockHit.block) {
                const targetBlock = blockHit.block;
                // テレポート先の座標を計算 (ブロックの中心、1ブロック上)
                // DimensionLocation を使用
                const teleportLocation: DimensionLocation = {
                    x: targetBlock.location.x + 0.5,
                    y: targetBlock.location.y + 1.0, 
                    z: targetBlock.location.z + 0.5,
                    dimension: targetBlock.dimension
                };

                try {
                    player.teleport(teleportLocation, {
                        checkForBlocks: true, // 壁などに埋まらないように安全な場所を探す
                        rotation: player.getRotation() // プレイヤーの向きを維持
                    });
                    didTeleport = true;
                } catch (e) {
                    console.warn(`ブロックへのテレポート中にエラー: ${e}`);
                }
            }
        }

        if (didTeleport) {
            //削除処理
            player.playSound("mob.endermen.portal", { location: player.location, volume: 1.0, pitch: 1.0 });
            instantEnderPearl.removeItem(player, instantEnderPearl.get());
        } else {
            // テレポート先が見つからなかった場合 (例: 空を見ている)
            player.playSound("note.bass", { location: player.location, pitch: 0.5, volume: 0.7 }); // 失敗音
        }
    });
});

registerCustomItem(INSTANT_ENDER_PEARL_ID, instantEnderPearl);

