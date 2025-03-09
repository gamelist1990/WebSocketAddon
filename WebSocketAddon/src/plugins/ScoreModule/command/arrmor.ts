import {
    Player,
    system,
    world,
    EquipmentSlot,
    BlockInventoryComponent,
    ItemLockMode,
} from "@minecraft/server";
import { Handler } from "../../../module/Handler";

export function registerAutoArmorCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("autoArmor", {
        moduleName: moduleName,
        description:
            "指定されたタグを持つプレイヤーのアーマースロットに、指定されたチェストのアイテムを装備させます。ItemLockModeでロックも可能。",
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

                for (let i = 0; i < armorSlots.length; i++) {
                    const itemStack = chestContainer?.getItem(i);
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
            }
            sendMessage("防具を装備/解除しました。");
        },
    });
}