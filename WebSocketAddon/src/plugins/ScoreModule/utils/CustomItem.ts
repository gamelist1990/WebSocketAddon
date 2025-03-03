import {
    Player,
    ItemStack,
    ItemTypes,
    EntityInventoryComponent,
    world,
    ItemUseBeforeEvent,
    PlayerPlaceBlockBeforeEvent,
    ItemLockMode,
    Entity,
    Block,
    EntityHitEntityAfterEvent,
    EntityHitBlockAfterEvent,
} from '@minecraft/server';

// Enum for event types
export enum EventType {
    ItemUse,
    EntityHit,
    BlockHit,
}

// Interface for the event data passed to the callback
interface CustomItemEventData {
    itemStack: ItemStack;
    hitResult?: { entity?: Entity; block?: Block };
    eventType: EventType;
}

interface CustomItemOptions {
    name: string;
    lore: string[];
    item: string;
    amount?: number;
    keepOnClose?: boolean; //Deprecated
    rollback?: boolean; //Deprecated
    placeableOn?: string[];
    notPlaceableOn?: string[];
    itemLock?: ItemLockMode;
    remove?: boolean;
}

interface CustomItem {
    name: string;
    lore: string[];
    item: string;
    amount: number;
    keepOnClose: boolean; //Deprecated
    rollback: boolean;     //Deprecated
    placeableOn: string[] | undefined;
    notPlaceableOn: string[] | undefined;
    itemLock: ItemLockMode;
    remove: boolean;
    then(callback: (player: Player, eventData: CustomItemEventData) => void): CustomItem; // Updated callback signature
    get(): ItemStack;
    give(player: Player, amount?: number): void;
    removeItem(player: Player, itemStack: ItemStack): void;
}

class CustomItemImpl implements CustomItem {
    public name: string;
    public lore: string[];
    public item: string;
    public amount: number;
    public keepOnClose: boolean;
    public rollback: boolean;
    public placeableOn: string[] | undefined;
    public notPlaceableOn: string[] | undefined;
    public itemLock: ItemLockMode;
    public remove: boolean;
    private callback?: (player: Player, eventData: CustomItemEventData) => void; // Updated callback type

    constructor(options: CustomItemOptions) {
        this.name = options.name;
        this.lore = options.lore;
        this.item = options.item;
        this.amount = options.amount ?? 1;
        this.keepOnClose = options.keepOnClose ?? false;
        this.rollback = options.rollback ?? false;
        this.placeableOn = options.placeableOn;
        this.notPlaceableOn = options.notPlaceableOn;
        this.itemLock = options.itemLock ?? ItemLockMode.none;
        this.remove = options.remove ?? false;

        world.beforeEvents.itemUse.subscribe((event: ItemUseBeforeEvent) => {
            this.handleItemUse(event);
        });

        world.beforeEvents.playerPlaceBlock.subscribe((event: PlayerPlaceBlockBeforeEvent) => {
            this.handleBlockPlacement(event);
        });

        world.afterEvents.entityHitEntity.subscribe((event: EntityHitEntityAfterEvent) => {
            this.handleEntityHit(event);
        });

        world.afterEvents.entityHitBlock.subscribe((event: EntityHitBlockAfterEvent) => {
            this.handleBlockHit(event);
        });
    }

    then(callback: (player: Player, eventData: CustomItemEventData) => void): CustomItem {
        this.callback = callback;
        return this;
    }

    get(): ItemStack {
        // ... (get method remains the same) ...
        const itemType = ItemTypes.get(this.item);
        if (!itemType) {
            throw new Error(`Invalid item type: ${this.item}`);
        }
        const itemStack = new ItemStack(itemType, this.amount);
        itemStack.nameTag = this.name;
        itemStack.setLore(this.lore);
        itemStack.lockMode = (this.itemLock);
        return itemStack;
    }

