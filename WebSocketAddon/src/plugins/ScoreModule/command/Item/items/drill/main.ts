import { Player, system, Dimension, Vector3 } from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

interface DrillOptions {
    width: number;     // 幅 (例: 3)
    height: number;    // 高さ (例: 3)
    depth: number;     // 奥行き (例: 10)
    maxDistance: number; //最大距離
    drillDelay: number; //掘削の間隔
}

// 掘削処理を行う関数
function runDrillAction(player: Player, drillItem: CustomItem, options: DrillOptions) { // drillItemの型をCustomItemに修正
    const { width, height, depth, maxDistance, drillDelay } = options;

    system.run(() => {
        const dimension: Dimension = player.dimension;
        const direction = player.getViewDirection();

        // 掘削の始点を計算（プレイヤーの視線の先のブロック）
        const blockHit = player.getBlockFromViewDirection({ maxDistance });

        if (!blockHit || !blockHit.block) {
            player.sendMessage("§c掘削するブロックが見つかりません。");
            return;
        }

        if (!drillItem) {
            console.warn("Drill item is null or undefined.");
            return;
        }

        if (drillItem.remove) {
            drillItem.removeItem(player, drillItem.get());
        }


        const startBlock = blockHit.block;
        // 始点をブロックの角に設定（正確なブロック位置が必要）
        const startX = startBlock.x;
        const startY = startBlock.y;
        const startZ = startBlock.z;

        // 方向ベクトルを正規化（単位ベクトル化）、0除算対策と垂直方向の処理
        const length = Math.sqrt(
            direction.x * direction.x +
            direction.y * direction.y +
            direction.z * direction.z
        );
        let dx = length > 0 ? direction.x / length : 0;
        let dy = length > 0 ? direction.y / length : 0;
        let dz = length > 0 ? direction.z / length : 0;

        // 真上または真下を向いている場合の特別な処理
        if (Math.abs(dy) > 0.99) {
            dx = 0;
            dz = 0;
            dy = (dy > 0) ? 1 : -1;
        }

        // 掘削アニメーション、サウンド追加
        const playBreakEffects = (location: Vector3) => {
            dimension.spawnParticle("minecraft:basic_flame_particle", location);
            const randomPitch = 0.8 + Math.random() * 0.4;
            player.playSound("dig.stone", { location, volume: 1, pitch: randomPitch });
        };


        let right: Vector3;
        let up: Vector3;

        if (Math.abs(dx) > Math.abs(dz)) {
            // X軸方向が強い場合 -> 右方向はZ軸に固定、上方向はY軸
            right = { x: 0, y: 0, z: (dx > 0 ? -1 : 1) };
            up = { x: 0, y: 1, z: 0 };

        } else if (Math.abs(dx) < Math.abs(dz)) {
            // Z軸方向が強い場合 -> 右方向はX軸に固定。上方向はY軸
            right = { x: (dz > 0 ? 1 : -1), y: 0, z: 0 };
            up = { x: 0, y: 1, z: 0 };
        } else {
            // 真上/真下を向いている場合は既に上でdx,dy,dzの調整済みなので
            // 右をx軸, 上をz軸に
            right = { x: 1, y: 0, z: 0 };
            up = { x: 0, y: 0, z: 1 };
        }



        let currentDepth = 0;  //現在の深さ

        const runDrillInterval = system.runInterval(() => {
            if (currentDepth >= depth) {
                system.clearRun(runDrillInterval);
                player.playSound("random.explode", { location: { x: startX, y: startY, z: startZ }, volume: 1, pitch: 1 });
                return;
            }
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {

                    const offsetX = col - Math.floor(width / 2);
                    const offsetY = row - Math.floor(height / 2);

                    // 各ブロックの座標を計算
                    const blockX = startX + Math.round(currentDepth * dx) + offsetX * right.x + offsetY * up.x;
                    const blockY = startY + Math.round(currentDepth * dy) + offsetX * right.y + offsetY * up.y;
                    const blockZ = startZ + Math.round(currentDepth * dz) + offsetX * right.z + offsetY * up.z;


                    const roundedLocation: Vector3 = { x: blockX, y: blockY, z: blockZ, };

                    const block = dimension.getBlock(roundedLocation);
                    if (block) {
                        if (block.typeId === "minecraft:bedrock") {
                            continue; //bedrockなら何もしない
                        }
                        playBreakEffects(roundedLocation);

                        // /fill コマンドで空気ブロックを配置 (destroy オプション付き)
                        dimension.runCommandAsync(`fill ${blockX} ${blockY} ${blockZ} ${blockX} ${blockY} ${blockZ} air destroy`)
                            .catch(error => {
                                // コマンド実行エラー処理 (例: ログ出力)
                                console.error("fill command failed:", error);
                            });
                    }
                }
            }
            currentDepth++;
        }, drillDelay);
    });
}


const drillItem = new CustomItem({
    name: "§bドリル",
    lore: ["§7指定方向に3x3x5のトンネルを掘る事ができるよ！"],
    item: "minecraft:diamond_pickaxe",
    amount: 1,
    remove:true
}).then((player: Player, eventData) => {
    if (eventData.eventType !== EventType.ItemUse) return;
    const drillOptions: DrillOptions = {
        width: 5,
        height: 5,
        depth: 10,
        maxDistance: 10,
        drillDelay: 5
    };

    runDrillAction(player, drillItem, drillOptions);
})


registerCustomItem(15, drillItem);