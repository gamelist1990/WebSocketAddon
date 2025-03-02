import { Player } from "@minecraft/server";
import { Handler } from "../../../../module/Handler";
import { CustomItem } from "../../utils/CustomItem";


export function registerCustomItem(id: number, customItem: CustomItem): void {
    customItemsMap.set(`${id}`, customItem);
    console.warn(`${customItem.name} registered`);
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
        usage: 'item give <itemName> [amount]  |  item info <itemName> | item list',
        execute: (message, event) => {
            const args = message.trim().split(/\s+/); // 前後の空白削除、空要素削除
            const player = event.sourceEntity as Player;

            if (args.length < 1) { // コマンドとサブコマンドが最低限存在するか
                player.sendMessage('使用方法: item give <itemName> [amount]  |  item info <itemName> | item list');
                return;
            }
            const subCommand = args[0];

            if (subCommand === 'give') {
                
                const itemName = args[1];
                const amount = args[2] ? parseInt(args[2]) : undefined;

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
                    customItem.give(player, amount);
                    player.sendMessage(`${customItem.name} を ${amount ?? customItem.amount} 個付与しました`);
                } else {
                    player.sendMessage('指定されたアイテムは存在しません');
                }

            } else if (subCommand === 'info') {
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
                player.sendMessage('=== 登録済みアイテム一覧 ===');
                if (customItemsMap.size === 0) {
                    player.sendMessage('登録されているアイテムはありません。');
                } else {
                    customItemsMap.forEach((customItem, id) => {
                        player.sendMessage(`- ${id}: ${customItem.name}`); // IDと名前を表示
                    });
                }

            } else {
                player.sendMessage('使用方法: item give <itemName> [amount]  |  item info <itemName> | item list');
            }
        },
    });
}