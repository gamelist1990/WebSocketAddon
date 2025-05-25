import {
    Player,
    system,
    Entity,
    EntityDamageCause,
    EntityEffectOptions,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../CustomItem";
import { registerCustomItem } from "../../custom";

const axeCooldowns = new Map<string, number>();
const activeCooldownIntervals = new Map<string, number>();
const AXE_COOLDOWN_MS = 600;
const CUSTOM_AXE_ID = 25;

const COOLDOWN_BAR_SLOTS = 10;
const FILLED_CHAR = "|";
const EMPTY_CHAR = "|";
const FILLED_COLOR = "§a";
const EMPTY_COLOR = "§c";
const COOLDOWN_UPDATE_INTERVAL_TICKS = 0; 

const BONUS_DAMAGE = 17; 

function startCooldownVisual(player: Player, startTime: number): void {
    if (activeCooldownIntervals.has(player.id)) {
        system.clearRun(activeCooldownIntervals.get(player.id)!);
        activeCooldownIntervals.delete(player.id);
    }

    const intervalId = system.runInterval(() => {
        try {
            if (!player.isValid) {
                throw new Error("Player is no longer valid.");
            }

            const now = Date.now();
            const elapsed = now - startTime;
            const remaining = AXE_COOLDOWN_MS - elapsed;

            if (remaining <= 0) {
                const completedBar = `${FILLED_COLOR}${FILLED_CHAR.repeat(COOLDOWN_BAR_SLOTS)}§r`;
                player.onScreenDisplay.setActionBar(completedBar);

                system.runTimeout(() => {
                    try {
                        // @ts-ignore
                        if (player.isValid() && player.onScreenDisplay.getActionBar() === completedBar) {
                            player.onScreenDisplay.setActionBar("");
                        }
                    } catch (e) { }
                }, 5);

                activeCooldownIntervals.delete(player.id);
                system.clearRun(intervalId);
                return;
            }

            const progress = Math.min(1, elapsed / AXE_COOLDOWN_MS);
            const filledCount = Math.floor(progress * COOLDOWN_BAR_SLOTS);
            const emptyCount = COOLDOWN_BAR_SLOTS - filledCount;

            const bar = `${FILLED_COLOR}${FILLED_CHAR.repeat(filledCount)}${EMPTY_COLOR}${EMPTY_CHAR.repeat(emptyCount)}§r`;

            player.onScreenDisplay.setActionBar(`${bar}`);

        } catch (error) {
            console.warn(`クールダウン表示の更新中にエラーが発生したため停止します: ${error}`);
            if (activeCooldownIntervals.has(player.id)) {
                system.clearRun(activeCooldownIntervals.get(player.id)!);
                activeCooldownIntervals.delete(player.id);
            }
        }
    }, COOLDOWN_UPDATE_INTERVAL_TICKS);

    activeCooldownIntervals.set(player.id, intervalId);
}

const customDiamondAxe = new CustomItem({
    name: "§bJava版Axe",
    lore: [
        "§7Java版風クールダウンを持つアックス。",
        "§7クールダウン: §e0.9秒",
        "§a|§c|バーでクールダウン表示。",
        "§a準備完了時に攻撃すると追加ダメージ！ (§e+" + BONUS_DAMAGE + "§a)",
        "§cクールダウン中の攻撃はクールダウンをリセットする。",
    ],
    item: "minecraft:diamond_axe",
    remove: false,
})
    .then((player: Player, eventData) => {
        system.run(() => {
            if (eventData.eventType !== EventType.EntityHit || !eventData.hitResult || !eventData.hitResult.entity) {
                return;
            }

            const now = Date.now();
            const lastUseTimestamp = axeCooldowns.get(player.id) ?? 0;
            const entityHit: Entity = eventData.hitResult.entity;

            if (now - lastUseTimestamp < AXE_COOLDOWN_MS) {
                axeCooldowns.set(player.id, now);
                startCooldownVisual(player, now);
                player.playSound("note.bass", { location: player.location, pitch: 0.7, volume: 0.6 });
                try {
                    const regenerationOptions: EntityEffectOptions = { amplifier: 5, showParticles: false };
                    entityHit.addEffect("instant_health", 1, regenerationOptions);
                } catch (e) {
                    console.warn(`プレイヤー ${player.name} への弱体化付与中にエラー: ${e}`);
                }
                return;
            }

            axeCooldowns.set(player.id, now);
            startCooldownVisual(player, now);

            try {
                entityHit.applyDamage(BONUS_DAMAGE, {
                    damagingEntity: player,
                    cause: EntityDamageCause.entityAttack
                });
              //  console.log(`プレイヤー ${player.name} が ${entityHit.nameTag} にヒット。追加ダメージ +${BONUS_DAMAGE} を適用。 (クールダウン開始)`);
                player.playSound("random.anvil_land", { location: entityHit.location, pitch: 1.5, volume: 0.5 });
            } catch (error) {
                console.warn(`エンティティへの追加ダメージ適用中にエラー: ${error}`);
            }
        });
    });

registerCustomItem(CUSTOM_AXE_ID, customDiamondAxe);
