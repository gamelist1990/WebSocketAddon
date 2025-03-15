import {
    Player,
    system,
    world,
    EquipmentSlot,
    BlockInventoryComponent,
    ItemLockMode,
    EntityInventoryComponent
} from "@minecraft/server";
import { Handler } from "../../../module/Handler";

export function registerAutoArmorCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("autoArmor", {
        moduleName: moduleName,
        description:
            "指定されたタグを持つプレイヤーのアーマースロットに、指定されたチェストのアイテムを装備させます。ItemLockModeでロックも可能。ホットバーにもアイテムをコピーし、ロック設定をチェストスロット9で制御。",
        usage: "autoArmor <chestX> <chestY> <chestZ> <tagName> <headSlotMode> <chestSlotMode> <legsSlotMode> <feetSlotMode>",
        execute: (message, event) => {
            const consoleOutput = (msg: string) => console.warn(msg);

            const sendMessage = (msg: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(msg));
                } else {
                    consoleOutput(msg);
                }
            };

            const args = message.split(/\s+/);
            if (args.length !== 8) {
                sendMessage("引数の数が正しくありません。使用法: autoArmor <chestX> <chestY> <chestZ> <tagName> <headSlotMode> <chestSlotMode> <legsSlotMode> <feetSlotMode>");
                return;
            }

            const [chestXStr, chestYStr, chestZStr, tagName, headSlotMode, chestSlotMode, legsSlotMode, feetSlotMode] = args;

            let chestX: number, chestY: number, chestZ: number;
            try {
                chestX = parseInt(chestXStr);
                chestY = parseInt(chestYStr);
                chestZ = parseInt(chestZStr);

                if (isNaN(chestX) || isNaN(chestY) || isNaN(chestZ)) {
                    throw new Error("座標は整数である必要があります。");
                }
            } catch (error) {
                sendMessage(`座標の解析エラー: ${error}`);
                return;
            }

            const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");
            const chestBlock = dimension.getBlock({ x: chestX, y: chestY, z: chestZ });

            if (!chestBlock) {
                sendMessage("指定された座標にブロックが見つかりませんでした。");
                return;
            }

            const chestInventoryComponent = chestBlock.getComponent("inventory") as BlockInventoryComponent;
            if (!chestInventoryComponent) {
                sendMessage("指定されたブロックはインベントリを持っていません (チェストではありません)。");
                return;
            }
            const chestContainer = chestInventoryComponent.container;


            const players = world.getPlayers({ tags: [tagName] });
            if (players.length === 0) {
                sendMessage(`タグ '${tagName}' を持つプレイヤーが見つかりませんでした。`);
                return;
            }

            const slotModes = [headSlotMode, chestSlotMode, legsSlotMode, feetSlotMode];
            const validSlotModes = ["none", "slot", "inventory"];

            for (const mode of slotModes) {
                if (!validSlotModes.includes(mode)) {
                    sendMessage(`不正なスロットモード: ${mode}。有効な値は 'none', 'slot', 'inventory' です。`);
                    return;
                }
            }


            for (const player of players) {
                if (!(player instanceof Player)) continue;

                const equipment = player.getComponent("equippable");
                if (!equipment) {
                    consoleOutput(`Player ${player.name} does not have an equippable component.`);
                    continue;
                }
                const armorSlots = [
                    EquipmentSlot.Head,
                    EquipmentSlot.Chest,
                    EquipmentSlot.Legs,
                    EquipmentSlot.Feet,
                ];

                // ホットバーへのアイテムコピーとロック設定
                const playerInventoryComponent = player.getComponent("inventory") as EntityInventoryComponent;
                if (!playerInventoryComponent) {
                    consoleOutput(`Player ${player.name} does not have an inventory component.`);
                    continue;
                }
                const playerInventory = playerInventoryComponent.container;

                const lockSettingItem = chestContainer?.getItem(8); // チェストのスロット9(index 8)のアイテムでロック設定
                let hotbarLockMode: ItemLockMode = ItemLockMode.none; // デフォルトはロックなし

                if (lockSettingItem?.typeId === "minecraft:diamond_block") {
                    hotbarLockMode = ItemLockMode.slot; // スロット固定
                } else if (lockSettingItem?.typeId === "minecraft:gold_block") {
                    hotbarLockMode = ItemLockMode.inventory; // インベントリ固定
                }

                for (let i = 0; i < 4; i++) { // アーマースロットは4つ
                    const chestItemIndex = i;
                    const itemStack = chestContainer?.getItem(chestItemIndex); // チェストの0-3番目のスロットからアーマーを取得
                    const slotMode = slotModes[i];

                    try {
                        if (itemStack) {
                            itemStack.lockMode = slotMode === "none" ? ItemLockMode.none : (slotMode === "slot" ? ItemLockMode.slot : ItemLockMode.inventory);
                        }
                        equipment.setEquipment(armorSlots[i], itemStack);

                    } catch (error) {
                        console.error(`防具の装備/解除中にエラーが発生しました: ${error}`);
                    }
                }

                // ホットバーへのアイテムコピー(スロット1-4に対応)
                for (let i = 0; i < 9; i++) {
                    const hotbarSlot = i; // ホットバースロット (0-8)
                    const chestHotbarItemIndex = i + 18;

                    const hotbarItemStack = chestContainer?.getItem(chestHotbarItemIndex)?.clone();  //アイテムスタックをクローンする.

                    if (hotbarItemStack) { // アイテムがある場合のみ処理
                        hotbarItemStack.amount = 1;  // 個数を1に制限
                        hotbarItemStack.lockMode = hotbarLockMode; // ロックモードを設定
                        try {
                            playerInventory?.setItem(hotbarSlot, hotbarItemStack);
                        } catch (error) {
                            console.error(`ホットバーへのアイテムコピー中にエラーが発生しました: ${error}`);
                        }

                    }
                }
            }
        },
    });
}