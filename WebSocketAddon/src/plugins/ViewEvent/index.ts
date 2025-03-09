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
        for (const player of world.getAllPlayers()) {
            const playerData = this.trackedPlayers.get(player.name);
            if (playerData) {
                if (playerData.blockTag) {
                    player.removeTag(playerData.blockTag);
                }
                if (playerData.entityTag) {
                    player.removeTag(playerData.entityTag);
                }
            }
        }
        this.trackedPlayers.clear();
    }

    private runId: any;

    private registerEventListeners(): void {
        this.runId = system.runInterval(() => this.checkView());
        this.runId;
    }

    private unregisterEventListeners(): void {
        system.clearRun(this.runId);

    }

    private isWithinWorldBounds(x: number, y: number, z: number): boolean {
        const worldMinX = -30000000;
        const worldMaxX = 29999999;
        const worldMinY = -64;
        const worldMaxY = 219;
        const worldMinZ = -30000000;
        const worldMaxZ = 29999999;
        return x >= worldMinX && x <= worldMaxX &&
            y >= worldMinY && y <= worldMaxY &&
            z >= worldMinZ && z <= worldMaxZ;
    }



    private checkView() {
        for (const player of world.getAllPlayers()) {
            if (!this.trackedPlayers.has(player.name)) {
                this.trackedPlayers.set(player.name, {});
            }

            const playerData = this.trackedPlayers.get(player.name)!;

            const blockRaycastOptions: BlockRaycastOptions = {
                maxDistance: 10,

            };
            const blockHit = player.getBlockFromViewDirection(blockRaycastOptions);

            if (blockHit) {
                const { x, y, z } = blockHit.block.location;

                if (this.isWithinWorldBounds(x, y, z)) {
                    const blockTag = `w:view_block_${blockHit.block.typeId}`;
                    if (playerData.blockTag !== blockTag) {
                        if (playerData.blockTag) {
                            player.removeTag(playerData.blockTag);
                        }
                        player.addTag(blockTag);
                        playerData.blockTag = blockTag;
                    }
                } else {
                    if (playerData.blockTag) {
                        player.removeTag(playerData.blockTag);
                        playerData.blockTag = undefined;
                    }
                }


            } else {
                if (playerData.blockTag) {
                    player.removeTag(playerData.blockTag);
                    playerData.blockTag = undefined;
                }
            }



            const entityRaycastOptions: EntityRaycastOptions = {
                maxDistance: 10,
            };
            const entityHit = player.getEntitiesFromViewDirection(entityRaycastOptions);

            if (entityHit.length > 0) {
                const entity = entityHit[0].entity;

                if (this.isWithinWorldBounds(entity.location.x, entity.location.y, entity.location.z)) {

                    const entityTag = `w:view_entity_${entity.typeId}`;

                    if (playerData.entityTag !== entityTag) {
                        if (playerData.entityTag) {
                            player.removeTag(playerData.entityTag);
                        }
                        player.addTag(entityTag);
                        playerData.entityTag = entityTag;
                    }
                } else {
                    if (playerData.entityTag) {
                        player.removeTag(playerData.entityTag);
                        playerData.entityTag = undefined;
                    }
                }
            } else {
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