import {
    EntityInventoryComponent,
    EntityDamageCause,
    EntityDamageSource,
    world,
    Player,
    Entity,
    system,
    EntityHurtAfterEvent,
    EntityDieAfterEvent,
    ProjectileHitBlockAfterEvent,
    ProjectileHitEntityAfterEvent,
} from '@minecraft/server';
import { Module, moduleManager } from '../../module/module';
import { Database } from '../../module/DataBase';

class AttackModule implements Module {
    name = 'Attack_Manager';
    enabledByDefault = true;
    docs = `プレイヤーの攻撃/キル/死亡/被ダメージ/投擲物のヒットを記録します。\n
**データ**\n
§r- キル数: §9ws_attack_kill_counts\n
§r- 死亡数: §9ws_attack_death_counts\n
§r- 攻撃数: §9ws_attack_counts\n
\n
**タグ (発射者/攻撃者 - Attacker)**\n
§r- キル: §9w:kill\n
§r- 攻撃: §9w:attack\n
§r- 攻撃アイテム: §9w:attack_<アイテムID>\n
§r- 投擲物がエンティティにヒット: §9w:hit_entity\n
§r- ヒットしたエンティティタイプ: §9w:hit_entity_<タイプID>\n
§r- 投擲物がブロックにヒット: §9w:hit_block\n
§r- ヒットしたブロックID: §9w:hit_block_<ブロックID>\n
\n
**タグ (被ダメージ者/被弾エンティティ - Damaged/Hit Entity)**\n
§r- 死亡: §9w:dead\n
§r- 死亡原因: §9w:dead_case_<原因>\n
§r- 被ダメージ: §9w:damaged\n
§r- 被ダメージ原因: §9w:damaged_<原因>\n
§r- 投擲物がヒット: §9w:d_hit_entity\n
§r- ヒットしたエンティティタイプ(被弾側): §9w:d_hit_entity_<タイプID>\n
\n
**タグ (投擲物 - Projectile)**\n
§r- エンティティにヒット: §9w:a_hit_entity\n
§r- ヒットしたエンティティタイプ(投擲物側): §9w:a_hit_entity_<タイプID>\n
§r- ブロックにヒット: §9w:a_hit_block\n
§r- ヒットしたブロックID(投擲物側): §9w:a_hit_block_<ブロックID>\n`;

    private playerAttackMap = new Map<string, string>();
    private tagTimeout = 1;

    private cachedPlayers: Player[] = [];
    private killCountDb: Database;
    private deathCountDb: Database;
    private attackCountDb: Database;

    private static readonly KILL_TAG = 'w:kill';
    private static readonly DEAD_TAG = 'w:dead';
    private static readonly DIE_TAG = 'w:die';
    private static readonly ATTACK_TAG = 'w:attack';
    private static readonly DAMAGED_TAG = 'w:damaged';
    private static readonly ATTACK_ITEM_TAG = 'w:attack_';

    private static readonly DAMAGED_CAUSE_TAG_PREFIX = 'w:damaged_';
    private static readonly DEAD_CAUSE_TAG_PREFIX = 'w:dead_case_';

    private static readonly SOURCE_HIT_BLOCK_TAG = 'w:hit_block';
    private static readonly SOURCE_HIT_BLOCK_ID_TAG_PREFIX = 'w:hit_block_';
    private static readonly SOURCE_HIT_ENTITY_TAG = 'w:hit_entity';
    private static readonly SOURCE_HIT_ENTITY_TYPE_TAG_PREFIX = 'w:hit_entity_';

    private static readonly PROJECTILE_HIT_BLOCK_TAG = 'w:a_hit_block';
    private static readonly PROJECTILE_HIT_BLOCK_ID_TAG_PREFIX = 'w:a_hit_block_';
    private static readonly PROJECTILE_HIT_ENTITY_TAG = 'w:a_hit_entity';
    private static readonly PROJECTILE_HIT_ENTITY_TYPE_TAG_PREFIX = 'w:a_hit_entity_';

    private static readonly DAMAGED_HIT_ENTITY_TAG = 'w:d_hit_entity';
    private static readonly DAMAGED_HIT_ENTITY_TYPE_TAG_PREFIX = 'w:d_hit_entity_';

    constructor() {
        this.killCountDb = Database.create('ws_attack_kill_counts');
        this.deathCountDb = Database.create('ws_attack_death_counts');
        this.attackCountDb = Database.create('ws_attack_counts');
    }

    onEnable(): void {
        this.cachePlayers();
        this.registerEventListeners();
    }
    onInitialize(): void {
        this.cachePlayers();
        this.registerEventListeners();
    }

