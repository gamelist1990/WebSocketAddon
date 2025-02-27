import {
    ItemLockMode,
    Player,
    system,
    world,
    BlockInventoryComponent,
    ItemStack,
    Vector3,
    EnchantmentTypes,
} from "@minecraft/server";
import { Handler } from "../../../module/Handler";

interface ItemData {
    id: string;
    amount?: number;
    data?: number; // data は potion の effect ID として使う
    name?: string;
    lore?: string[];
    lockMode?: ItemLockMode;
    keepOnDeath?: boolean;
    enchantments?: { type: string; level?: number }[];
    probability?: number;
}

interface ChestFillData {
    locations: { x: number; y: number; z: number }[];
    items: ItemData[];
    randomSlot?: boolean;
    loop?: number;
    name?: string;
}

const chestFillProfiles: { [key: string]: ChestFillData } = {};

const defaultPresets: { [key: string]: ChestFillData } = {
    skywars_basic: {
        locations: [],
        items: [
            { id: "minecraft:stone_sword", amount: 1, probability: 100 },
            { id: "minecraft:iron_sword", amount: 1, probability: 30 },
            { id: "minecraft:leather_helmet", amount: 1, probability: 70 },
            { id: "minecraft:iron_helmet", amount: 1, probability: 20 },
            { id: "minecraft:leather_chestplate", amount: 1, probability: 80 },
            { id: "minecraft:iron_chestplate", amount: 1, probability: 25 },
            { id: "minecraft:leather_leggings", amount: 1, probability: 70 },
            { id: "minecraft:iron_leggings", amount: 1, probability: 20 },
            { id: "minecraft:leather_boots", amount: 1, probability: 70 },
            { id: "minecraft:iron_boots", amount: 1, probability: 20 },
            { id: "minecraft:apple", amount: 5, probability: 90 },
            { id: "minecraft:golden_apple", amount: 1, probability: 40 },
            { id: "minecraft:cobblestone", amount: 16, probability: 100 },
            { id: "minecraft:oak_planks", amount: 16, probability: 80 },
            { id: "minecraft:stone", amount: 16, probability: 60 },
            { id: "minecraft:sandstone", amount: 16, probability: 50 },
            { id: "minecraft:obsidian", amount: 4, probability: 15 },
            { id: "minecraft:bow", amount: 1, probability: 60 },
            { id: "minecraft:arrow", amount: 8, probability: 70 },
            { id: "minecraft:snowball", amount: 8, probability: 50 },
            { id: "minecraft:egg", amount: 4, probability: 40 },
            { id: "minecraft:ender_pearl", amount: 1, probability: 20 },
            { id: "minecraft:potion", amount: 1, probability: 30, data: 16 }, //spped *
            { id: "minecraft:splash_potion", amount: 1, probability: 25, data: 22 }, //Health
            { id: "minecraft:shield", amount: 1, probability: 40 },
            { id: "minecraft:stone_pickaxe", amount: 1, probability: 70 },
            { id: "minecraft:iron_pickaxe", amount: 1, probability: 25 },
            { id: "minecraft:stone_axe", amount: 1, probability: 60 },
            { id: "minecraft:iron_axe", amount: 1, probability: 15 },
            { id: "minecraft:water_bucket", amount: 1, probability: 30 },
            { id: "minecraft:lava_bucket", amount: 1, probability: 10 },
            { id: "minecraft:flint_and_steel", amount: 1, probability: 35 },
            { id: "minecraft:fishing_rod", amount: 1, probability: 40 },
        ],
        loop: 1,
        randomSlot: true,
        name: "SkyWars Basic",
    },
    skywars_iron: {
        locations: [],
        items: [
            { id: "minecraft:iron_sword", amount: 1, probability: 70 },
            { id: "minecraft:iron_helmet", amount: 1, probability: 50 },
            { id: "minecraft:iron_chestplate", amount: 1, probability: 60 },
            { id: "minecraft:iron_leggings", amount: 1, probability: 50 },
            { id: "minecraft:iron_boots", amount: 1, probability: 50 },
            { id: "minecraft:golden_apple", amount: 3, probability: 80 },
            { id: "minecraft:oak_log", amount: 32, probability: 90 },
            { id: "minecraft:bow", amount: 1, probability: 80 },
            { id: "minecraft:arrow", amount: 16, probability: 80 },
            { id: "minecraft:ender_pearl", amount: 2, probability: 40 },
            { id: "minecraft:splash_potion", amount: 2, probability: 40, data: 29 }, //再生
            { id: "minecraft:diamond_pickaxe", amount: 1, probability: 10 },
        ],
        loop: 1,
        randomSlot: true,
        name: "SkyWars Iron",
    },
    skywars_diamond: {
        locations: [],
        items: [
            {
                id: "minecraft:diamond_sword",
                amount: 1,
                probability: 20,
                enchantments: [{ type: "sharpness", level: 2 }],
            },
            {
                id: "minecraft:diamond_helmet",
                amount: 1,
                probability: 15,
                enchantments: [{ type: "protection", level: 1 }],
            },
            {
                id: "minecraft:diamond_chestplate",
                amount: 1,
                probability: 20,
                enchantments: [{ type: "protection", level: 1 }],
            },
            {
                id: "minecraft:diamond_leggings",
                amount: 1,
                probability: 15,
                enchantments: [{ type: "protection", level: 1 }],
            },
            {
                id: "minecraft:diamond_boots",
                amount: 1,
                probability: 15,
                enchantments: [{ type: "protection", level: 1 }],
            },
            { id: "minecraft:enchanted_golden_apple", amount: 2, probability: 60 },
            { id: "minecraft:obsidian", amount: 16, probability: 70 },
            {
                id: "minecraft:bow",
                amount: 1,
                probability: 80,
                enchantments: [{ type: "power", level: 2 }],
            },
            { id: "minecraft:arrow", amount: 32, probability: 80 },
            { id: "minecraft:ender_pearl", amount: 4, probability: 60 },
            { id: "minecraft:diamond_pickaxe", amount: 1, probability: 30 },
        ],
        loop: 5,
        randomSlot: true,
        name: "SkyWars Diamond",
    },
};

