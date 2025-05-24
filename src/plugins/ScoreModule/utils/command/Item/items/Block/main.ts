// timeLimitedBlockManager.ts (新しいファイル)

import {
    Player,
    system,
    BlockPermutation,
    world,
    PlayerBreakBlockBeforeEvent,
    Block,
    Dimension,
    Vector3,
    // PlayerPlaceBlockAfterEvent, // これはCustomItem側で処理される
} from "@minecraft/server";
import { CustomItem, EventType, CustomItemEventData } from "../../../../CustomItem"; // パス調整
import { registerCustomItem } from "../../custom"; // パス調整

interface TimeLimitedBlockConfig {
    itemId: string; // この時間制限ブロックの元となるアイテムID (例: "minecraft:white_wool")
    displayName: string; // インベントリでの表示名
    lore: string[]; // 説明文
    lifetimeSeconds: number; // 消滅までの秒数
    particleName?: string; // 消滅時のパーティクル名 (オプション)
    soundId?: string; // 消滅時のサウンドID (オプション)
    customItemId: number; // CustomItem登録用のユニークID
    consumeItem?: boolean; // 設置時にアイテムを消費するか (CustomItemのremoveに相当)
}

class TimeLimitedBlockManager {
    private activeBlockTimers = new Map<string, number>();
    private playerBreakBlockSubscription: ((event: PlayerBreakBlockBeforeEvent) => void) | undefined = undefined;
    private static instance: TimeLimitedBlockManager;

    private constructor() {
        // private constructor for singleton
    }

    public static getInstance(): TimeLimitedBlockManager {
        if (!TimeLimitedBlockManager.instance) {
            TimeLimitedBlockManager.instance = new TimeLimitedBlockManager();
        }
        return TimeLimitedBlockManager.instance;
    }

