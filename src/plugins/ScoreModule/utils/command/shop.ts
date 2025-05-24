import {
    Player,
    system,
    BlockInventoryComponent,
    Vector3,
    Container,
    ItemStack,
    Dimension,
    Entity
} from "@minecraft/server";
import {
    ActionFormData,
    ActionFormResponse,
    ModalFormData,
    ModalFormResponse
} from "@minecraft/server-ui";
import { Handler } from "../../../../module/Handler"; // このパスはあなたのプロジェクト構造に合わせてください

interface CostInfo {
    id: string;
    amount: number;
    texture?: string;
}

/**
 * 指定された座標にあるブロックからチェストのコンテナを取得します。
 * @param dimension ブロックが存在するディメンション。
 * @param pos ブロックの座標 (Vector3)。
 * @returns チェストのコンテナ (Container)、またはチェストが見つからない/インベントリコンポーネントがない場合はnull。
 */
function getChestContainer(dimension: Dimension, pos: Vector3): Container | null {
    try {
        const block = dimension.getBlock(pos);
        if (!block) {
            // console.warn(`指定された座標にブロックがありません: ${pos.x}, ${pos.y}, ${pos.z}`);
            return null;
        }
        // ブロックからインベントリコンポーネントを取得
        const inventoryComponent = block.getComponent("inventory") as BlockInventoryComponent | undefined;
        return inventoryComponent?.container ?? null; // コンポーネントがあればコンテナを、なければnullを返す
    } catch (error) {
        console.error(`チェストコンテナの取得エラー (${pos.x}, ${pos.y}, ${pos.z}): ${error}`);
        return null;
    }
}

/**
 * プレイヤーのインベントリから指定されたコストのアイテムを消費して支払い処理を実行します。
 * @param player 支払いを行うプレイヤー。
 * @param cost 支払うコストの情報 (CostInfo)。
 * @returns 支払いが成功した場合はtrue、失敗した場合はfalse。
 */
function processPayment(player: Player, cost: CostInfo): boolean {
    try {
        const inventory = player.getComponent("inventory")?.container;
        if (!inventory) {
            console.warn(`プレイヤー ${player.name} のインベントリコンテナが見つかりません。`);
            return false;
        }

        let remainingAmountToPay = cost.amount;
        const slotsToTakeFrom: number[] = []; // アイテムを消費するスロットのインデックス
        const amountsToTake: number[] = [];   // 各スロットから消費する量

        // 1. 支払い可能なアイテムがインベントリに十分あるか確認
        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (item && item.typeId === cost.id) { // 通貨アイテムIDが一致するか
                const amountInSlot = item.amount;
                const amountToTakeFromSlot = Math.min(remainingAmountToPay, amountInSlot);

                remainingAmountToPay -= amountToTakeFromSlot;
                slotsToTakeFrom.push(i);
                amountsToTake.push(amountToTakeFromSlot);

                if (remainingAmountToPay <= 0) {
                    break; // 必要な量が集まったらループを抜ける
                }
            }
        }

        // 2. 必要な量が不足している場合は支払い失敗
        if (remainingAmountToPay > 0) {
            return false;
        }

        // 3. 支払いを実行 (実際にアイテムを消費)
        for (let i = 0; i < slotsToTakeFrom.length; i++) {
            const slotIndex = slotsToTakeFrom[i];
            const amountToTake = amountsToTake[i];
            const item = inventory.getItem(slotIndex);

            if (!item) continue; // 万が一アイテムがなくなっていた場合 (通常は起こらない)

            if (item.amount === amountToTake) {
                // スタック全体を消費する場合
                inventory.setItem(slotIndex, undefined);
            } else {
                // スタックの一部を消費する場合
                item.amount -= amountToTake;
                inventory.setItem(slotIndex, item);
            }
        }

        return true; // 支払い成功
    } catch (error) {
        console.error(`プレイヤー ${player.name} の支払い処理エラー (コスト: ${cost.id} x${cost.amount}): ${error}`);
        return false;
    }
}

/**
 * アイテムのnameTagから価格情報を解析します。
 * nameTagはJSON文字列であることを前提とします。
 * 例: {"displayName":"アイテム名","cost":{"id":"minecraft:emerald","amount":10,"texture":"textures/items/my_icon"}}
 * @param nameTag 解析対象のアイテムのnameTag。
 * @returns 解析された価格情報 (CostInfo)、または解析できなかった場合はnull。
 */
