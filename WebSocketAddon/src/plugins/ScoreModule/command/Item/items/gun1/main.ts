import {
    Player,
    system,
    PlayerSoundOptions,
    Vector3,
    EntityRaycastOptions,
    EntityDamageCause,
    Entity,
} from "@minecraft/server";
import { CustomItem } from "../../../../utils/CustomItem";
import { registerCustomItem } from "../../custom";

// --- ピストル ---
const pistolCooldownTicks = 1;
const pistolCooldowns = new Map<string, number>();
const pistolReloadTicks = 40;
const pistolReloadingPlayers = new Set<string>();
const pistolMaxAmmo = 16; 
const pistolAmmo = new Map<string, number>();
const pistolMaxDamage = 10;
const pistolMinDamage = 5;
const pistolMaxRange = 10;
const pistolLore = [
    "§7----- Pistol Status -----",
    "",
    "  Damage  |  §c" + pistolMinDamage + " - " + pistolMaxDamage,
    "  Range   |  §a" + pistolMaxRange,
    "  Ammo    |  §b" + pistolMaxAmmo,
    "",
    "  Fire      |  右クリ/RightClick",
    "  Reload    |  シフト+右クリ/shift+RightClick(§eXP§r)",
    "",
    "§7----- " + (pistolReloadTicks / 20) + "s Reload -----",
];

const pistolItem = new CustomItem({
    name: "§bピストル",
    lore: pistolLore,
    item: "minecraft:wooden_hoe",
    amount: 1,
    rollback: true,
});
pistolItem.then((player) => {
    usePistol(player);
    updateActionBar(player);
});

function usePistol(player: Player) {
    const playerName = player.name;
    if (pistolReloadingPlayers.has(playerName)) {
        player.onScreenDisplay.setActionBar("§cリロード中です!"); return;
    }
    if (pistolCooldowns.has(playerName)) {
        const endTick = pistolCooldowns.get(playerName)!;
        if (system.currentTick < endTick) {
            const remainingSeconds = ((endTick - system.currentTick) / 20).toFixed(1);
            player.onScreenDisplay.setActionBar(`§cクールダウン中§6(§f${remainingSeconds}§6秒)`); return;
        }
    }
    if (player.isSneaking) { reloadPistol(player); return; }

    let currentAmmo = pistolAmmo.get(playerName) ?? pistolMaxAmmo;
    if (currentAmmo <= 0) {
        player.playSound("mob.villager.no");
        player.onScreenDisplay.setActionBar("§c弾切れです! リロードしてください。"); return;
    }

    pistolAmmo.set(playerName, --currentAmmo);
    pistolCooldowns.set(playerName, system.currentTick + pistolCooldownTicks);
    updateActionBar(player);

    system.run(() => {
        const maxDamage = pistolMaxDamage; const minDamage = pistolMinDamage; const maxRange = pistolMaxRange;
        const bulletSpeed = 1; const minY = -64; const maxY = 319;

        const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);
        playSound("fire.ignite", { pitch: 1.5 });
        system.runTimeout(() => playSound("fire.ignite", { pitch: 1.2 }), 2);
        system.runTimeout(() => playSound("random.click", { pitch: 1.8 }), 3);

        fireProjectile(player, maxDamage, minDamage, maxRange, bulletSpeed, minY, maxY, "minecraft:arrow_spell_emitter",
            (hitEntity, damage) => { hitEntity.applyDamage(damage, { damagingEntity: player, cause: EntityDamageCause.entityAttack }); }
        );
    });
}