    private getLocationKey(dimension: Dimension, location: Vector3): string {
        return `${dimension.id}:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
    }

    private handlePlayerBreakBlock = (event: PlayerBreakBlockBeforeEvent): void => {
        const { block, dimension } = event;
        const locationKey = this.getLocationKey(dimension, block.location);

        if (this.activeBlockTimers.has(locationKey)) {
            system.clearRun(this.activeBlockTimers.get(locationKey)!);
            this.activeBlockTimers.delete(locationKey);
            // console.log(`[TimeLimitedBlockManager] Timer cancelled for block at ${locationKey} (destroyed).`);

            if (this.activeBlockTimers.size === 0 && this.playerBreakBlockSubscription) {
                world.beforeEvents.playerBreakBlock.unsubscribe(this.handlePlayerBreakBlock);
                this.playerBreakBlockSubscription = undefined;
                // console.log("[TimeLimitedBlockManager] Unsubscribed from playerBreakBlock event.");
            }
        }
    };

    public registerTimeLimitedBlock(config: TimeLimitedBlockConfig): void {
        const customItem = new CustomItem({
            name: config.displayName,
            lore: config.lore,
            item: config.itemId,
            remove: config.consumeItem !== undefined ? config.consumeItem : true,
        }).then((_player: Player, eventData: CustomItemEventData) => {
            if (eventData.eventType !== EventType.BlockPlace || !eventData.placedBlock) {
                return;
            }
            this.onBlockPlaced(eventData.placedBlock, config);
        });

        registerCustomItem(config.customItemId, customItem);
        // console.log(`[TimeLimitedBlockManager] Registered ${config.displayName} (ID: ${config.customItemId})`);
    }

    private onBlockPlaced(placedBlock: Block, config: TimeLimitedBlockConfig): void {
        const dimension = placedBlock.dimension;
        const location = placedBlock.location;
        const locationKey = this.getLocationKey(dimension, location);

        if (this.activeBlockTimers.has(locationKey)) {
            system.clearRun(this.activeBlockTimers.get(locationKey)!);
            // console.log(`[TimeLimitedBlockManager] Replaced timer for block at ${locationKey}`);
        }

        const timerId = system.runTimeout(() => {
            try {
                const currentBlock = dimension.getBlock(location);
                // 設置されたブロックのタイプIDと、設定のアイテムIDから期待されるブロックタイプが一致するか確認
                // (例: "minecraft:white_wool"アイテムを置いたら、"minecraft:white_wool"ブロックになるはず)
                if (currentBlock && currentBlock.typeId === config.itemId) {
                    currentBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));

                    const particleName = config.particleName ?? "minecraft:basic_smoke_particle";
                    const particleCount = 8;
                    const particleCenterLocation = {
                        x: location.x + 0.5,
                        y: location.y + 0.5,
                        z: location.z + 0.5
                    };

                    for (let i = 0; i < particleCount; i++) {
                        const offsetX = (Math.random() - 0.5) * 0.7;
                        const offsetY = (Math.random() - 0.5) * 0.7;
                        const offsetZ = (Math.random() - 0.5) * 0.7;
                        dimension.spawnParticle(particleName, {
                            x: particleCenterLocation.x + offsetX,
                            y: particleCenterLocation.y + offsetY,
                            z: particleCenterLocation.z + offsetZ
                        });
                    }

                    const soundId = config.soundId ?? "dig.stone";
                    dimension.playSound(soundId, location, { volume: 20, pitch: 1.0 }); // 音量は調整
                }
            } catch (e) {
                console.warn(`[TimeLimitedBlockManager] Error during block removal for ${config.displayName}: ${e}`);
            } finally {
                this.activeBlockTimers.delete(locationKey);
                // console.log(`[TimeLimitedBlockManager] Timer expired for ${config.displayName} at ${locationKey}. Active: ${this.activeBlockTimers.size}`);
                if (this.activeBlockTimers.size === 0 && this.playerBreakBlockSubscription) {
                    system.run(() => {
                        world.beforeEvents.playerBreakBlock.unsubscribe(this.handlePlayerBreakBlock);
                        this.playerBreakBlockSubscription = undefined;
                    })
                    // console.log("[TimeLimitedBlockManager] Unsubscribed from playerBreakBlock event (no active timers).");
                }
            }
        }, config.lifetimeSeconds * 20);

        this.activeBlockTimers.set(locationKey, timerId);

        if (this.activeBlockTimers.size === 1 && !this.playerBreakBlockSubscription) {

            system.run(() => {
                world.beforeEvents.playerBreakBlock.subscribe(this.handlePlayerBreakBlock);
                this.playerBreakBlockSubscription = this.handlePlayerBreakBlock;
            })
            // console.log("[TimeLimitedBlockManager] Subscribed to playerBreakBlock event.");
        }
    }
}

// --- ユーティリティ関数 (任意、メインファイルに記述しても良い) ---
export function initializeTimeLimitedBlocks(): void {
    const manager = TimeLimitedBlockManager.getInstance();
    manager.registerTimeLimitedBlock({
        customItemId: 29, // CustomItem用のユニークID (以前の29から変更)
        itemId: "minecraft:white_wool",
        displayName: "§f時間制限付き羊毛",
        lore: [
            `§7設置後、約§e10秒§7で自然消滅します。`,
            "§c注意: リログ等でタイマーがリセットされることがあります。"
        ],
        lifetimeSeconds: 10,
        soundId: "dig.cloth"
    });

    // 2. 丸石の時間制限ブロック
    manager.registerTimeLimitedBlock({
        customItemId: 30,
        itemId: "minecraft:cobblestone",
        displayName: "§7時間制限付き丸石",
        lore: [
            `§7設置後、約§e5秒§7で自然消滅します。`,
            "§c短い時間だけ使える足場です。"
        ],
        lifetimeSeconds: 5,
        particleName: "minecraft:magic_critical_hit_emitter",
        soundId: "dig.stone",
    });
}

initializeTimeLimitedBlocks();