    onDisable(): void {
        this.unregisterEventListeners();
    }

    private registerEventListeners(): void {
        world.afterEvents.playerSpawn.subscribe(() => this.cachePlayers());
        world.afterEvents.playerLeave.subscribe(() => this.cachePlayers());
        world.afterEvents.entityHurt.subscribe(this.handleEntityHurt);
        world.afterEvents.entityDie.subscribe(this.handleEntityDie);
        world.afterEvents.projectileHitBlock.subscribe(this.handleProjectileHitBlock);
        world.afterEvents.projectileHitEntity.subscribe(this.handleProjectileHitEntity);
    }

    private unregisterEventListeners(): void {
        world.afterEvents.playerSpawn.unsubscribe(() => this.cachePlayers());
        world.afterEvents.playerLeave.unsubscribe(() => this.cachePlayers());
        world.afterEvents.entityHurt.unsubscribe(this.handleEntityHurt);
        world.afterEvents.entityDie.unsubscribe(this.handleEntityDie);
        world.afterEvents.projectileHitBlock.unsubscribe(this.handleProjectileHitBlock);
        world.afterEvents.projectileHitEntity.unsubscribe(this.handleProjectileHitEntity);
    }

    private cachePlayers(): void {
        this.cachedPlayers = Array.from(world.getAllPlayers());
    }

    private handleEntityHurt = (event: EntityHurtAfterEvent) => {
        const { hurtEntity, damageSource } = event;
        const attacker = this.getDamagingEntity(damageSource);

        hurtEntity.addTag(AttackModule.DAMAGED_TAG);
        this.removeTagWithTimeout(hurtEntity, AttackModule.DAMAGED_TAG, this.tagTimeout);

        const damagedCauseTag = `${AttackModule.DAMAGED_CAUSE_TAG_PREFIX}${damageSource.cause}`;
        hurtEntity.addTag(damagedCauseTag);
        this.removeTagWithTimeout(hurtEntity, damagedCauseTag, this.tagTimeout);

        if (attacker instanceof Player) {
            this.playerAttackMap.set(hurtEntity.id, attacker.id);
            this.incrementAttackCount(attacker);

            attacker.addTag(AttackModule.ATTACK_TAG);
            this.removeTagWithTimeout(attacker, AttackModule.ATTACK_TAG, this.tagTimeout);

            const inventory = attacker.getComponent('inventory') as EntityInventoryComponent;
            const itemStack = inventory?.container?.getItem(attacker.selectedSlotIndex);
            if (itemStack) {
                const itemTag = `${AttackModule.ATTACK_ITEM_TAG}${itemStack.typeId}`;
                attacker.addTag(itemTag);
                this.removeTagWithTimeout(attacker, itemTag, this.tagTimeout);
            }
        }
    };

    private removeTagWithTimeout(entity: Entity | undefined, tag: string, timeout: number): void {
        if (!entity) return;
        system.runTimeout(() => {
            try {
                if (entity.isValid && entity.hasTag(tag)) {
                    entity.removeTag(tag);
                }
            } catch (error) {
            }
        }, timeout);
    }

    private handleEntityDie = (event: EntityDieAfterEvent) => {
        const { deadEntity, damageSource } = event;

        if (!(deadEntity instanceof Player)) return;

        deadEntity.addTag(AttackModule.DIE_TAG);
        this.removeTagWithTimeout(deadEntity, AttackModule.DIE_TAG, this.tagTimeout);

        const { cause } = damageSource;
        const deadCauseTag = `${AttackModule.DEAD_CAUSE_TAG_PREFIX}${cause}`;
        deadEntity.addTag(deadCauseTag);
        this.removeTagWithTimeout(deadEntity, deadCauseTag, this.tagTimeout);

        this.incrementDeathCount(deadEntity);

        //@ts-ignore
        if (cause === EntityDamageCause.suicide) {
            this.playerAttackMap.delete(deadEntity.id);
            return;
        }

        const lastAttackerId = this.playerAttackMap.get(deadEntity.id);
        this.playerAttackMap.delete(deadEntity.id);

        if (!lastAttackerId || lastAttackerId === deadEntity.id) {
            return;
        }

        const killer = this.cachedPlayers.find((p) => p.id === lastAttackerId);

        if (killer) {
            this.onPlayerKill(killer, deadEntity);
        }

    };

    private getDamagingEntity(damageSource: EntityDamageSource): Entity | undefined {
        if (damageSource.damagingEntity) {
            return damageSource.damagingEntity;
        }
        if (damageSource.damagingProjectile) {
            return damageSource.damagingProjectile;
        }
        return undefined;
    }