    give(player: Player, amount?: number): void {
        // ... (give method remains the same) ...
        const inventory = player.getComponent('inventory') as EntityInventoryComponent;
        if (inventory) {
            const giveAmount = amount ?? this.amount;
            const itemStack = this.get();
            itemStack.amount = giveAmount;

            if (itemStack.maxAmount > 1) {
                let remainingAmount = giveAmount;
                if (!inventory?.container) return;
                for (let i = 0; i < inventory.container.size; i++) {
                    const currentItem = inventory?.container?.getItem(i);
                    if (currentItem && currentItem.typeId === itemStack.typeId && currentItem.nameTag === itemStack.nameTag && currentItem.amount < currentItem.maxAmount) {
                        const addAmount = Math.min(remainingAmount, currentItem.maxAmount - currentItem.amount);
                        currentItem.amount += addAmount;
                        inventory?.container?.setItem(i, currentItem);
                        remainingAmount -= addAmount;
                        if (remainingAmount <= 0) break;
                    }
                }
                if (remainingAmount > 0) {
                    while (remainingAmount > 0) {
                        const itemToAdd = itemStack.clone();
                        itemToAdd.amount = Math.min(remainingAmount, itemToAdd.maxAmount);
                        inventory?.container?.addItem(itemToAdd);
                        remainingAmount -= itemToAdd.amount;
                    }
                }
            } else {
                for (let i = 0; i < giveAmount; i++) {
                    inventory?.container?.addItem(itemStack.clone());
                }
            }
        }
    }

    private handleItemUse(event: ItemUseBeforeEvent): void {
        const player = event.source as Player;
        const usedItemStack = event.itemStack;

        if (usedItemStack.typeId === this.item && usedItemStack.nameTag === this.name) {
            event.cancel = true;

            if (this.callback) {
                const eventData: CustomItemEventData = {
                    itemStack: usedItemStack,
                    eventType: EventType.ItemUse, // No hit, so it's a simple ItemUse
                };
                this.callback(player, eventData);
            }
        }
    }
    private handleEntityHit(event: EntityHitEntityAfterEvent): void {
        const player = event.damagingEntity as Player;
        if (!player) return;

        const inventory = player.getComponent('inventory') as EntityInventoryComponent;
        if (!inventory || !inventory.container) return;

        const heldItemStack = inventory.container.getItem(player.selectedSlotIndex);
        if (!heldItemStack || heldItemStack.typeId !== this.item || heldItemStack.nameTag !== this.name) return;


        if (this.callback) {
            const eventData: CustomItemEventData = {
                itemStack: heldItemStack,
                hitResult: { entity: event.hitEntity },
                eventType: EventType.EntityHit,
            };
            this.callback(player, eventData);

            if (this.remove) {
                this.removeItem(player, heldItemStack);
            }
        }

    }

    private handleBlockHit(event: EntityHitBlockAfterEvent): void {
        const player = event.damagingEntity as Player;
        if (!player) return;

        const inventory = player.getComponent('inventory') as EntityInventoryComponent;
        if (!inventory || !inventory.container) return;

        const heldItemStack = inventory.container.getItem(player.selectedSlotIndex);
        if (!heldItemStack || heldItemStack.typeId !== this.item || heldItemStack.nameTag !== this.name) return;

        if (this.callback) {
            const eventData: CustomItemEventData = {
                itemStack: heldItemStack,
                hitResult: { block: event.hitBlock },
                eventType: EventType.BlockHit,
            };
            this.callback(player, eventData);

            if (this.remove) {
                this.removeItem(player, heldItemStack);
            }
        }
    }

    private handleBlockPlacement(event: PlayerPlaceBlockBeforeEvent): void {
        // ... (handleBlockPlacement method remains the same) ...
        const player = event.player;
        const block = event.block;
        const itemStack = player.getComponent('inventory')?.container?.getItem(player.selectedSlotIndex);

        if (!itemStack || itemStack.typeId !== this.item || itemStack.nameTag !== this.name) return;

        if (this.placeableOn && !this.placeableOn.includes(block.typeId)) {
            event.cancel = true;
            player.sendMessage("そこには配置できません。(placeableOn)");
        }
        if (this.notPlaceableOn && !this.notPlaceableOn.includes(block.typeId)) {
            event.cancel = true;
            player.sendMessage("そこには配置できません。(notPlaceableOn)");
        }
    }
    public removeItem(player: Player, usedItemStack: ItemStack): void {
        // ... (removeItem method remains the same) ...
        const inventory = player.getComponent("inventory") as EntityInventoryComponent;
        if (!inventory || !inventory.container) return;

        for (let i = 0; i < inventory.container.size; i++) {
            const currentItem = inventory.container.getItem(i);

            if (currentItem && currentItem.typeId === usedItemStack.typeId && currentItem.nameTag === usedItemStack.nameTag) {
                if (currentItem.amount <= 1) {
                    inventory.container.setItem(i, undefined);
                } else {
                    currentItem.amount -= 1;
                    inventory.container.setItem(i, currentItem);
                }
                return;
            }
        }
    }
}

const CustomItem: new (options: CustomItemOptions) => CustomItem = CustomItemImpl;
export { CustomItem };