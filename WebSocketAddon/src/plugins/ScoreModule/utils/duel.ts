import {
    Player,
    system,
    world,
    Vector3,
    Dimension,
    ScoreboardObjective,
    EquipmentSlot,
    Entity,
    EntityRaycastHit,
    GameMode,
    EntityHitEntityAfterEvent,
    ItemLockMode,
    PlayerJoinAfterEvent,
    BlockInventoryComponent,
    Container,
} from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

interface DuelConfig {
    name: string;
    pos1: Vector3;
    pos2: Vector3;
    kit: string; // Legacy kit support (still used for teleport)
    endPos: Vector3;
}

interface DuelRequest {
    requester: string;
    target: string;
    map?: string;
    timestamp: number;
}

interface RegisteredKit {
    name: string;
    armorPos: Vector3;  // Armor chest position
    hotbarPos: Vector3; // Hotbar chest position
    inventoryPos?: Vector3; // Optional inventory chest position
    useSecondPos: boolean;  // Whether to use pos2 (inventory)
    lockHotbar: boolean;   // Whether to lock hotbar items
    lockArmor: boolean;    // Whether to lock armor items
    lockInventory: boolean; // Whether to lock inventory items
    dimension: Dimension; // The dimension where the chests are located
}


const REQUEST_TIMEOUT = 60000;

const SCOREBOARD_OBJECTIVES = {
    TOTAL_KILL: "duel_totalKill",
    KILLSTREAK: "duel_killstreak",
    WIN_RATE: "duel_winrate",
    WIN_COUNT: "duel_winCount",
    DEATH_COUNT: "duel_deadCount",
    DUEL_RUNNING: "duel_running",
    ATTACK_COUNT: "duel_attack_count",
    TOTAL_GAMES: "duel_totalGames",
    MAX_KILLSTREAK: "duel_maxKillstreak",
    ADJUSTED_WINS: "duel_adjustedWins",  // 調整された勝利数
};

const DUEL_PLAYER_TAG = "player_hub";
const DUELING_PLAYER_TAG = "player_duel";

export class DuelManager {
    private duelConfigs: Record<string, DuelConfig> = {};
    private duelRequests: DuelRequest[] = [];
    private autoMatchQueue: string[] = [];
    private activeDuels: Map<string, { map: string }> = new Map();
    private leftPlayers: Set<string> = new Set();
    private registeredKits: RegisteredKit[] = [];  // Array to store registered kits
    public kits: { [key: string]: any } = {};


    constructor() {
        this.registerEvents();
    }
    private registerEvents() {
        system.runInterval(() => {
            this.removeExpiredRequests();
            this.processAutoMatchQueue();
        }, 20);

        world.afterEvents.entityHitEntity.subscribe((event) => this.onEntityHitEntity(event));
        world.afterEvents.playerLeave.subscribe((event) => {
            this.onPlayerLeave(event.playerName);
        });
        world.afterEvents.playerJoin.subscribe((event) => this.onPlayerJoin(event));  // プレイヤー参加イベント
    }

    public registerKitChest(name: string, pos1: Vector3, pos2?: Vector3): void {
        const dimension = world.getDimension("overworld"); // Or get the appropriate dimension

        // Check for existing kit with the same name
        if (this.registeredKits.some(kit => kit.name === name)) {
            // console.warn(`Kit with name '${name}' already registered.`);
            return;
        }

        // Check if pos1 block is a chest
        const block1 = dimension.getBlock(pos1);
        if (!block1 || block1.typeId !== "minecraft:chest") {
            console.warn(`Block at pos1 is not a chest.`);
            return;
        }

        // Check if pos2 is provided and is a chest
        if (pos2) {
            const block2 = dimension.getBlock(pos2);
            if (block2 && block2.typeId === "minecraft:chest") {
                // Valid chest at pos2
            } else {
                console.warn(`pos2 provided, but block is not a chest. Ignoring pos2.`);
                pos2 = undefined;
            }
        }

        // Check Chest 1 settings (armor, slot lock, and useSecondChest)
        const chest1Inventory = (block1.getComponent("inventory") as BlockInventoryComponent).container;

        // 5番目のアイテムが paper で名前が "true" ならアーマースロットをロック
        const lockArmor = chest1Inventory?.getItem(5)?.typeId === "minecraft:paper" && chest1Inventory?.getItem(5)?.nameTag === "true";

        // 6番目のアイテムが paper で名前が "true" ならホットバーとインベントリをロック
        const lockHotbarAndInventory = chest1Inventory?.getItem(6)?.typeId === "minecraft:paper" && chest1Inventory?.getItem(6)?.nameTag === "true";

        const useSecondChest = chest1Inventory?.getItem(7)?.typeId === "minecraft:diamond_block";


        if (pos2 && !useSecondChest) {
            console.warn(`pos2 provided but chest1 setting indicates not to use it. Ignoring pos2.`);
            pos2 = undefined;
        }
        if (!pos2 && useSecondChest) {
            console.warn(`Chest 1 setting says to use second chest, but pos2 not provided.`);
            pos2 = undefined; // pos2をundefinedにする
        }
        this.registeredKits.push({
            name,
            armorPos: pos1,
            hotbarPos: pos1,
            inventoryPos: pos2,
            useSecondPos: !!pos2, //pos2があるかどうか
            lockHotbar: lockHotbarAndInventory, // 6番目のアイテムでホットバーとインベントリ両方を制御
            lockArmor: lockArmor,              // 5番目のアイテムでアーマーを制御
            lockInventory: lockHotbarAndInventory, // 6番目のアイテムでホットバーとインベントリ両方を制御
            dimension,
        });

        console.warn(`Kit '${name}' registered successfully.`);
    }

