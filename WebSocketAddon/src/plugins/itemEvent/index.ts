import {
    world,
    Player,
    system,
    ItemStack,
    ItemUseAfterEvent,
    ItemUseBeforeEvent,
    PlayerInteractWithBlockBeforeEvent,
    PlayerInteractWithEntityBeforeEvent
} from '@minecraft/server';
import { Module, moduleManager } from '../../module/module';

class ItemEventModule implements Module {
    name = 'Item_Event';
    enabledByDefault = true;

    docs = `アイテム使用(特にブロックへの使用完了)を検出し、タグを付与。\n
**機能**\n
§r- 'itemUse', 'itemUseOn'イベントを使用。\n
§r- 使用アイテムIDのタグを付与:\n
  §r  - §9w:item_use_<item_id>§r: 単純使用\n
  §r  - §9w:item_useOn_<item_id>§r: ブロックに使用&完了\n
§r- キャンセル用タグ:\n
  §r  - §9w:item_use_cancel§r: 単純使用をキャンセル\n
  §r  - §9w:item_useOn_cancel§r: ブロックへの使用をキャンセル\n
§r- タグは自動削除(デフォルト1tick後)。\n
§r- ブロック/エンティティとのインタラクト時にタグを付与:\n
  §r - §9w:touch_block_<block_id>§r: ブロックにインタラクト\n
  §r - §9w:touch_entity_<entity_type>§r: エンティティにインタラクト\n
  §r - §9w:touch_block_cancel§r: ブロックインタラクトをキャンセル\n
  §r - §9w:touch_entity_cancel§r: エンティティインタラクトをキャンセル\n
`;

    private readonly ITEM_USE_TAG_PREFIX = 'w:item_use_';
    private readonly ITEM_USE_CANCEL_TAG = 'w:item_use_cancel';
    private readonly TOUCH_BLOCK_TAG_PREFIX = 'w:touch_block_';
    private readonly TOUCH_ENTITY_TAG_PREFIX = 'w:touch_entity_';
    private readonly TOUCH_BLOCK_CANCEL_TAG = 'w:touch_block_cancel';
    private readonly TOUCH_ENTITY_CANCEL_TAG = 'w:touch_entity_cancel';
    private tagTimeout = 1;


    onEnable(): void {
        this.registerEventListeners();
    }

    onInitialize(): void {
        this.registerEventListeners();
    }

    onDisable(): void {
        this.unregisterEventListeners();
    }

    private registerEventListeners(): void {
        world.afterEvents.itemUse.subscribe(this.handleItemUse);
        world.beforeEvents.itemUse.subscribe(this.handleItemUseBefore);
        world.beforeEvents.playerInteractWithBlock.subscribe(this.handlePlayerInteractWithBlock);
        world.beforeEvents.playerInteractWithEntity.subscribe(this.handlePlayerInteractWithEntity);
    }

    private unregisterEventListeners(): void {
        world.afterEvents.itemUse.unsubscribe(this.handleItemUse);
        world.beforeEvents.itemUse.unsubscribe(this.handleItemUseBefore);
        world.beforeEvents.playerInteractWithBlock.unsubscribe(this.handlePlayerInteractWithBlock);
        world.beforeEvents.playerInteractWithEntity.unsubscribe(this.handlePlayerInteractWithEntity);
    }


    private handleItemUse = (event: ItemUseAfterEvent) => {
        const player = event.source;
        if (!(player instanceof Player)) return;
        const itemStack = event.itemStack;
        this.addItemUseTag(player, itemStack);

    };


    private handleItemUseBefore = (event: ItemUseBeforeEvent) => {
        const player = event.source;
        if (!(player instanceof Player)) return;
        if (player.hasTag(this.ITEM_USE_CANCEL_TAG)) {
            event.cancel = true;
        }
    };



    // アイテム使用タグを追加 (itemUse 用)
    private addItemUseTag(player: Player, itemStack: ItemStack): void {
        const itemId = itemStack.typeId;
        const tag = `${this.ITEM_USE_TAG_PREFIX}${itemId}`;
        this.addTagWithTimeout(player, tag, this.tagTimeout);
    }

    private handlePlayerInteractWithBlock = (event: PlayerInteractWithBlockBeforeEvent) => {
        const player = event.player;
        if (player.hasTag(this.TOUCH_BLOCK_CANCEL_TAG)) {
            event.cancel = true;
        }
        const block = event.block;
        const blockId = block.typeId;
        const tag = `${this.TOUCH_BLOCK_TAG_PREFIX}${blockId}`;
        this.addTagWithTimeout(player, tag, this.tagTimeout);
    };


    private handlePlayerInteractWithEntity = (event: PlayerInteractWithEntityBeforeEvent) => {
        const player = event.player;
        if (player.hasTag(this.TOUCH_ENTITY_CANCEL_TAG)) {
            event.cancel = true;
        }
        const entity = event.target;
        const entityTypeId = entity.typeId;
        const tag = `${this.TOUCH_ENTITY_TAG_PREFIX}${entityTypeId}`;
        this.addTagWithTimeout(player, tag, this.tagTimeout);
    };

    private addTagWithTimeout(player: Player, tag: string, timeout: number): void {
        system.run(()=>{
            player.addTag(tag);
        })
        system.runTimeout(() => {
            player.removeTag(tag);
        }, timeout);
    }
}

const itemEventModule = new ItemEventModule();
moduleManager.registerModule(itemEventModule);

