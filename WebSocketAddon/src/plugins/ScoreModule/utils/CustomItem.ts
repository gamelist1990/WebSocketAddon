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
  system,
} from "@minecraft/server";

export enum EventType {
  ItemUse,
  EntityHit,
  BlockHit,
}

export interface CustomItemEventData {
  itemStack: ItemStack;
  hitResult?: { entity?: Entity; block?: Block };
  eventType: EventType;
}

interface CustomItemOptions {
  name: string;
  lore: string[];
  item: string;
  amount?: number;
  keepOnClose?: boolean;
  rollback?: boolean;
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
  keepOnClose: boolean;
  rollback: boolean;
  placeableOn: string[] | undefined;
  notPlaceableOn: string[] | undefined;
  itemLock: ItemLockMode;
  remove: boolean;
  then(
    callback: (player: Player, eventData: CustomItemEventData) => void
  ): CustomItem;
  get(): ItemStack;
  give(
    player: Player,
    amount?: number,
    itemLock?: ItemLockMode,
    slot?: number
  ): void;
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
  private callback?: (player: Player, eventData: CustomItemEventData) => void;

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

    world.beforeEvents.playerPlaceBlock.subscribe(
      (event: PlayerPlaceBlockBeforeEvent) => {
        this.handleBlockPlacement(event);
      }
    );

    world.afterEvents.entityHitEntity.subscribe(
      (event: EntityHitEntityAfterEvent) => {
        this.handleEntityHit(event);
      }
    );