    // Helper function to copy items from a chest to a player's inventory/hotbar
    private giveItemsFromChest(player: Player, chestPos: Vector3, startSlot: number, endSlot: number, inventoryType: 'hotbar' | 'inventory'): void {
        const dimension = player.dimension;
        const chestBlock = dimension.getBlock(chestPos);
        if (!chestBlock) return;

        const chestInventory = (chestBlock.getComponent("inventory") as BlockInventoryComponent).container;
        const playerInventory = player.getComponent("inventory");

        if (!chestInventory || !playerInventory) return;

        //@ts-ignore
        const playerContainer = playerInventory.container as Container;

        for (let i = startSlot; i <= endSlot; i++) {
            const chestItem = chestInventory.getItem(i);
            if (chestItem) {
                try {
                    // Add the item to the player's inventory
                    if (inventoryType === 'hotbar') {
                        playerContainer.setItem(i - startSlot, chestItem);
                    }
                    else {
                        playerContainer.setItem(i + 9, chestItem);
                    }

                } catch (error) {
                    console.error(`Error adding item to player inventory: ${error}`);
                }
            }
        }
    }

    // Helper function to copy armor items and handle locking
    private giveArmorFromChest(player: Player, chestPos: Vector3, lockArmor: boolean): void {
        const dimension = player.dimension;
        const chestBlock = dimension.getBlock(chestPos);
        if (!chestBlock) return;

        const chestInventory = (chestBlock.getComponent("inventory") as BlockInventoryComponent).container;
        const equipment = player.getComponent("equippable");
        if (!chestInventory || !equipment) return;

        const armorSlots = [
            { slot: EquipmentSlot.Head, chestSlot: 0 },
            { slot: EquipmentSlot.Chest, chestSlot: 1 },
            { slot: EquipmentSlot.Legs, chestSlot: 2 },
            { slot: EquipmentSlot.Feet, chestSlot: 3 },
        ];

        for (const armorSlot of armorSlots) {
            const itemStack = chestInventory.getItem(armorSlot.chestSlot);
            if (itemStack) {
                if (lockArmor) {
                    itemStack.lockMode = ItemLockMode.slot; // Lock armor to slot
                }
                try {
                    equipment.setEquipment(armorSlot.slot, itemStack);
                } catch (error) {
                    console.error(`Error setting armor: ${error}`);
                }
            }
        }
    }

    private applyEnchantmentsFromChest(player: Player, chest: Container) {
        const enchantSlots = [18, 19, 20, 21, 22, 23, 24, 25, 26];
        const hotbarSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8]
        const playerInventory = player.getComponent("inventory");

        if (!chest || !playerInventory) {
            return;  // Exit if chest or player inventory is invalid
        }
        //@ts-ignore
        const playerContainer = playerInventory.container as Container;