function reloadPistol(player: Player) {
    const playerName = player.name;
    if (pistolReloadingPlayers.has(playerName)) { return; }

    const availableXp = player.level;
    if (availableXp <= 0) {
        player.onScreenDisplay.setActionBar("§cリロードに必要なXPがありません!"); return;
    }

    const reloadAmount = Math.min(availableXp, pistolMaxAmmo);

    player.onScreenDisplay.setActionBar("§aリロード開始...");
    pistolReloadingPlayers.add(playerName);

    const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);
    playSound("fire.ignite", { pitch: 0.8 });

    system.runTimeout(() => {
        player.addLevels(-reloadAmount);
        pistolAmmo.set(playerName, (pistolAmmo.get(playerName) ?? 0) + reloadAmount);
        pistolReloadingPlayers.delete(playerName);
        updateActionBar(player);
        playSound("item.shield.block", { pitch: 1.5 });
    }, pistolReloadTicks);
}

// --- アサルトライフル ---
const assaultRifleCooldownTicks = 1;
const assaultRifleCooldowns = new Map<string, number>();
const assaultRifleBurstIntervalTicks = 1;
const assaultRifleReloadTicks = 60;
const assaultRifleReloadingPlayers = new Set<string>();
const assaultRifleMaxAmmo = 32;
const assaultRifleAmmo = new Map<string, number>();
const assaultRifleMaxDamage = 3;
const assaultRifleMinDamage = 1;
const assaultRifleMaxRange = 20;


const assaultRifleLore = [
    "§7----- Assault Rifle Status -----",
    "",
    "  Damage      |  §c" + assaultRifleMinDamage + " - " + assaultRifleMaxDamage,
    "  Range       |  §a" + assaultRifleMaxRange,
    "  Ammo        |  §b" + assaultRifleMaxAmmo,
    "  Burst       |  §63",
    "",
    "  Fire        |  右クリ/RightClick",
    "  Reload      |  シフト+右クリ/shift+RightClick(§eXP§r)",
    "",
    "§7----- " + (assaultRifleReloadTicks / 20) + "s Reload / " + assaultRifleBurstIntervalTicks + "tick Burst -----",
];

const assaultRifleItem = new CustomItem({
    name: "§aアサルトライフル",
    lore: assaultRifleLore,
    item: "minecraft:iron_hoe",
    amount: 1,
});
assaultRifleItem.then((player) => {
    useAssaultRifle(player);
    updateActionBar(player);
});

function useAssaultRifle(player: Player) {
    const playerName = player.name;
    if (assaultRifleReloadingPlayers.has(playerName)) { player.onScreenDisplay.setActionBar("§cリロード中です!"); return; }

    if (assaultRifleCooldowns.has(playerName)) {
        const endTick = assaultRifleCooldowns.get(playerName)!;
        if (system.currentTick < endTick) {
            const remainingSeconds = ((endTick - system.currentTick) / 20).toFixed(1);
            player.onScreenDisplay.setActionBar(`§cクールダウン中§6(§f${remainingSeconds}§6秒)`); return;
        }
    }
    if (player.isSneaking) { reloadAssaultRifle(player); return; }

    function fireBurst(shotCount: number) {
        system.run(() => {
            if (shotCount <= 0) { assaultRifleCooldowns.set(playerName, system.currentTick + assaultRifleCooldownTicks); return; }
            let currentAmmo = assaultRifleAmmo.get(playerName) ?? assaultRifleMaxAmmo;
            if (currentAmmo <= 0) { player.playSound("mob.villager.no"); player.onScreenDisplay.setActionBar("§c弾切れです! リロードしてください。"); return; }

            assaultRifleAmmo.set(playerName, --currentAmmo);
            updateActionBar(player);

            const maxDamage = assaultRifleMaxDamage; const minDamage = assaultRifleMinDamage; const maxRange = assaultRifleMaxRange; const bulletSpeed = 1.5;
            const minY = -64; const maxY = 319;

            const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);
            playSound("fire.ignite", { pitch: 1.8, volume: 0.8 });

            fireProjectile(player, maxDamage, minDamage, maxRange, bulletSpeed, minY, maxY, "minecraft:small_soul_fire_flame",
                (hitEntity, damage) => { hitEntity.applyDamage(damage, { damagingEntity: player, cause: EntityDamageCause.entityAttack }); }
            );
            system.runTimeout(() => { fireBurst(shotCount - 1); }, assaultRifleBurstIntervalTicks);
        });
    }
    const burstCount = 3;
    fireBurst(burstCount);
}