    world.afterEvents.entityHitBlock.subscribe(
      (event: EntityHitBlockAfterEvent) => {
        this.handleBlockHit(event);
      }
    );
  }

  then(
    callback: (player: Player, eventData: CustomItemEventData) => void
  ): CustomItem {
    this.callback = callback;
    return this;
  }

  get(): ItemStack {
    const itemType = ItemTypes.get(this.item);
    if (!itemType) {
      throw new Error(`Invalid item type: ${this.item}`);
    }
    const itemStack = new ItemStack(itemType, this.amount);
    itemStack.nameTag = this.name;
    itemStack.setLore(this.lore);
    itemStack.lockMode = this.itemLock;
    return itemStack;
  }

  give(
    player: Player,
    amount?: number,
    itemLock?: ItemLockMode,
    slot?: number
  ): void {
    const inventory = player.getComponent(
      "inventory"
    ) as EntityInventoryComponent;
    if (!inventory || !inventory.container) return;

    const giveAmount = amount ?? this.amount;
    const itemStack = this.get();
    itemStack.amount = giveAmount;
    itemStack.lockMode = itemLock ?? this.itemLock;

    if (slot !== undefined) {
      if (slot < 0 || slot >= inventory.container.size) {
        console.warn(
          `Invalid slot number: ${slot}.  Slot must be between 0 and ${
            inventory.container.size - 1
          }.`
        );
        return;
      }

      const existingItem = inventory.container.getItem(slot);
      if (existingItem) {
        inventory.container.addItem(itemStack);
      } else {
        inventory.container.setItem(slot, itemStack);
      }
    } else {
      if (itemStack.maxAmount > 1) {
        let remainingAmount = giveAmount;

        for (let i = 0; i < inventory.container.size; i++) {
          const currentItem = inventory.container.getItem(i);
          if (
            currentItem &&
            currentItem.typeId === itemStack.typeId &&
            currentItem.nameTag === itemStack.nameTag &&
            currentItem.amount < currentItem.maxAmount
          ) {
            const addAmount = Math.min(
              remainingAmount,
              currentItem.maxAmount - currentItem.amount
            );
            currentItem.amount += addAmount;
            currentItem.lockMode = itemLock ?? this.itemLock;
            inventory.container.setItem(i, currentItem);
            remainingAmount -= addAmount;
            if (remainingAmount <= 0) break;
          }
        }
        if (remainingAmount > 0) {
          while (remainingAmount > 0) {
            const itemToAdd = itemStack.clone();
            itemToAdd.amount = Math.min(remainingAmount, itemToAdd.maxAmount);
            inventory.container.addItem(itemToAdd);
            remainingAmount -= itemToAdd.amount;
          }
        }
      } else {
        for (let i = 0; i < giveAmount; i++) {
          inventory.container.addItem(itemStack.clone());
        }
      }
    }
  }

  private handleItemUse(event: ItemUseBeforeEvent): void {
    const player = event.source as Player;
    const usedItemStack = event.itemStack;

    if (
      usedItemStack.typeId === this.item &&
      usedItemStack.nameTag === this.name &&
      this.compareLore(usedItemStack.getLore(), this.lore)
    ) {
      event.cancel = true;

      if (this.callback) {
        const eventData: CustomItemEventData = {
          itemStack: usedItemStack,
          eventType: EventType.ItemUse,
        };
        this.callback(player, eventData);

        if (this.remove) {
          this.removeItem(player, usedItemStack);
        }
      }
      
    }
  }
  private handleEntityHit(event: EntityHitEntityAfterEvent): void {
    const player = event.damagingEntity as Player;
    if (!player) return;

    const inventory = player.getComponent(
      "inventory"
    ) as EntityInventoryComponent;
    if (!inventory || !inventory.container) return;

    const heldItemStack = inventory.container.getItem(player.selectedSlotIndex);
    if (!heldItemStack) return;

    if (
      heldItemStack.typeId === this.item &&
      heldItemStack.nameTag === this.name &&
      this.compareLore(heldItemStack.getLore(), this.lore)
    ) {
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
  }

  private handleBlockHit(event: EntityHitBlockAfterEvent): void {
    const player = event.damagingEntity as Player;
    if (!player) return;

    const inventory = player.getComponent(
      "inventory"
    ) as EntityInventoryComponent;
    if (!inventory || !inventory.container) return;

    const heldItemStack = inventory.container.getItem(player.selectedSlotIndex);
    if (!heldItemStack) return;
    if (
      heldItemStack.typeId === this.item &&
      heldItemStack.nameTag === this.name &&
      this.compareLore(heldItemStack.getLore(), this.lore)
    ) {
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
  }

  private handleBlockPlacement(event: PlayerPlaceBlockBeforeEvent): void {
    const player = event.player;
    const block = event.block;
    const itemStack = player
      .getComponent("inventory")
      ?.container?.getItem(player.selectedSlotIndex);

    if (!itemStack) return;

    if (
      itemStack.typeId === this.item &&
      itemStack.nameTag === this.name &&
      this.compareLore(itemStack.getLore(), this.lore)
    ) {
      if (this.placeableOn && !this.placeableOn.includes(block.typeId)) {
        event.cancel = true;
        player.sendMessage("そこには配置できません。(placeableOn)");
      }
      if (this.notPlaceableOn && !this.notPlaceableOn.includes(block.typeId)) {
        event.cancel = true;
        player.sendMessage("そこには配置できません。(notPlaceableOn)");
      }
    }
  }
  public removeItem(player: Player, usedItemStack: ItemStack): void {
    const inventory = player.getComponent(
      "inventory"
    ) as EntityInventoryComponent;
    if (!inventory || !inventory.container) return;

    for (let i = 0; i < inventory.container.size; i++) {
      const currentItem = inventory.container.getItem(i);

      if (
        currentItem &&
        currentItem.typeId === usedItemStack.typeId &&
        currentItem.nameTag === usedItemStack.nameTag
      ) {
        system.run(()=>{
          if (inventory.container) {
            if (currentItem.amount <= 1) {
              inventory.container.setItem(i, undefined);
            } else {
              currentItem.amount -= 1;
              inventory.container.setItem(i, currentItem);
            }
          }
        })
        return;
      }
    }
  }

  private compareLore(lore1: string[], lore2: string[]): boolean {
    if (lore1.length !== lore2.length) return false;
    for (let i = 0; i < lore1.length; i++) {
      if (lore1[i] !== lore2[i]) return false;
    }
    return true;
  }
}

const CustomItem: new (options: CustomItemOptions) => CustomItem =
  CustomItemImpl;
export { CustomItem };