        for (let i = 0; i < enchantSlots.length; i++) {
            const enchantItem = chest.getItem(enchantSlots[i]);
            const playerItem = playerContainer.getItem(hotbarSlots[i]);

            if (enchantItem && enchantItem.typeId.startsWith("minecraft:enchanted_book") && playerItem) {
                const enchantable = playerItem.getComponent('enchantable');

                if (enchantable) {
                    // Get the enchantments from the enchanted book
                    const bookEnchantments = enchantItem.getComponent('enchantable');
                    if (!bookEnchantments) continue;
                    const bookEnchantmentList = bookEnchantments.getEnchantments();

                    // Apply each enchantment from the book to the item
                    for (const enchantment of bookEnchantmentList) {
                        try {
                            enchantable.addEnchantment(enchantment);
                        } catch (error) {
                        }
                    }
                }
            }
        }
    }


    public giveKitByName(player: Player, kitName: string): void {
        const registeredKit = this.registeredKits.find(kit => kit.name === kitName);
        if (!registeredKit) {
            player.sendMessage(`§cKit '${kitName}' not found.`);
            return;
        }

        this.clearInventory(player);

        // Give armor
        this.giveArmorFromChest(player, registeredKit.armorPos, registeredKit.lockArmor);

        // Give hotbar items
        this.giveItemsFromChest(player, registeredKit.hotbarPos, 18, 26, 'hotbar');
        const chest1 = (player.dimension.getBlock(registeredKit.hotbarPos)?.getComponent("inventory") as BlockInventoryComponent).container;
        if (chest1) {
            this.applyEnchantmentsFromChest(player, chest1);
        }

        // Give inventory items
        if (registeredKit.inventoryPos) {
            this.giveItemsFromChest(player, registeredKit.inventoryPos, 0, 26, 'inventory');
        }


        // Apply ItemLockMode for hotbar (if applicable)
        if (registeredKit.lockHotbar) {
            const inventory = player.getComponent("inventory");
            //@ts-ignore
            const container = inventory.container as Container;
            for (let i = 0; i < 9; i++) {
                const item = container.getItem(i);
                if (item) {
                    item.lockMode = ItemLockMode.inventory;
                    container.setItem(i, item);
                }
            }
        }


        // Apply ItemLockMode for inventory (if applicable)
        if (registeredKit.lockInventory) {
            const inventory = player.getComponent("inventory");
            //@ts-ignore
            const container = inventory.container as Container;
            for (let i = 9; i < 36; i++) {
                const item = container.getItem(i);
                if (item) {
                    item.lockMode = ItemLockMode.inventory;
                    container.setItem(i, item);
                }
            }
        }
    }

    private onPlayerJoin(event: PlayerJoinAfterEvent): void {
        const playerName = event.playerName;
        if (this.leftPlayers.has(playerName)) {
            system.runTimeout(() => {
                const player = world.getAllPlayers().find((p) => p.name === playerName);
                if (player) {
                    system.run(() => {
                        this.cleanupAfterDuelForRejoin(player);
                    });
                }
                this.leftPlayers.delete(playerName);
            }, 20 * 5)
        }
    }

    private cleanupAfterDuelForRejoin(player: Player): void {
        // インベントリのクリア
        if (this.activeDuels.has(player.name)) this.activeDuels.delete(player.name)
        this.clearInventory(player);

        // スコアボードからの削除
        this.removePlayerFromScoreboard(player, SCOREBOARD_OBJECTIVES.DUEL_RUNNING);

        // タグの削除
        player.removeTag(DUELING_PLAYER_TAG);

        // ゲームモードのリセット (必要に応じて)
        player.setGameMode(GameMode.adventure);
        const duelInfo = this.activeDuels.get(player.name);
        if (duelInfo) {
            const duelConfig = this.duelConfigs[duelInfo.map];
            this.teleportPlayer(player, duelConfig.endPos, player.dimension);
        } else {
            this.teleportPlayer(player, { x: 0, y: 0, z: 0 }, player.dimension);
        }
    }

    public leaveDuel(player: Player): void {
        const playerName = player.name;

        const queueIndex = this.autoMatchQueue.indexOf(playerName);
        if (queueIndex > -1) {
            this.autoMatchQueue.splice(queueIndex, 1);
            player.sendMessage("§a自動マッチングキューから退出しました。");
        }

        if (this.activeDuels.has(playerName)) {
            const duelInfo = this.activeDuels.get(playerName);
            if (!duelInfo) return;

            const otherPlayerName = Array.from(this.activeDuels.keys()).find(
                (name) => name !== playerName && this.activeDuels.get(name)?.map === duelInfo.map
            );

            if (otherPlayerName) {
                const otherPlayer = world.getAllPlayers().find((p) => p.name === otherPlayerName);
                if (otherPlayer) {
                    this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.WIN_COUNT).addScore(otherPlayer, 1);
                    this.updateAdjustedWins(otherPlayer, 1);
                    this.celebrateWinner(otherPlayer, undefined, playerName);
                    system.runTimeout(() => {
                        this.cleanupAfterDuel(otherPlayer, undefined, playerName);

                    }, 100);
                } else {
                    this.activeDuels.delete(playerName);
                }
            }
            this.activeDuels.delete(playerName);
            this.clearInventory(player)
            this.removePlayerFromScoreboard(player, SCOREBOARD_OBJECTIVES.DUEL_RUNNING)
            player.removeTag(DUELING_PLAYER_TAG);
            this.leftPlayers.add(player.name);

            const duelConfig = this.duelConfigs[duelInfo.map];

            if (duelConfig) {
                player.teleport(duelConfig.endPos, { dimension: world.getDimension("overworld") });

            }
            player.sendMessage("§aデュエルから退出しました。");


        }
        this.duelRequests = this.duelRequests.filter(req => {
            if (req.requester === playerName || req.target === playerName) {
                const otherPlayerName = req.requester === playerName ? req.target : req.requester;
                const otherPlayer = world.getAllPlayers().find(p => p.name === otherPlayerName);
                if (otherPlayer) {
                    otherPlayer.sendMessage(`§c${playerName} がデュエルリクエストをキャンセルしました。`);
                }
                return false;
            }
            return true;
        });
    }



    private onPlayerLeave(playerName: string): void {
        const index = this.autoMatchQueue.indexOf(playerName);
        if (index > -1) {
            this.autoMatchQueue.splice(index, 1);
        }

        if (this.activeDuels.has(playerName)) {
            const duelInfo = this.activeDuels.get(playerName);
            if (!duelInfo) return;

            const otherPlayerName = Array.from(this.activeDuels.keys()).find(
                (name) => name !== playerName && this.activeDuels.get(name)?.map === duelInfo.map
            );

            if (otherPlayerName) {
                const otherPlayer = world.getAllPlayers().find((p) => p.name === otherPlayerName);
                if (otherPlayer) {
                    this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.WIN_COUNT).addScore(otherPlayer, 1);
                    this.updateAdjustedWins(otherPlayer, 1);
                    this.celebrateWinner(otherPlayer, undefined, playerName);
                    system.runTimeout(() => {
                        this.cleanupAfterDuel(otherPlayer, undefined, playerName);

                    }, 100);
                }
            }
            this.activeDuels.delete(playerName);
            this.leftPlayers.add(playerName); // 退出したプレイヤーを記録

        }
        this.duelRequests = this.duelRequests.filter(req => {
            if (req.requester === playerName || req.target === playerName) {
                return false;
            }
            return true;
        });
    }


    private onEntityHitEntity(event: EntityHitEntityAfterEvent): void {
        const { damagingEntity, hitEntity } = event;

        if (damagingEntity instanceof Player && hitEntity instanceof Player && this.activeDuels.has(damagingEntity.name)) {
            this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.ATTACK_COUNT).addScore(damagingEntity, 1);
        }
    }

    public addDuelConfig(name: string, config: DuelConfig): void {
        this.duelConfigs[name] = config;
    }

    public clearInventory(player: Player): void {
        const inventory = player.getComponent("inventory");
        if (!inventory) return;

        //@ts-ignore
        inventory.container.clearAll();

        const equipment = player.getComponent("equippable");
        if (!equipment) return;
        equipment.setEquipment(EquipmentSlot.Head, undefined);
        equipment.setEquipment(EquipmentSlot.Chest, undefined);
        equipment.setEquipment(EquipmentSlot.Legs, undefined);
        equipment.setEquipment(EquipmentSlot.Feet, undefined);

    }

    private teleportPlayer(player: Player, location: Vector3, dimension: Dimension): void {
        system.run(() => {
            try {
                player.teleport(location, { dimension });
            } catch (error) {
                console.error(`[teleportPlayer] Teleport failed: ${error}`);
            }
        });
    }

    private findAvailableMap(): string | null {
        const usedMaps = new Set<string>();
        for (const duelInfo of this.activeDuels.values()) {
            usedMaps.add(duelInfo.map);
        }

        for (const mapName in this.duelConfigs) {
            if (!usedMaps.has(mapName)) {
                return mapName;
            }
        }

        return null;
    }

    private isMapInUse(mapName: string): boolean {
        for (const duelInfo of this.activeDuels.values()) {
            if (duelInfo.map === mapName) {
                return true;
            }
        }
        return false;
    }

    private getScoreboardObjective(objectiveName: string): ScoreboardObjective {
        let objective = world.scoreboard.getObjective(objectiveName);
        if (!objective) {
            objective = world.scoreboard.addObjective(objectiveName, objectiveName);
        }
        return objective;
    }

    public getPlayerScore(player: Player, objectiveName: string): number {
        try {
            return this.getScoreboardObjective(objectiveName).getScore(player) ?? 0;
        } catch (error) {
            return 0;
        }
    }

    private setPlayerScoreboard(player: Player, objectiveName: string, score: number): void {
        const objective = this.getScoreboardObjective(objectiveName);
        try {
            objective.setScore(player, score);
        } catch (error) {
        }
    }

    private removePlayerFromScoreboard(player: Player, objectiveName: string): void {
        const objective = this.getScoreboardObjective(objectiveName);
        try {
            objective.removeParticipant(player);
        }
        catch (error) {
        }
    }

    private calculateWinRate(wins: number, totalGames: number): number {
        if (totalGames === 0) {
            return 0;
        }
        return Math.floor((wins / totalGames) * 100);
    }
    private updateAdjustedWins(player: Player, deltaWins: number): void {
        const objective = this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.ADJUSTED_WINS);
        let currentAdjustedWins = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.ADJUSTED_WINS) ?? 0;  // 既存の調整済み勝利数を取得
        objective.setScore(player, currentAdjustedWins + deltaWins);  // スコアを更新
    }
    private updateWinRate(player: Player): void {
        const totalGames = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.TOTAL_GAMES);
        const wins = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.WIN_COUNT); // 調整された勝利数を使用
        const winRate = this.calculateWinRate(wins, totalGames); // 調整された勝利数で勝率を計算
        this.setPlayerScoreboard(player, SCOREBOARD_OBJECTIVES.WIN_RATE, winRate);
    }

    private updateMaxKillstreak(player: Player): void {
        const currentKillstreak = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.KILLSTREAK);
        const maxKillstreak = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK);
        if (currentKillstreak > maxKillstreak) {
            this.setPlayerScoreboard(player, SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK, currentKillstreak);
        }
    }




    private getInterPlayerKills(killer: Player, target: Player): number {
        const objective = this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_KILL);
        const scoreId = `${killer.name}:${target.name}`;
        const participant = objective.getParticipants().find((p) => p.displayName === scoreId);
        return participant ? (objective.getScore(participant) ?? 0) : 0;
    }

    private addInterPlayerKill(killer: Player, target: Player): void {
        const objective = this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_KILL);
        const scoreId = `${killer.name}:${target.name}`;
        let score = this.getInterPlayerKills(killer, target);
        objective.setScore(scoreId, ++score);
    }

    public startDuel(player1Name: string, player2Name: string, mapName: string): void {
        const player1 = world.getAllPlayers().find((p) => p.name === player1Name);
        const player2 = world.getAllPlayers().find((p) => p.name === player2Name);
        const duelConfig = this.duelConfigs[mapName];
        const dimension = world.getDimension("overworld");

        if (!player1 || !player2 || !duelConfig) return;

        if (!player1.hasTag(DUEL_PLAYER_TAG) || !player2.hasTag(DUEL_PLAYER_TAG)) {
            player1.sendMessage("§cあなたは対戦相手にデュエルを行う権限がありません。");
            return;
        }

        if (this.activeDuels.has(player1Name) || this.activeDuels.has(player2Name)) {
            player1.sendMessage("§c対戦相手は既にデュエル中です。");
            return;
        }

        this.activeDuels.set(player1Name, { map: mapName });
        this.activeDuels.set(player2Name, { map: mapName });

        player1.addTag(DUELING_PLAYER_TAG);
        player2.addTag(DUELING_PLAYER_TAG);

        this.setPlayerScoreboard(player1, SCOREBOARD_OBJECTIVES.DUEL_RUNNING, 1);
        this.setPlayerScoreboard(player2, SCOREBOARD_OBJECTIVES.DUEL_RUNNING, 1);
        this.setPlayerScoreboard(player1, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
        this.setPlayerScoreboard(player2, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);

        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_GAMES).addScore(player1, 1);
        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_GAMES).addScore(player2, 1);
        this.updateAdjustedWins(player1, 0);  // 新規デュエル開始時に調整済み勝利数を0に設定
        this.updateAdjustedWins(player2, 0);

        this.clearInventory(player1);
        this.clearInventory(player2);
        const registeredKit = this.registeredKits.find(kit => kit.name === duelConfig.kit);
        if (registeredKit) {
            this.giveKitByName(player1, duelConfig.kit);
            this.giveKitByName(player2, duelConfig.kit);
        } else {
            console.warn(`Registered kit not found for '${duelConfig.kit}'. Using legacy kit.`);
            return;
        }

        let countdown = 3;
        const countdownInterval = system.runInterval(() => {
            this.teleportPlayer(player1, duelConfig.pos1, dimension);
            this.teleportPlayer(player2, duelConfig.pos2, dimension);
            system.run(() => {
                player1.runCommand(`effect @s instant_health 1 255 true`);
                player2.runCommand(`effect @s instant_health 1 255 true`);
                player1.runCommand(`effect @s saturation 5 255 true`);
                player2.runCommand(`effect @s saturation 5 255 true`);
                system.runTimeout(() => {
                    player1.runCommand(`effect @s clear`);
                    player2.runCommand(`effect @s clear`);
                }, 20)
            })

            if (countdown > 0) {
                player1.onScreenDisplay.setActionBar(`§l${countdown}`);
                player2.onScreenDisplay.setActionBar(`§l${countdown}`);
                player1.playSound("random.orb");
                player2.playSound("random.orb");
                countdown--;
            } else {
                player1.onScreenDisplay.setActionBar("§l§a開始!");
                player2.onScreenDisplay.setActionBar("§l§a開始!");
                player1.playSound("conduit.activate");
                player2.playSound("conduit.activate");
                system.clearRun(countdownInterval);

                const onPlayerLeave = world.afterEvents.playerLeave.subscribe((event) => {
                    if (event.playerName === player1Name) {
                        this.cleanupAfterDuel(player2, player1);
                        world.afterEvents.playerLeave.unsubscribe(onPlayerLeave);
                    } else if (event.playerName === player2Name) {
                        this.cleanupAfterDuel(player1, player2);
                        world.afterEvents.playerLeave.unsubscribe(onPlayerLeave);
                    }
                });

                const onPlayerDie = world.afterEvents.entityDie.subscribe((event) => {
                    if (!(event.deadEntity instanceof Player)) return;

                    const deadPlayer = event.deadEntity;
                    const killer = event.damageSource?.damagingEntity;

                    if (deadPlayer.name !== player1Name && deadPlayer.name !== player2Name) return;

                    this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.DEATH_COUNT).addScore(deadPlayer, 1);
                    if (this.getPlayerScore(deadPlayer, SCOREBOARD_OBJECTIVES.KILLSTREAK) > 0) {
                        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.KILLSTREAK).setScore(deadPlayer, 0);
                    }

                    if (killer instanceof Player) {
                        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_KILL).addScore(killer, 1);
                        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.KILLSTREAK).addScore(killer, 1);
                        this.updateMaxKillstreak(killer);
                        this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.WIN_COUNT).addScore(killer, 1);
                        this.updateAdjustedWins(killer, 1);
                        this.addInterPlayerKill(killer, deadPlayer);

                        this.celebrateWinner(killer, deadPlayer);
                        system.runTimeout(() => {
                            this.cleanupAfterDuel(killer, deadPlayer);
                        }, 100);
                    }
                    world.afterEvents.entityDie.unsubscribe(onPlayerDie);
                });
            }
        }, 20);
    }



    private celebrateWinner(winner: Player, loser?: Player, loserName?: string): void {
        const fireworkCount = 1;

        if (loser) {
            loser.setGameMode(GameMode.spectator);
            system.runTimeout(() => { this.teleportPlayer(loser, winner.location, loser.dimension); }, 20)

        }

        const run = system.runInterval(() => {
            for (let i = 0; i < fireworkCount; i++) {
                const offset = {
                    x: (Math.random() - 0.5) * 6,
                    y: Math.random() * 3,
                    z: (Math.random() - 0.5) * 6
                };
                const spawnLocation = {
                    x: winner.location.x + offset.x,
                    y: winner.location.y + offset.y,
                    z: winner.location.z + offset.z,
                }
                system.run(() => winner.runCommand(`/summon fireworks_rocket ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z}`))
            }
        }, 10)
        run
        winner.sendMessage(`§6[デュエル]§r §aWiner§f:§b${winner.name} ${loser ? `§cLoser§f:§b${loser.name}` : `§cLoser§f:§b${loserName}`}`);
        winner.sendMessage(`§a最大連続キル数: §r${this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK)}`);
        if (loser) {
            loser.sendMessage(`§6[デュエル]§r §aWiner§f:§b${winner.name} §cLoser§f:§b${loser.name}`);
            loser.sendMessage(`§a最大連続キル数: §r${this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK)}`);

        }
        system.runTimeout(() => {
            system.clearRun(run);
        }, 20 * 5)
    }


    private cleanupAfterDuel(winner: Player, loser?: Player, _loserName?: string): void {
        winner.removeTag(DUELING_PLAYER_TAG);
        if (loser) loser.removeTag(DUELING_PLAYER_TAG);

        const winnerOldWinRate = this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.WIN_RATE);

        this.updateWinRate(winner);

        const winnerNewWinRate = this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.WIN_RATE);

        const winnerWinRateChange = winnerNewWinRate - winnerOldWinRate

        const winnerAttackCount = this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.ATTACK_COUNT);

        const duelConfig = this.duelConfigs[this.activeDuels.get(winner.name)?.map ?? "normal"];

        if (this.activeDuels.has(winner.name)) {
            this.activeDuels.delete(winner.name);
            this.removePlayerFromScoreboard(winner, SCOREBOARD_OBJECTIVES.DUEL_RUNNING);
            this.clearInventory(winner);
        }
        if (loser && this.activeDuels.has(loser.name)) {
            this.activeDuels.delete(loser.name);
            this.removePlayerFromScoreboard(loser, SCOREBOARD_OBJECTIVES.DUEL_RUNNING);
            this.clearInventory(loser);
        }
        if (!duelConfig) return;

        this.teleportPlayer(winner, duelConfig.endPos, winner.dimension);
        winner.setGameMode(GameMode.adventure);
        if (loser) {
            loser.setGameMode(GameMode.adventure);
            this.teleportPlayer(loser, duelConfig.endPos, loser.dimension);
        }



        winner.sendMessage(`§6[デュエル結果]§r あなたの勝利！`);
        winner.sendMessage(`§a勝率の変化: §r${winnerWinRateChange.toFixed(0)}% (${winnerOldWinRate.toFixed(0)}% -> ${winnerNewWinRate.toFixed(0)}%)`);
        winner.sendMessage(`§a攻撃回数: §r${winnerAttackCount}`);


        if (loser) {
            const loserOldWinRate = this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.WIN_RATE);

            this.updateWinRate(loser);

            const loserNewWinRate = this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.WIN_RATE);
            const loserWinRateChange = loserNewWinRate - loserOldWinRate
            const loserAttackCount = this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.ATTACK_COUNT);
            loser.sendMessage(`§6[デュエル結果]§r あなたの敗北！`);
            loser.sendMessage(`§a勝率の変化: §r${loserWinRateChange.toFixed(0)}% (${loserOldWinRate.toFixed(0)}% -> ${loserNewWinRate.toFixed(0)}%)`);
            loser.sendMessage(`§a攻撃回数: §r${loserAttackCount}`);


            winner.sendMessage(`§6--- ${loser.name} のデュエルステータス ---`);
            winner.sendMessage(`§a合計キル数: §r${this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.TOTAL_KILL)}`);
            winner.sendMessage(`§aキルストリーク: §r${this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.KILLSTREAK)}`);
            winner.sendMessage(`§a勝率: §r${(this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.WIN_RATE)).toFixed(0)}%`);
            winner.sendMessage(`§a勝利数: §r${this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.WIN_COUNT)}`);
            winner.sendMessage(`§a敗北数: §r${this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.DEATH_COUNT)}`);

            loser.sendMessage(`§6--- ${winner.name} のデュエルステータス ---`);
            loser.sendMessage(`§a合計キル数: §r${this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.TOTAL_KILL)}`);
            loser.sendMessage(`§aキルストリーク: §r${this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.KILLSTREAK)}`);
            loser.sendMessage(`§a勝率: §r${(this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.WIN_RATE)).toFixed(0)}%`);
            loser.sendMessage(`§a勝利数: §r${this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.WIN_COUNT)}`);
            loser.sendMessage(`§a敗北数: §r${this.getPlayerScore(winner, SCOREBOARD_OBJECTIVES.DEATH_COUNT)}`);

        }
        this.setPlayerScoreboard(winner, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
        if (loser) this.setPlayerScoreboard(loser, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);

    }

    private processAutoMatchQueue(): void {
        if (this.autoMatchQueue.length < 2) return;

        const player1Name = this.autoMatchQueue.shift()!;
        const player2Name = this.autoMatchQueue.shift()!;
        const availableMap = this.findAvailableMap();

        if (availableMap) {
            this.startDuel(player1Name, player2Name, availableMap);
        } else {
            this.autoMatchQueue.unshift(player2Name);
            this.autoMatchQueue.unshift(player1Name);
            [player1Name, player2Name].forEach(playerName => {
                world.getAllPlayers().find(p => p.name === playerName)?.sendMessage("§c現在利用可能なデュエルマップがありません。しばらくお待ちください。");
            });
        }
    }

    private removeExpiredRequests(): void {
        const now = Date.now();
        this.duelRequests = this.duelRequests.filter(req => {
            const expired = now - req.timestamp > REQUEST_TIMEOUT;
            if (expired) {
                world.getAllPlayers().find(p => p.name === req.requester)?.sendMessage(`§c${req.target} へのリクエストは期限切れになりました。`);
            }
            return !expired;
        });
    }


    public displayStatus(player: Player, targetPlayerName: string): void {
        const targetPlayer = world.getAllPlayers().find((p) => p.name === targetPlayerName);

        const getScore = (objectiveName: string) => {
            const objective = this.getScoreboardObjective(objectiveName);
            return targetPlayer
                ? this.getPlayerScore(targetPlayer, objectiveName)
                : objective.getParticipants().find(p => p.displayName === targetPlayerName)
                    ? objective.getScore(objective.getParticipants().find(p => p.displayName === targetPlayerName)!)
                    : 0;
        };

        const totalKills = getScore(SCOREBOARD_OBJECTIVES.TOTAL_KILL);
        const killstreak = getScore(SCOREBOARD_OBJECTIVES.KILLSTREAK);
        const winRate = getScore(SCOREBOARD_OBJECTIVES.WIN_RATE) ?? 0;
        const winCount = getScore(SCOREBOARD_OBJECTIVES.WIN_COUNT);
        const deadCount = getScore(SCOREBOARD_OBJECTIVES.DEATH_COUNT);
        const totalGames = getScore(SCOREBOARD_OBJECTIVES.TOTAL_GAMES);

        player.sendMessage(`§6--- ${targetPlayerName} のデュエルステータス ---`);
        player.sendMessage(`§a合計キル数: §r${totalKills}`);
        player.sendMessage(`§aキルストリーク: §r${killstreak}`);
        player.sendMessage(`§a勝率: §r${winRate.toFixed(0)}%`);
        player.sendMessage(`§a勝利数: §r${winCount}`);
        player.sendMessage(`§a敗北数: §r${deadCount}`);
        player.sendMessage(`§a総試合数: §r${totalGames}`);
    }

    public async showDuelForm(player: Player): Promise<void> {
        if (!player.hasTag(DUEL_PLAYER_TAG)) {
            player.sendMessage(`§cデュエルを行う権限がありません。`);
            return;
        }

        const form = new ActionFormData()
            .title("デュエルメニュー")
            .button("デュエルリクエストを送信")
            .button("デュエルリクエストを確認")
            .button("自分のデュエルステータス")
            .button("他のプレイヤーのステータス")
            .button("自動マッチングに参加")
            .button("デュエル/マッチングから離脱");


        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) return;

        switch (response.selection) {
            case 0: this.showSendDuelRequestForm(player); break;
            case 1: this.showDuelRequestsForm(player); break;
            case 2: this.displayStatus(player, player.name); break;
            case 3: this.showOtherPlayerStatusForm(player); break;
            case 4: this.autoMatch(player); break;
            case 5: this.leaveDuel(player); break;
        }
    }

    private async showSendDuelRequestForm(player: Player): Promise<void> {
        const players = world.getAllPlayers()
            .filter(p => p.name !== player.name && p.hasTag(DUEL_PLAYER_TAG))


        if (players.length === 0) {
            player.sendMessage("§cオンラインのプレイヤーがいません。");
            return;
        }

        const playerListForm = new ActionFormData().title("プレイヤーを選択");
        players.forEach(p => playerListForm.button(p.name));

        //@ts-ignore
        const playerResponse = await playerListForm.show(player);
        if (playerResponse.canceled) return;

        const targetPlayerName = players[playerResponse.selection!].name;


        const mapSelectForm = new ActionFormData()

            .title("マップを選択")
            .button("ランダムマップ")
            .button("マップを指定");

        //@ts-ignore
        const mapResponse = await mapSelectForm.show(player);
        if (mapResponse.canceled) return;

        let mapNameToUse: string | undefined;
        if (mapResponse.selection === 0) { // ランダムマップが選択された場合
            const availableMaps = Object.keys(this.duelConfigs);
            const usableMaps = availableMaps.filter(map => !this.isMapInUse(map));

            if (usableMaps.length > 0) {

                const randomIndex = Math.floor(Math.random() * availableMaps.length);
                mapNameToUse = availableMaps[randomIndex];
            } else {
                player.sendMessage("§cデュエルマップが設定されていません。");
                return;
            }
        } else if (mapResponse.selection === 1) {
            const mapList = Object.keys(this.duelConfigs);

            if (mapList.length === 0) {
                player.sendMessage("§cデュエルマップが設定されていません。");
                return;
            }
            const selectMapForm = new ActionFormData().title("マップを選択");
            const usableMaps = mapList.filter(map => !this.isMapInUse(map));

            usableMaps.forEach(map => selectMapForm.button(map));

            //@ts-ignore
            const selectedMap = await selectMapForm.show(player);
            if (selectedMap.canceled) return;
            mapNameToUse = usableMaps[selectedMap.selection!];

            if (!mapNameToUse) {
                player.sendMessage("選択できるマップがありません.");
                return; // 処理を中断
            }
        }

        this.sendDuelRequest(player, targetPlayerName, mapNameToUse);
    }

    private async showDuelRequestsForm(player: Player): Promise<void> {
        const requests = this.duelRequests.filter(req => req.target === player.name);

        if (requests.length === 0) {
            player.sendMessage("§aデュエルリクエストはありません。");
            return;
        }

        const form = new ActionFormData().title("デュエルリクエスト");
        requests.forEach(req => form.button(`${req.requester} - ${req.map ?? "ランダム"} マップ`));

        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) return;

        const selectedRequest = requests[response.selection!];
        this.duelRequests = this.duelRequests.filter(req => req !== selectedRequest);


        // リクエスト受諾時も、マップが使用中かチェック
        let mapNameToUse = selectedRequest.map ?? this.findAvailableMap();
        if (mapNameToUse && this.isMapInUse(mapNameToUse)) {
            // mapが指定されていて、かつ使用中の場合.
            const availableMap = this.findAvailableMap();
            if (availableMap) {
                mapNameToUse = availableMap
            }
            else {
                player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                return;
            }
        }

        if (!mapNameToUse) {
            //findAvailableMapが使えない場合.
            player.sendMessage("§c現在利用可能なデュエルマップがありません。");
            return;
        }
        this.startDuel(selectedRequest.requester, player.name, mapNameToUse);
    }

    private async showOtherPlayerStatusForm(player: Player): Promise<void> {
        const players = world.getAllPlayers().filter(p => p.name !== player.name);
        if (players.length === 0) {
            player.sendMessage("§cオンラインのプレイヤーがいません。");
            return;
        }

        const form = new ActionFormData().title("プレイヤーを選択");
        players.forEach(p => form.button(p.name));

        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) return;

        this.displayStatus(player, players[response.selection!].name);
    }

    public autoMatch(player: Player): void {
        if (this.activeDuels.has(player.name) || this.autoMatchQueue.includes(player.name)) {
            player.sendMessage("§cあなたは既にデュエル中か、自動マッチングのキューに参加しています。");
            return;
        }
        this.autoMatchQueue.push(player.name);
        player.sendMessage("§a自動マッチングのキューに追加されました。");
    }

    private sendDuelRequest(requester: Player, targetName: string, map?: string): void {
        const targetPlayer = world.getAllPlayers().find(p => p.name === targetName);
        if (!targetPlayer) {
            requester.sendMessage("§cターゲットプレイヤーが見つかりません。");
            return;
        }

        if (this.activeDuels.has(targetName)) {
            requester.sendMessage("§cターゲットプレイヤーは既にデュエル中です。"); //修正: 自分の状態は確認しない。相手のみ
            return;
        }

        // map が undefined (指定されていない) または "ランダム" の場合、利用可能なマップを探す
        if (map === undefined) {
            map = this.findAvailableMap() ?? undefined;
            if (map === undefined) {
                requester.sendMessage("§c現在利用可能なデュエルマップがありません。");
                return;
            }
        } else if (!this.duelConfigs.hasOwnProperty(map)) {
            // map が指定されているが、duelConfigs に存在しない場合
            requester.sendMessage(`§c無効なマップが指定されました。`);
            return;

        } else if (this.isMapInUse(map)) { // 追加: 指定されたマップが使用中の場合
            requester.sendMessage("§c選択したマップは既に使用中です。他のマップを選択するか、ランダムを選択してください。");
            return;
        }


        if (this.duelRequests.some(req => req.requester === requester.name && req.target === targetName)) {
            requester.sendMessage("§c既にこのプレイヤーにリクエストを送信済みです。");
            return;
        }

        this.duelRequests.push({
            requester: requester.name,
            target: targetName,
            map,
            timestamp: Date.now(),
        });

        requester.sendMessage(`§a${targetName} にデュエルリクエストを送信しました ${map ? `(マップ: ${map})` : ""}`);
        targetPlayer.sendMessage(`§a${requester.name} からデュエルリクエストを受信しました ${map ? `(マップ: ${map})` : ""}\nDuel§gUI§a§fアイテム又は\n申請してきたプレイヤーを右クリする事でも承諾できます。`);
    }

    public async show(player: Player): Promise<void> {
        if (!player.hasTag(DUEL_PLAYER_TAG)) {
            player.sendMessage(`§cデュエルを行う権限がありません。`);
            return;
        }

        const viewDirectionEntities = player.getEntitiesFromViewDirection();

        if (!viewDirectionEntities || viewDirectionEntities.length === 0 || !viewDirectionEntities[0].entity) {
            player.sendMessage(`§c見ている先にプレイヤーがいません。`);
            return;
        }

        const nearbyPlayersHit: EntityRaycastHit = viewDirectionEntities[0];
        const nearbyPlayers: Entity = nearbyPlayersHit.entity;

        if (nearbyPlayers.typeId !== 'minecraft:player') {
            player.sendMessage(`§c見ている先にプレイヤーがいません。`);
            return;
        }

        if (!(nearbyPlayers instanceof Player)) {
            throw new Error('Invalid target type.');
        }

        const existingRequest = this.duelRequests.find(req => req.requester === player.name && req.target === nearbyPlayers.name);

        if (existingRequest) {
            const messageForm = new MessageFormData()
                .title("デュエルリクエスト")
                .body(`${nearbyPlayers.name} へのデュエルリクエストをキャンセルしますか？`)
                .button1("はい").button2("いいえ");

            //@ts-ignore
            const response = await messageForm.show(player);
            if (response.selection === 0) {
                this.duelRequests = this.duelRequests.filter(req => req !== existingRequest);
                player.sendMessage("§aデュエルリクエストをキャンセルしました。");
            }
        } else {
            const incomingRequest = this.duelRequests.find(req => req.requester === nearbyPlayers.name && req.target === player.name);
            if (incomingRequest) {
                const messageForm = new MessageFormData()
                    .title("デュエルリクエスト")
                    .body(`${nearbyPlayers.name} からのデュエルリクエストを承諾しますか？`)
                    .button1("承諾").button2("拒否");

                //@ts-ignore
                const response = await messageForm.show(player);
                if (response.selection === 0) {
                    // リクエスト受諾時も、マップが使用中かチェック
                    let mapNameToUse = incomingRequest.map ?? this.findAvailableMap();
                    if (mapNameToUse && this.isMapInUse(mapNameToUse)) {
                        // mapが指定されていて、かつ使用中の場合.
                        const availableMap = this.findAvailableMap();
                        if (availableMap) {
                            mapNameToUse = availableMap
                        }
                        else {
                            player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                            return;
                        }
                    }

                    if (!mapNameToUse) {
                        //findAvailableMapが使えない場合.
                        player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                        return;
                    }
                    this.startDuel(incomingRequest.requester, player.name, mapNameToUse);
                    this.duelRequests = this.duelRequests.filter(req => req !== incomingRequest);
                } else {
                    this.duelRequests = this.duelRequests.filter(req => req !== incomingRequest);
                    player.sendMessage(`§a${nearbyPlayers.name} からのデュエルリクエストを拒否しました。`);
                    nearbyPlayers.sendMessage(`§c${player.name} がデュエルリクエストを拒否しました。`);
                }
            } else {
                const messageForm = new MessageFormData()
                    .title("デュエルリクエスト")
                    .body(`${nearbyPlayers.name} にデュエルを申し込みますか？`)
                    .button1("はい").button2("いいえ");

                //@ts-ignore
                const response = await messageForm.show(player);
                if (response.selection === 0) {
                    const mapSelectForm = new ActionFormData()
                        .title("マップを選択")
                        .button("ランダムマップ")
                        .button("マップを指定");

                    //@ts-ignore
                    const mapResponse = await mapSelectForm.show(player);
                    if (mapResponse.canceled) return;

                    let mapNameToUse: string | undefined;

                    if (mapResponse.selection === 0) { // ランダムマップの処理
                        const availableMaps = Object.keys(this.duelConfigs);
                        if (availableMaps.length > 0) {
                            const randomIndex = Math.floor(Math.random() * availableMaps.length);
                            mapNameToUse = availableMaps[randomIndex];
                        } else {
                            player.sendMessage("§cデュエルマップが設定されていません。");
                            return;
                        }

                    } else if (mapResponse.selection === 1) {
                        const mapList = Object.keys(this.duelConfigs);
                        if (mapList.length === 0) {
                            player.sendMessage("§cデュエルマップが設定されていません。");
                            return;
                        }
                        const selectMapForm = new ActionFormData().title("マップを選択");
                        mapList.forEach(map => selectMapForm.button(map));

                        //@ts-ignore
                        const selectedMap = await selectMapForm.show(player);
                        if (selectedMap.canceled) return;
                        mapNameToUse = mapList[selectedMap.selection!];

                        if (mapNameToUse && this.isMapInUse(mapNameToUse)) {
                            player.sendMessage("§c選択したマップは既に使用中です。他のマップを選択してください。");
                            return; // 処理を中断
                        }
                    }
                    this.sendDuelRequest(player, nearbyPlayers.name, mapNameToUse);

                }
            }
        }
    }
}