import {
    world,
    system,
    EntityRaycastOptions,
    BlockRaycastOptions,
} from '@minecraft/server';
import { Module, moduleManager } from '../../module/module';

class ViewEvent implements Module {
    name = 'ViewEvent';
    enabledByDefault = true;
    docs = `プレイヤーが見ているブロック/エンティティにタグを付与します。\n
    **機能**\n
    §r- ブロックを見ている場合:\n
    §r  - §9w:view_block_[ブロックID]§r タグを付与\n
    §r- エンティティを見ている場合:\n
    §r  - §9w:view_entity_[エンティティタイプID]§r タグを付与\n
    §r- タグは、見ている間のみ付与され、見ていない場合は即座に削除されます。\n`;

    private trackedPlayers: Map<string, { blockTag?: string; entityTag?: string }> = new Map();

    constructor() { }

    onEnable(): void {
        this.registerEventListeners();
    }
    onInitialize(): void {
        this.registerEventListeners();
    }

    onDisable(): void {
        this.unregisterEventListeners();
        this.trackedPlayers.clear();
    }

    private registerEventListeners(): void {
        system.runInterval(() => this.checkView());
    }

    private unregisterEventListeners(): void {
        // No specific event unsubscription needed, as we're using system.runInterval
    }


    private checkView() {
        for (const player of world.getAllPlayers()) {
            if (!this.trackedPlayers.has(player.name)) {
                this.trackedPlayers.set(player.name, {});
            }

            const playerData = this.trackedPlayers.get(player.name)!;

            // Block Raycast
            const blockRaycastOptions: BlockRaycastOptions = {
                maxDistance: 10,
            };
            const blockHit = player.getBlockFromViewDirection(blockRaycastOptions);

            if (blockHit) {
                const blockTag = `w:view_block_${blockHit.block.typeId}`;
                if (playerData.blockTag !== blockTag) {
                    if (playerData.blockTag) {
                        player.removeTag(playerData.blockTag);
                    }

                    1

                    player.addTag(blockTag);
                    playerData.blockTag = blockTag;
                }
            } else {
                // Remove block tag if not looking at a block
                if (playerData.blockTag) {
                    player.removeTag(playerData.blockTag);
                    playerData.blockTag = undefined;
                }
            }


            // Entity Raycast
            const entityRaycastOptions: EntityRaycastOptions = {
                maxDistance: 10, // Adjust as needed
            };
            const entityHit = player.getEntitiesFromViewDirection(entityRaycastOptions);

            if (entityHit.length > 0) {
                const entity = entityHit[0].entity; // Consider the closest entity
                const entityTag = `w:view_entity_${entity.typeId}`;

                if (playerData.entityTag !== entityTag) {
                    // Remove old tag
                    if (playerData.entityTag) {
                        player.removeTag(playerData.entityTag);
                    }
                    // Add new tag
                    player.addTag(entityTag);
                    playerData.entityTag = entityTag;
                }
            } else {
                // Remove entity tag if not looking at an entity
                if (playerData.entityTag) {
                    player.removeTag(playerData.entityTag);
                    playerData.entityTag = undefined;
                }
            }
        }
    }
}

const viewEvent = new ViewEvent();
moduleManager.registerModule(viewEvent);