function parseCostFromName(nameTag: string | undefined): CostInfo | null {
    if (!nameTag) return null;
    try {
        const obj = JSON.parse(nameTag);
        if (obj && typeof obj === "object" && obj.cost && typeof obj.cost.id === "string" && typeof obj.cost.amount === "number") {
            return {
                id: obj.cost.id,
                amount: obj.cost.amount,
                texture: obj.cost.texture
            };
        }
        return null;
    } catch (error) {
        // JSONでない場合はnullを返す
        return null;
    }
}

/**
 * アイテムのnameTagから表示名と価格情報を分離します。
 * shopEditコマンドでフォームの初期値を設定する際に使用します。
 * @param nameTag 解析対象のアイテムのnameTag。
 * @returns 表示名と解析された価格情報 (CostInfo | null) を含むオブジェクト。
 */
function extractDisplayInfoFromNameTag(nameTag: string | undefined): { displayName: string, currentCost: CostInfo | null } {
    if (!nameTag) {
        return { displayName: "", currentCost: null };
    }
    try {
        const obj = JSON.parse(nameTag);
        return {
            displayName: obj.displayName || "",
            currentCost: obj.cost ? parseCostFromName(nameTag) : null
        };
    } catch {
        return { displayName: nameTag, currentCost: null };
    }
}

/**
 * ショップ関連のコマンド (`shop` と `shopEdit`) を登録します。
 * @param handler コマンドを登録するためのHandlerインスタンス。
 * @param moduleName このコマンドが属するモジュールの名前。
 */
