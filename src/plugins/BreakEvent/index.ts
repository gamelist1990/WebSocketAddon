import {
    world,
    PlayerBreakBlockBeforeEvent,
    Player,
    system,
    PlayerPlaceBlockBeforeEvent} from '@minecraft/server';
import { Module, moduleManager } from '../../module/module';

class BreakEvent implements Module {
    name = 'BreakEvent';
    enabledByDefault = true;

    docs = `プレイヤーがブロックを破壊/設置した際に
    tagが付与されます
    **機能**
    §r- ブロック破壊時:
    §r  - §9w:break§r タグを付与
    §r  - §9w:break_[ブロックID]§r タグを付与 (例: w:break_minecraft:stone)
    §r  - §9w:break_item_[アイテム名]§r タグを付与 (アイテム使用時、アイテムのカスタム名がある場合)
    §r  - §9w:break_cancel§r タグを持つプレイヤーは全てのブロック破壊不可
    §r  - §9w:break_cancel_[ブロックID]§r タグを持つプレイヤーは指定したブロックIDの破壊不可 (例: w:break_cancel_minecraft:diamond_block)
    §r- ブロック設置時:
    §r  - §9w:place§r タグを付与
    §r  - §9w:place_[ブロックID]§r タグを付与 (例: w:place_minecraft:dirt)
    §r  - §9w:place_cancel§r タグを持つプレイヤーは全てのブロック設置不可
    §r- タグは付与後、1tick後に削除されます
    `;


    constructor() {

    }


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


        try {
            world.beforeEvents.playerBreakBlock.subscribe(this.BreakBlock);
            world.beforeEvents.playerPlaceBlock.subscribe(this.PlaceBlock);
        } catch (error) {
            console.error(`[${this.name}] Failed to register event listeners:`, error);
        }
    }


    private unregisterEventListeners(): void {
        try {
            world.beforeEvents.playerBreakBlock.unsubscribe(this.BreakBlock);
            world.beforeEvents.playerPlaceBlock.unsubscribe(this.PlaceBlock);
        } catch (error) {
            console.error(`[${this.name}] Failed to unregister event listeners:`, error);
        }
    }


    private PlaceBlock = (event: PlayerPlaceBlockBeforeEvent) => {
        const { block, player } = event;
        const blockId = block.typeId;


        const PLACE_TAG = `w:place`;
        const PLACE_TAG_ID = `w:place_${blockId}`;
        const PLACE_TAG_CANCEL = `w:place_cancel`;


        if (player) {

            if (player.hasTag(PLACE_TAG_CANCEL)) {
                event.cancel = true;


            }


            if (!event.cancel) {
                this.tag(player, PLACE_TAG);
                this.tag(player, PLACE_TAG_ID);
            } else {


                this.tag(player, PLACE_TAG);
                this.tag(player, PLACE_TAG_ID);
            }
        }
    }



    private BreakBlock = (event: PlayerBreakBlockBeforeEvent) => {
        const { itemStack, block, player } = event;
        const blockId = block.typeId;



        const customItemName = itemStack?.nameTag;




        const BREAK_TAG = `w:break`;
        const BREAK_TAG_ID = `w:break_${blockId}`;

        const BREAK_TAG_ITEM = customItemName ? `w:break_item_${customItemName}` : undefined;
        const BREAK_TAG_CANCEL = `w:break_cancel`;

        const BREAK_TAG_CANCEL_ID = `w:break_cancel_${blockId}`;



        if (player) {


            if (player.hasTag(BREAK_TAG_CANCEL) || player.hasTag(BREAK_TAG_CANCEL_ID)) {
                event.cancel = true;


            }



            if (!event.cancel) {
                this.tag(player, BREAK_TAG);
                this.tag(player, BREAK_TAG_ID);
                if (BREAK_TAG_ITEM) {
                    this.tag(player, BREAK_TAG_ITEM);
                }
            } else {


                this.tag(player, BREAK_TAG);
                this.tag(player, BREAK_TAG_ID);
                if (BREAK_TAG_ITEM) {
                    this.tag(player, BREAK_TAG_ITEM);
                }
            }



        }
    };

    private tag(player: Player, tag: string) {


        system.run(() => {
            try {

                if (!player || !player.isValid) return;

                player.addTag(tag);

                system.runTimeout(() => {
                    try {

                        if (player && player.isValid) {
                            player.removeTag(tag);
                        }
                    } catch (e) {


                    }
                }, 1);
            } catch (e) {

            }
        });
    }
}



const breakPlaceEventModule = new BreakEvent();
moduleManager.registerModule(breakPlaceEventModule); 