export function registerChestFillCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("chestFill", {
        moduleName: moduleName,
        description:
            "指定された座標のコンテナブロックにアイテムを格納/プロファイルのロード,保存/プリセットの使用",
        usage:
            "chestFill run <JSON> | chestFill load <name> <x,y,z> | chestFill save <name> <JSON> | chestFill preset <preset_name> <x,y,z>",
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

            const subCommandMatch = message.match(/^(\w+)/);
            if (!subCommandMatch) {
                sendMessage("無効なコマンド形式です。");
                return;
            }
            const subCommand = subCommandMatch[1].toLowerCase();

            switch (subCommand) {
                case "run": {
                    const matchResult = message.match(/\{.*\}/);
                    if (!matchResult) {
                        sendMessage("JSONオブジェクトが見つかりませんでした。");
                        return;
                    }
                    const chestFillDataStr = matchResult[0];

                    try {
                        const chestFillData: ChestFillData = JSON.parse(chestFillDataStr);
                        if (!chestFillData.locations || !chestFillData.items) {
                            sendMessage('JSONは "locations" と "items" 配列を含む必要があります。');
                            return;
                        }
                        fillChests(event, chestFillData);
                    } catch (error) {
                        consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                        sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                    }
                    break;
                }
                case "load": {
                    const matchResult = message.match(/^load\s+(\w+)\s+([-\d\.,\s]+)$/);
                    if (!matchResult) {
                        sendMessage(
                            "load コマンドの使用法が間違っています: chestFill load <name> <x,y,z>"
                        );
                        return;
                    }

                    const profileName = matchResult[1];
                    const coordsStr = matchResult[2];
                    const coords = coordsStr.split(/[, ]+/).map(Number);

                    if (coords.length !== 3 || coords.some(isNaN)) {
                        sendMessage("座標は x,y,z の形式で数値で指定してください。");
                        return;
                    }
                    if (!chestFillProfiles[profileName] && !defaultPresets[profileName]) {
                        sendMessage(`プロファイル "${profileName}" は存在しません。`);
                        return;
                    }

                    const profile = chestFillProfiles[profileName] || defaultPresets[profileName];
                    loadProfileToChest(event, profile, { x: coords[0], y: coords[1], z: coords[2] });
                    break;
                }
                case "save": {
                    const matchResult = message.match(/^save\s+(\w+)\s+(\{.*\})$/);
                    if (!matchResult) {
                        sendMessage(
                            "save コマンドの使用法が間違っています: chestFill save <name> <JSON>"
                        );
                        return;
                    }
                    const profileName = matchResult[1];
                    const jsonStr = matchResult[2];
                    try {
                        const chestFillData: ChestFillData = JSON.parse(jsonStr);
                        if (!chestFillData.locations) {
                            chestFillData.locations = [];
                        }
                        chestFillProfiles[profileName] = chestFillData;
                        sendMessage(`プロファイル "${profileName}" を保存しました。`);
                    } catch (error) {
                        consoleOutput(`JSON解析エラー: ${error}`);
                        sendMessage(`JSON解析エラー: ${error}`);
                    }
                    break;
                }
                case "preset": {
                    const matchResult = message.match(/^preset\s+(\w+)\s+([-\d\.,\s]+)$/);
                    if (!matchResult) {
                        sendMessage(
                            "preset コマンドの使用法が間違っています: chestFill preset <preset_name> <x,y,z>"
                        );
                        return;
                    }

                    const presetName = matchResult[1];
                    const coordsStr = matchResult[2];
                    const coords = coordsStr.split(/[, ]+/).map(Number);

                    if (coords.length !== 3 || coords.some(isNaN)) {
                        sendMessage("座標は x,y,z の形式で数値で指定してください。");
                        return;
                    }

                    if (!defaultPresets[presetName]) {
                        sendMessage(`プリセット "${presetName}" は存在しません。`);
                        return;
                    }

                    const preset = defaultPresets[presetName];
                    loadProfileToChest(event, preset, { x: coords[0], y: coords[1], z: coords[2] });
                    break;
                }
                default:
                    sendMessage(
                        "無効なサブコマンドです。使用可能なサブコマンド: run, load, save, preset"
                    );
            }
        },
    });

    function fillChests(event: any, chestFillData: ChestFillData) {
        const consoleOutput = (msg: string) => console.warn(msg);
        const sendMessage = (msg: string) => {
            if (event.sourceEntity instanceof Player) {
                const player = event.sourceEntity;
                system.run(() => player.sendMessage(msg));
            } else {
                consoleOutput(msg);
            }
        };
        if (!chestFillData.locations || !chestFillData.items) {
            sendMessage('JSONは "locations" と "items" 配列を含む必要があります。');
            return;
        }
        if (!Array.isArray(chestFillData.locations) || !Array.isArray(chestFillData.items)) {
            sendMessage('"locations" と "items" は配列である必要があります。');
            return;
        }
        if (chestFillData.locations.length === 0) {
            sendMessage('"locations" は空にできません。');
            return;
        }
        const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");
        const randomSlot = chestFillData.randomSlot ?? false;
        const loopCount = chestFillData.loop ?? 1;

        for (let loop = 0; loop < loopCount; loop++) {
            for (const loc of chestFillData.locations) {
                applyItemsToChest(dimension, loc, chestFillData.items, randomSlot, consoleOutput, sendMessage);
            }
        }
    }

    function loadProfileToChest(
        event: any,
        profile: ChestFillData,
        loc: { x: number; y: number; z: number }
    ) {
        const consoleOutput = (msg: string) => console.warn(msg);
        const sendMessage = (msg: string) => {
            if (event.sourceEntity instanceof Player) {
                const player = event.sourceEntity;
                system.run(() => player.sendMessage(msg));
            } else {
                consoleOutput(msg);
            }
        };
        const dimension = event.sourceEntity?.dimension ?? world.getDimension("overworld");
        const randomSlot = profile.randomSlot ?? false;
        const loopCount = profile.loop ?? 1;

        for (let loop = 0; loop < loopCount; loop++) {
            applyItemsToChest(dimension, loc, profile.items, randomSlot, consoleOutput, sendMessage);
        }
    }

    function applyItemsToChest(
        dimension: any,
        loc: { x: number; y: number; z: number },
        items: ItemData[],
        randomSlot: boolean,
        consoleOutput: (msg: string) => void,
        sendMessage: (msg: string) => void
    ) {
        if (
            typeof loc.x !== "number" ||
            typeof loc.y !== "number" ||
            typeof loc.z !== "number"
        ) {
            sendMessage("座標は数値で指定してください。");
            return;
        }
        const blockLoc: Vector3 = { x: loc.x, y: loc.y, z: loc.z };
        const block = dimension.getBlock(blockLoc);
        if (!block) {
            consoleOutput(`座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} にブロックが見つかりません。`);
            return;
        }
        const inventoryComponent = block.getComponent("inventory") as BlockInventoryComponent;
        if (!inventoryComponent) {
            consoleOutput(
                `座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} のブロックはインベントリを持ちません。`
            );
            return;
        }
        const container = inventoryComponent.container;
        if (!container) {
            consoleOutput(`座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} のコンテナが取得できません。`);
            return;
        }

        for (const itemData of items) {
            if (itemData.probability !== undefined && Math.random() * 100 > itemData.probability) {
                continue;
            }
            try {
                if (itemData.id === "minecraft:potion" || itemData.id === "minecraft:splash_potion") {
                    if (itemData.data === undefined) {
                        consoleOutput(`ポーション ${itemData.id} には data 値が必要です。`);
                        continue;
                    }
                    if (typeof itemData.data !== 'number') {
                        consoleOutput(`ポーション ${itemData.id} の data 値は数値である必要があります。`);
                        continue;
                    }

                    if (randomSlot) {
                        let slot = Math.floor(Math.random() * container.size);
                        let maxAttempts = container.size;
                        let attempts = 0;

                        while (container.getItem(slot) !== undefined && attempts < maxAttempts) {
                            slot = Math.floor(Math.random() * container.size);
                            attempts++;
                        }

                        if (attempts < maxAttempts) {
                            dimension.runCommandAsync(
                                `replaceitem block ${loc.x} ${loc.y} ${loc.z} slot.container ${slot} ${itemData.id} ${itemData.amount ?? 1} ${itemData.data}`
                            );
                        } else {
                            consoleOutput(`座標 ${loc.x}, ${loc.y}, ${loc.z} のコンテナに空きスロットが見つかりませんでした。`);
                        }

                    } else {
                        let added = false;
                        for (let i = 0; i < container.size; i++) {
                            if (container.getItem(i) === undefined) {
                                dimension.runCommandAsync(
                                    `replaceitem block ${loc.x} ${loc.y} ${loc.z} slot.container ${i} ${itemData.id} ${itemData.amount ?? 1} ${itemData.data}`
                                );
                                added = true;
                                break;
                            }
                        }
                        if (!added) {
                            consoleOutput(
                                `座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} のコンテナに空きスロットが見つかりませんでした。`
                            );
                        }
                    }

                } else {
                    const itemStack = new ItemStack(itemData.id, itemData.amount ?? 1);

                    if (itemData.name) {
                        itemStack.nameTag = itemData.name;
                    }
                    if (itemData.lore) {
                        itemStack.setLore(itemData.lore);
                    }
                    if (itemData.lockMode) {
                        itemStack.lockMode = itemData.lockMode;
                    }
                    if (itemData.keepOnDeath) {
                        itemStack.keepOnDeath = itemData.keepOnDeath;
                    }
                    if (itemData.enchantments) {
                        const enchantable = itemStack.getComponent("enchantable");
                        if (enchantable) {
                            for (const enchantData of itemData.enchantments) {
                                try {
                                    const enchType = EnchantmentTypes.get(enchantData.type);
                                    if (!enchType) {
                                        throw new Error(`Invalid enchantment type: ${enchantData.type}`);
                                    }
                                    enchantable.addEnchantment({
                                        type: enchType,
                                        level: enchantData.level ?? 1,
                                    });
                                } catch (enchError) {
                                    consoleOutput(`エンチャント追加エラー: ${enchError}`);
                                }
                            }
                        }
                    }

                    if (randomSlot) {
                        let slot = Math.floor(Math.random() * container.size);
                        let maxAttempts = container.size;
                        let attempts = 0;
                        while (container.getItem(slot) !== undefined && attempts < maxAttempts) {
                            slot = Math.floor(Math.random() * container.size);
                            attempts++;
                        }
                        if (attempts < maxAttempts) {
                            system.run(() => container.setItem(slot, itemStack));
                        } else {
                            consoleOutput(
                                `座標 ${loc.x}, ${loc.y}, ${loc.z} のコンテナに空きスロットが見つかりませんでした。`
                            );
                        }
                    } else {
                        let added = false;
                        for (let i = 0; i < container.size; i++) {
                            if (container.getItem(i) === undefined) {
                                system.run(() => container.setItem(i, itemStack));
                                added = true;
                                break;
                            }
                        }
                        if (!added) {
                            consoleOutput(
                                `座標 ${blockLoc.x}, ${blockLoc.y}, ${blockLoc.z} のコンテナに空きスロットが見つかりませんでした。`
                            );
                        }
                    }
                }
            } catch (itemError) {
                consoleOutput(`アイテム処理エラー: ${itemError}`);
                sendMessage(`アイテム処理エラー: ${itemError}`);
            }
        }
    }
}