function reloadAssaultRifle(player: Player) {
    const playerName = player.name;
    if (assaultRifleReloadingPlayers.has(playerName)) { return; }

    const availableXp = player.level;
    if (availableXp <= 0) {
        player.onScreenDisplay.setActionBar("§cリロードに必要なXPがありません!"); return;
    }

    const reloadAmount = Math.min(availableXp, assaultRifleMaxAmmo);

    player.onScreenDisplay.setActionBar("§aリロード開始...");
    assaultRifleReloadingPlayers.add(playerName);

    const playSound = (soundId: string, options?: PlayerSoundOptions) => player.playSound(soundId, options);
    playSound("fire.ignite", { pitch: 0.8 });

    system.runTimeout(() => {
        player.addLevels(-reloadAmount);
        assaultRifleAmmo.set(playerName, (assaultRifleAmmo.get(playerName) ?? 0) + reloadAmount);
        assaultRifleReloadingPlayers.delete(playerName);
        updateActionBar(player);
        playSound("item.shield.block", { pitch: 1.5 });
    }, assaultRifleReloadTicks);
}

function fireProjectile(player: Player, maxDamage: number, minDamage: number, maxRange: number, bulletSpeed: number, minY: number, maxY: number, particleId: string, onHit: (hitEntity: Entity, damage: number) => void) {
    const headLocation = player.getHeadLocation();
    const direction = player.getViewDirection();
    if (headLocation.y < minY || headLocation.y > maxY) { player.onScreenDisplay.setActionBar("初期位置が不正です"); return; }
    const raycastOptions: EntityRaycastOptions = { maxDistance: maxRange };
    const hitResult = player.getEntitiesFromViewDirection(raycastOptions)[0];
    const hitEntity = hitResult?.entity;
    const hitDistance = hitResult ? distance(headLocation, hitResult.entity.location) : maxRange;
    for (let d = 0; d <= maxRange; d += bulletSpeed) {
        const delayTicks = d / bulletSpeed;
        system.runTimeout(() => {
            try {
                const particlePos: Vector3 = { x: headLocation.x + direction.x * d, y: Math.min(maxY, Math.max(minY, headLocation.y + direction.y * d)), z: headLocation.z + direction.z * d };
                player.dimension.spawnParticle(particleId, particlePos);
                if (hitEntity && d >= hitDistance) { const damage = Math.max(minDamage, maxDamage / (1 + 0.2 * hitDistance)); onHit(hitEntity, damage); return; }
            } catch (error: any) { console.error("Error in projectile loop:", error, error.stack); }
        }, delayTicks);
    }
}
function distance(pos1: Vector3, pos2: Vector3): number { return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2 + (pos1.z - pos2.z) ** 2); }

function updateActionBar(player: Player) {
    const itemStack = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
    let ammoCount = 0;
    let maxAmmo = 0;

    if (itemStack && itemStack.typeId === pistolItem.item && itemStack.nameTag === pistolItem.name) {
        ammoCount = pistolAmmo.get(player.name) ?? pistolMaxAmmo;
        maxAmmo = pistolMaxAmmo;
    } else if (itemStack && itemStack.typeId === assaultRifleItem.item && itemStack.nameTag === assaultRifleItem.name) {
        ammoCount = assaultRifleAmmo.get(player.name) ?? assaultRifleMaxAmmo;
        maxAmmo = assaultRifleMaxAmmo;
    }

    player.onScreenDisplay.setActionBar(`残弾数: ${ammoCount} / ${maxAmmo}`);
}

//登録関数
registerCustomItem(3, assaultRifleItem);
registerCustomItem(4, pistolItem);