export function registerShopCommands(handler: Handler, moduleName: string): void {

    // --- /shop コマンドの登録 ---
    // 指定されたチェスト内のアイテムを商品として表示し、購入できるようにするコマンド。
    handler.registerCommand("shop", {
        moduleName: moduleName,
        description: "チェストの中身をショップとして表示し、商品を購入できます。\nアイテム名に [cost:通貨ID:金額(:任意テクスチャ)] の形式で価格を設定します。",
        usage: "shop <chestX> <chestY> <chestZ>",
        execute: async (message: string, event: { sourceEntity?: Entity, [key: string]: any }) => {
            const sendMessageToPlayer = (player: Player, msg: string) => {
                system.run(() => player.sendMessage(msg));
            };

            const entity = event.sourceEntity;
            if (!(entity instanceof Player)) {
                console.warn("shopコマンドはプレイヤーのみ実行できます。");
                if (entity) { // entityが存在するがPlayerでない場合 (例: コマンドブロック)
                    try {
                        entity.dimension.runCommand(`say §cshopコマンドはプレイヤーから実行してください。`);
                    } catch (e) { /* 失敗しても無視 */ }
                }
                return;
            }
            const player = entity as Player;

            const args = message.split(/\s+/);
            if (args.length !== 3) {
                sendMessageToPlayer(player, "§c使用法: /shop <chestX> <chestY> <chestZ>");
                return;
            }

            let chestX: number, chestY: number, chestZ: number;
            try {
                chestX = parseInt(args[0]);
                chestY = parseInt(args[1]);
                chestZ = parseInt(args[2]);
                if (isNaN(chestX) || isNaN(chestY) || isNaN(chestZ)) {
                    throw new Error("座標は有効な整数である必要があります。");
                }
            } catch (error) {
                sendMessageToPlayer(player, `§c座標の解析エラー: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }

            const chestLocation: Vector3 = { x: chestX, y: chestY, z: chestZ };
            const container = getChestContainer(player.dimension, chestLocation);

            if (!container) {
                sendMessageToPlayer(player, `§c指定された座標 (${chestX}, ${chestY}, ${chestZ}) にショップのチェストが見つかりませんでした。`);
                return;
            }

            // --- 軽量化: shopItems生成のループを簡潔に ---
            const shopItems = Array.from({ length: container.size }, (_, i) => {
                const item = container.getItem(i);
                if (!item) return null;
                const costInfo = parseCostFromName(item.nameTag);
                if (!costInfo) return null;
                let displayName = item.typeId.replace("minecraft:", "");
                try {
                    const obj = JSON.parse(item.nameTag!);
                    if (obj.displayName && typeof obj.displayName === "string") displayName = obj.displayName;
                } catch {}
                return { slot: i, item, cost: costInfo, displayName };
            }).filter(Boolean) as Array<{ slot: number; item: ItemStack; cost: CostInfo; displayName: string }>;

            if (shopItems.length === 0) {
                sendMessageToPlayer(player, "§cこのショップには販売可能な商品がありません。\n§7アイテム名に価格情報 (例: アイテム名 [cost:id:amount]) が正しく設定されているか確認してください。");
                return;
            }

            const form = new ActionFormData()
                .title("§w§s§1§l§b ショップ ")
                .body("§f欲しいアイテムを選んでね！");

            for (const shopEntry of shopItems) {
                const cost = shopEntry.cost;
                const displayName = shopEntry.displayName;
                const currencyName = cost.id.replace("minecraft:", "");
                const buttonText = `§l${displayName} §r- §e${cost.amount} ${currencyName}`;
                form.button(buttonText, cost.texture);
            }

            try {
                const response: ActionFormResponse = await form.show(player);

                if (response.canceled || response.selection === undefined) {
                    // sendMessageToPlayer(player, "§7ショップの利用をキャンセルしました。"); // 必要に応じて
                    return;
                }

                const selectedShopItem = shopItems[response.selection];
                const costToPay = selectedShopItem.cost;

                // 支払い処理
                const insufficient = processPayment(player, costToPay);
                if (!insufficient) {
                    // プレイヤーのインベントリ内の通貨アイテム数をカウント
                    const inventory = player.getComponent("inventory")?.container;
                    let owned = 0;
                    if (inventory) {
                        for (let i = 0; i < inventory.size; i++) {
                            const item = inventory.getItem(i);
                            if (item && item.typeId === costToPay.id) {
                                owned += item.amount;
                            }
                        }
                    }
                    sendMessageToPlayer(player, `§cおっと！ ${costToPay.id.replace("minecraft:", "")} が ${costToPay.amount}個 足りないみたい… (所持: ${owned}個)`);
                    return;
                }

                // アイテムの付与
                const playerInventory = player.getComponent("inventory")?.container;
                if (!playerInventory) {
                    sendMessageToPlayer(player, "§cあなたのインベントリにアクセスできませんでした。");
                    // 支払い済みのため、返金処理を試みる
                    const refundStack = new ItemStack(costToPay.id, costToPay.amount);
                    const refundInventory = player.getComponent("inventory")?.container;
                    if (refundInventory) {
                        try {
                            refundInventory.addItem(refundStack);
                            sendMessageToPlayer(player, "§e支払ったアイテムを返金しました（インベントリアクセスエラーのため）。");
                        } catch (addItemError) {
                            sendMessageToPlayer(player, "§c返金に失敗しました。インベントリにアイテムを追加できませんでした。運営に連絡してください。");
                            console.error(`プレイヤー ${player.name} への返金エラー (addItem): ${addItemError}`);
                        }
                    } else {
                        sendMessageToPlayer(player, "§c返金に失敗しました。インベントリにアクセスできません。運営に連絡してください。");
                    }
                    return;
                }

                const itemToGive = selectedShopItem.item.clone();
                // nameTagから価格情報を削除し、displayNameのみのJSONにする
                let displayName = itemToGive.typeId.replace("minecraft:", "");
                try {
                    const obj = JSON.parse(itemToGive.nameTag!);
                    if (obj.displayName && typeof obj.displayName === "string") {
                        displayName = obj.displayName;
                    }
                } catch {}
                // nameTag自体を完全に消す（デフォルト名またはdisplayNameのみ表示させる）
                itemToGive.nameTag = displayName || undefined;

                try {
                    playerInventory.addItem(itemToGive);
                    sendMessageToPlayer(player, `§aやったね！「§r${displayName}§a」を購入しました！`);
                } catch (error) { // インベントリ満杯などでaddItemが失敗した場合
                    sendMessageToPlayer(player, "§cインベントリがいっぱいでアイテムを受け取れませんでした。");
                    // 商品を渡せなかったので返金
                    const refundStack = new ItemStack(costToPay.id, costToPay.amount);
                    try {
                        playerInventory.addItem(refundStack);
                        sendMessageToPlayer(player, "§e支払ったアイテムを返金しました（インベントリ満杯のため）。");
                    } catch (refundError) {
                        sendMessageToPlayer(player, "§c返金にも失敗しました。運営に連絡してください。");
                        console.error(`プレイヤー ${player.name} へのインベントリ満杯時の返金エラー: ${refundError}`);
                    }
                }
            } catch (error) {
                console.error(`ショップUI処理中にエラーが発生 (プレイヤー: ${player.name}): ${error instanceof Error ? error.stack : error}`);
                sendMessageToPlayer(player, "§cショップの処理中にエラーが発生しました。しばらくしてからもう一度お試しください。");
            }
        },
    });

    // --- /shopEdit コマンドの登録 ---
    // 手に持っているアイテムをショップ商品として編集するためのコマンド。
    handler.registerCommand("shopEdit", {
        moduleName: moduleName,
        description: "手に持っているアイテムをショップ商品として編集 (名前、Lore、価格設定)。",
        usage: "shopEdit",
        execute: async (_message: string, event: { sourceEntity?: Entity, [key: string]: any }) => {
            const sendMessageToPlayer = (player: Player, msg: string) => {
                system.run(() => player.sendMessage(msg));
            };

            const entity = event.sourceEntity;
            if (!(entity instanceof Player)) {
                console.warn("shopEditコマンドはプレイヤーのみ実行できます。");
                if (entity) {
                    try {
                        entity.dimension.runCommand(`say §cshopEditコマンドはプレイヤーから実行してください。`);
                    } catch (e) { /* 失敗しても無視 */ }
                }
                return;
            }
            const player = entity as Player;

            const inventory = player.getComponent("inventory")?.container as Container | undefined;
            if (!inventory) {
                sendMessageToPlayer(player, "§cあなたのインベントリにアクセスできませんでした。");
                return;
            }

            // selectedSlotの取得方法を修正
            // PlayerInventoryComponentContainerにselectedSlotがある場合はそれを使う
            // なければ0番スロットを仮で使う（本来はイベント等から取得すべき）
            //最新版は 1.21.80で selectedSlotIndex
            const selectedSlot = player.selectedSlotIndex ?? 0;
            const itemInHand = inventory.getItem(selectedSlot);
            if (!itemInHand) {
                sendMessageToPlayer(player, "§c編集するアイテムを手に持ってください。");
                return;
            }

            // 既存の情報を解析してフォームのデフォルト値に設定
            const { displayName: currentDisplayName, currentCost } = extractDisplayInfoFromNameTag(itemInHand.nameTag);
            // Loreを "\\n" で結合してテキストフィールド用の文字列にする (空の場合は空文字)
            const currentLoreString = itemInHand.getLore()?.join('\\n') ?? "";

            const form = new ModalFormData()
                .title("§l§3🔧 ショップアイテム編集 🔧");

            // フォームフィールドの定義
            form.textField("§fアイテム表示名:", "例: すごい剣", { defaultValue: currentDisplayName });                                 // index 0
            form.textField("§f説明文 (Lore):\n§7(各行は \\n で区切ってください)", "例: 攻撃力+10\\n伝説の一振り", { defaultValue: currentLoreString }); // index 1
            form.textField("§e通貨アイテム ID:", "例: minecraft:emerald", { defaultValue: currentCost?.id?.toString() ?? "minecraft:emerald" });    // index 2
            form.textField("§e価格 (整数):", "例: 50", { defaultValue: currentCost?.amount?.toString() ?? "10" });                       // index 3
            form.textField("§bボタンアイコンのテクスチャパス (任意):", "例: textures/items/my_icon", { defaultValue: currentCost?.texture ?? "" }); // index 4

            try {
                const response: ModalFormResponse = await form.show(player);

                if (response.canceled) {
                    return;
                }

                const formValues = response.formValues;
                if (!formValues || formValues.length < 5) {
                    sendMessageToPlayer(player, "§cフォームの入力値が不正です。");
                    return;
                }

                // フォームから値を取得 (型アサーションとtrimで整形)
                const newDisplayName = (formValues[0] as string).trim();
                const newLoreInput = formValues[1] as string;
                const currencyId = (formValues[2] as string).trim();
                const priceString = (formValues[3] as string).trim();
                const texturePath = (formValues[4] as string).trim().replace(/\\/g, "/"); // バックスラッシュをスラッシュに変換

                // バリデーション
                if (!currencyId) {
                    sendMessageToPlayer(player, "§c通貨アイテムIDは必須です。例: minecraft:gold_ingot");
                    return;
                }
                const price = parseInt(priceString);
                if (isNaN(price) || price <= 0) {
                    sendMessageToPlayer(player, "§c価格は0より大きい整数で入力してください。");
                    return;
                }

                // 新しいnameTagをJSON形式で構築
                const costObj: any = { id: currencyId, amount: price };
                if (texturePath) costObj.texture = texturePath;
                const newNameTagObj: any = { displayName: newDisplayName, cost: costObj };
                itemInHand.nameTag = JSON.stringify(newNameTagObj);

                // Loreを配列に変換
                let finalLore: string[];
                if (newLoreInput === "") {
                    finalLore = [];
                } else {
                    finalLore = newLoreInput.split(/\\n/g).map(line => line.trimEnd());
                }
                itemInHand.setLore(finalLore);
                inventory.setItem(selectedSlot, itemInHand);
                sendMessageToPlayer(player, "§aアイテム情報を更新しました！");
            } catch (error) {
                console.error(`ショップアイテム編集エラー (プレイヤー: ${player.name}): ${error instanceof Error ? error.stack : error}`);
                sendMessageToPlayer(player, "§cアイテム編集中にエラーが発生しました。詳細はコンソールを確認してください。");
            }
        }
    });
}