    private async onPlayerKill(killer: Player, dead: Player): Promise<void> {
        dead.addTag(AttackModule.DEAD_TAG);
        killer.addTag(AttackModule.KILL_TAG);
        this.removeTagWithTimeout(killer, AttackModule.KILL_TAG, this.tagTimeout);
        this.removeTagWithTimeout(dead, AttackModule.DEAD_TAG, this.tagTimeout);
        await this.incrementKillCount(killer);
    }

    private async incrementKillCount(player: Player): Promise<void> {
        const currentKillCount = (await this.killCountDb.get(player)) ?? 0;
        await this.killCountDb.set(player, currentKillCount + 1);
    }

    private async incrementDeathCount(player: Player): Promise<void> {
        const currentDeathCount = (await this.deathCountDb.get(player)) ?? 0;
        await this.deathCountDb.set(player, currentDeathCount + 1);
    }

    private async incrementAttackCount(player: Player): Promise<void> {
        const currentAttackCount = (await this.attackCountDb.get(player)) ?? 0;
        await this.attackCountDb.set(player, currentAttackCount + 1);
    }

    private handleProjectileHitBlock = (event: ProjectileHitBlockAfterEvent) => {
        const { projectile, source } = event;
        const blockHit = event.getBlockHit()?.block;

        if (!blockHit || !source) return;

        const projBlockIdTag = `${AttackModule.PROJECTILE_HIT_BLOCK_ID_TAG_PREFIX}${blockHit.typeId}`;
        const sourceBlockIdTag = `${AttackModule.SOURCE_HIT_BLOCK_ID_TAG_PREFIX}${blockHit.typeId}`;

        try {
            if (projectile.isValid) {
                projectile.addTag(AttackModule.PROJECTILE_HIT_BLOCK_TAG);
                this.removeTagWithTimeout(projectile, AttackModule.PROJECTILE_HIT_BLOCK_TAG, this.tagTimeout);

                projectile.addTag(projBlockIdTag);
                this.removeTagWithTimeout(projectile, projBlockIdTag, this.tagTimeout);
            }
        } catch (e) { }

        if (source.isValid) {
            source.addTag(AttackModule.SOURCE_HIT_BLOCK_TAG);
            this.removeTagWithTimeout(source, AttackModule.SOURCE_HIT_BLOCK_TAG, this.tagTimeout);

            source.addTag(sourceBlockIdTag);
            this.removeTagWithTimeout(source, sourceBlockIdTag, this.tagTimeout);
        }
    };

    private handleProjectileHitEntity = (event: ProjectileHitEntityAfterEvent) => {
        const { projectile, source } = event;
        const entityHit = event.getEntityHit().entity;

        if (!entityHit || !source) return;

        const projEntityTypeTag = `${AttackModule.PROJECTILE_HIT_ENTITY_TYPE_TAG_PREFIX}${entityHit.typeId}`;
        const sourceEntityTypeTag = `${AttackModule.SOURCE_HIT_ENTITY_TYPE_TAG_PREFIX}${entityHit.typeId}`;
        const damagedEntityTypeTag = `${AttackModule.DAMAGED_HIT_ENTITY_TYPE_TAG_PREFIX}${entityHit.typeId}`;


        try {
            projectile.addTag(AttackModule.PROJECTILE_HIT_ENTITY_TAG);
            //this.removeTagWithTimeout(projectile, AttackModule.PROJECTILE_HIT_ENTITY_TAG, this.tagTimeout);
            projectile.addTag(projEntityTypeTag);
            // this.removeTagWithTimeout(projectile, projEntityTypeTag, this.tagTimeout);

        } catch (e) { }

        if (source.isValid) {
            source.addTag(AttackModule.SOURCE_HIT_ENTITY_TAG);
            this.removeTagWithTimeout(source, AttackModule.SOURCE_HIT_ENTITY_TAG, this.tagTimeout);

            source.addTag(sourceEntityTypeTag);
            this.removeTagWithTimeout(source, sourceEntityTypeTag, this.tagTimeout);
        }

        if (entityHit.isValid) {
            entityHit.addTag(AttackModule.DAMAGED_HIT_ENTITY_TAG);
            this.removeTagWithTimeout(entityHit, AttackModule.DAMAGED_HIT_ENTITY_TAG, this.tagTimeout);

            entityHit.addTag(damagedEntityTypeTag);
            this.removeTagWithTimeout(entityHit, damagedEntityTypeTag, this.tagTimeout);
        }
    };
}

const attackModule = new AttackModule();
moduleManager.registerModule(attackModule);