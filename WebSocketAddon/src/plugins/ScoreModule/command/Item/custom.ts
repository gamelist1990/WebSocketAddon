import { Player } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";
import { CustomItem } from "../../utils/CustomItem";
import { ItemLockMode } from "@minecraft/server";


export function registerCustomItem(id: number, customItem: CustomItem): void {
    customItemsMap.set(`${id as number}`, customItem as CustomItem);
    // console.warn(`${customItem.name} registered`);
}

const customItemsMap = new Map<string, CustomItem>();


async function test() {
    await import('./items/import');

}
test()

export function registerItemCommand(handler: Handler, moduleName: string) {

    handler.registerCommand('item', {
        moduleName: moduleName,
        description: 'CustomItemの付与/情報表示',
        usage: 'item give <itemName> [amount] [itemLock] [slot] |  item info <itemName> | item list',
        execute: (message, event) => {
            const args = message.trim().split(/\s+/);
            const player = event.sourceEntity as Player;

            if (args.length < 1) {
                player.sendMessage('使用方法: item give <itemName> [amount] [itemLock] [slot] |  item info <itemName> | item list');
                return;
            }
            const subCommand = args[0];

            if (subCommand === 'give') {
                const itemName = args[1];
                const amount = args[2] ? parseInt(args[2], 10) : undefined;

                // itemLock の処理を先に、かつ明示的に行う
                let itemLock: ItemLockMode | undefined;
                let slot: number | undefined;

                // args[3] が itemLock として有効な文字列かチェック
                if (args[3] && (args[3].toLowerCase() === "slot" || args[3].toLowerCase() === "inventory" || args[3].toLowerCase() === "none")) {
                    const lockModeStr = args[3].toLowerCase();
                    if (lockModeStr === "slot") {
                        itemLock = ItemLockMode.slot;
                    } else if (lockModeStr === "inventory") {
                        itemLock = ItemLockMode.inventory;
                    } else {
                        itemLock = ItemLockMode.none;
                    }
                    slot = args[4] ? parseInt(args[4], 10) : undefined;
                } else {
                    slot = args[3] ? parseInt(args[3], 10) : undefined;
                }

                if (slot !== undefined && itemLock !== undefined && itemLock !== ItemLockMode.none) {
                    player.sendMessage("警告: スロットを指定する場合は、itemLockをnoneにすることを推奨します。");
                }

                if (itemName === undefined) {
                    player.sendMessage('アイテム名を指定してください');
                    return;
                }

                // 数値IDまたは名前で検索 (数値IDを優先)
                let customItem = customItemsMap.get(itemName);
                if (!customItem) {
                    for (const [, item] of customItemsMap) {
                        if (item.name === itemName) {
                            customItem = item;
                            break;
                        }
                    }
                }


                if (customItem) {
                    customItem.give(player, amount, itemLock, slot);

                    // メッセージの調整 (オプション引数も表示)
                    let message = `${customItem.name} を `;
                    message += amount !== undefined ? `${amount} 個` : `${customItem.amount} 個`;
                    message += itemLock !== undefined ? ` [${itemLock}] ` : "";
                    message += slot !== undefined ? ` [Slot: ${slot}]` : "";
                    message += "付与しました";

                    player.sendMessage(message);

                } else {
                    player.sendMessage('指定されたアイテムは存在しません');
                }


            } else if (subCommand === 'info') {
                //info
                const itemName = args[1];
                if (itemName === undefined) {
                    player.sendMessage('アイテム名を指定してください');
                    return;
                }

                // 数値IDまたは名前で検索 (数値IDを優先)
                let customItem = customItemsMap.get(itemName);
                if (!customItem) {
                    for (const [, item] of customItemsMap) {
                        if (item.name === itemName) {
                            customItem = item;
                            break;
                        }
                    }
                }

                if (customItem) {
                    player.sendMessage(`=== ${customItem.name} の情報 ===`);
                    player.sendMessage(`- アイテムID: ${customItem.item}`);
                    player.sendMessage(`- 説明: ${customItem.lore.join(", ")}`);
                    player.sendMessage(`- 個数: ${customItem.amount}`);
                    player.sendMessage(`- 使用時削除: ${customItem.remove ? "はい" : "いいえ"}`);
                    player.sendMessage(`- インベントリロック: ${customItem.itemLock}`);

                    if (customItem.placeableOn) {
                        player.sendMessage(`- 配置可能: ${customItem.placeableOn.join(", ")}`);
                    }
                    if (customItem.notPlaceableOn) {
                        player.sendMessage(`- 配置不可: ${customItem.notPlaceableOn.join(", ")}`);
                    }
                } else {
                    player.sendMessage(`指定されたアイテム ${itemName} は存在しません。`);
                }

            } else if (subCommand === 'list') {
                //list
                player.sendMessage('=== 登録済みアイテム一覧 ===');
                if (customItemsMap.size === 0) {
                    player.sendMessage('登録されているアイテムはありません。');
                } else {
                    customItemsMap.forEach((customItem, id) => {
                        player.sendMessage(`- ${id}: ${customItem.name}`);
                    });
                }

            } else {
                player.sendMessage('使用方法: item give <itemName> [amount] [itemLock] [slot] |  item info <itemName> | item list');
            }
        },
    });
}