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
    ScoreboardIdentityType,
} from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

export interface DuelConfig {
    name: string;
    pos1: Vector3;
    pos2: Vector3;
    kit: string;
    endPos: Vector3;
    startCommands?: string[];
    endCommands?: string[];
}

export interface DuelRequest {
    requester: string;
    target: string;
    map?: string;
    timestamp: number;
}

interface ActiveDuelInfo {
    map: string;
    team1: string;
    team2: string;
}

export interface RegisteredKit {
    name: string;
    armorPos: Vector3;
    hotbarPos: Vector3;
    inventoryPos?: Vector3;
    useSecondPos: boolean;
    lockHotbar: boolean;
    lockArmor: boolean;
    lockInventory: boolean;
    dimension: Dimension;
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
    ADJUSTED_WINS: "duel_adjustedWins",
};

const DUEL_PLAYER_TAG = "player_hub";
const DUELING_PLAYER_TAG = "player_duel";

async function showPaginatedMapSelectionForm(
    player: Player,
    availableMaps: string[],
    itemsPerPage: number = 5
): Promise<string | null> {
    if (availableMaps.length === 0) {
        player.sendMessage("§c選択できるマップがありません。");
        return null;
    }
    let currentPage = 0;
    const totalPages = Math.ceil(availableMaps.length / itemsPerPage);
    while (true) {
        const form = new ActionFormData().title(
            `§h§v§rマップを選択 (ページ ${currentPage + 1}/${totalPages})`
        );
        const startIndex = currentPage * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, availableMaps.length);
        const currentMapButtons: string[] = [];
        for (let i = startIndex; i < endIndex; i++) {
            form.button(availableMaps[i]);
            currentMapButtons.push(availableMaps[i]);
        }
        const hasPrevious = currentPage > 0;
        const hasNext = currentPage < totalPages - 1;
        let previousButtonIndex = -1;
        let nextButtonIndex = -1;
        const mapButtonCount = currentMapButtons.length;
        if (hasPrevious) {
            form.button("§l< 前へ");
            previousButtonIndex = mapButtonCount;
        }
        if (hasNext) {
            form.button("§l次へ >");
            nextButtonIndex = hasPrevious ? mapButtonCount + 1 : mapButtonCount;
        }
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) {
            return null;
        }
        const selection = response.selection!;
        if (hasPrevious && selection === previousButtonIndex) {
            currentPage--;
            continue;
        }
        if (hasNext && selection === nextButtonIndex) {
            currentPage++;
            continue;
        }
        if (selection >= 0 && selection < mapButtonCount) {
            const selectedMapIndex = startIndex + selection;
            if (selectedMapIndex < availableMaps.length) {
                return availableMaps[selectedMapIndex];
            }
        }
        console.warn(
            `[showPaginatedMapSelectionForm] Unexpected selection: ${selection}`
        );
        return null;
    }
}

export class DuelManager {
    private duelConfigs: Record<string, DuelConfig> = {};
    private duelRequests: DuelRequest[] = [];
    private autoMatchQueue: string[] = [];
    private activeDuels: Map<string, ActiveDuelInfo> = new Map();
    private leftPlayers: Set<string> = new Set();
    private registeredKits: RegisteredKit[] = [];
    public kits: { [key: string]: any } = {};
    constructor() {
        this.registerEvents();
    }
    private registerEvents() {
        system.runInterval(() => {
            this.removeExpiredRequests();
            this.processAutoMatchQueue();
        }, 20);
        world.afterEvents.entityHitEntity.subscribe((event) =>
            this.onEntityHitEntity(event)
        );
        world.afterEvents.playerLeave.subscribe((event) => {
            this.onPlayerLeave(event.playerName);
        });
        world.afterEvents.playerJoin.subscribe((event) => this.onPlayerJoin(event));
    }
    public registerKitChest(name: string, pos1: Vector3, pos2?: Vector3): void {
        const dimension = world.getDimension("overworld");
        if (this.registeredKits.some((kit) => kit.name === name)) {
            return;
        }
        const block1 = dimension.getBlock(pos1);
        if (!block1 || block1.typeId !== "minecraft:chest") {
            console.warn(`Block at pos1 is not a chest.`);
            return;
        }
        if (pos2) {
            const block2 = dimension.getBlock(pos2);
            if (block2 && block2.typeId === "minecraft:chest") {
            } else {
                console.warn(`pos2 provided, but block is not a chest. Ignoring pos2.`);
                pos2 = undefined;
            }
        }
        const chest1Inventory = (
            block1.getComponent("inventory") as BlockInventoryComponent
        ).container;
        const lockArmor =
            chest1Inventory?.getItem(5)?.typeId === "minecraft:paper" &&
            chest1Inventory?.getItem(5)?.nameTag === "true";
        const lockHotbarAndInventory =
            chest1Inventory?.getItem(6)?.typeId === "minecraft:paper" &&
            chest1Inventory?.getItem(6)?.nameTag === "true";
        const useSecondChest =
            chest1Inventory?.getItem(7)?.typeId === "minecraft:diamond_block";
        if (pos2 && !useSecondChest) {
            console.warn(
                `pos2 provided but chest1 setting indicates not to use it. Ignoring pos2.`
            );
            pos2 = undefined;
        }
        if (!pos2 && useSecondChest) {
            console.warn(
                `Chest 1 setting says to use second chest, but pos2 not provided.`
            );
            pos2 = undefined;
        }
        this.registeredKits.push({
            name,
            armorPos: pos1,
            hotbarPos: pos1,
            inventoryPos: pos2,
            useSecondPos: !!pos2,
            lockHotbar: lockHotbarAndInventory,
            lockArmor: lockArmor,
            lockInventory: lockHotbarAndInventory,
            dimension,
        });
        console.warn(`Kit '${name}' registered successfully.`);
    }
    private giveItemsFromChest(
        player: Player,
        chestPos: Vector3,
        startSlot: number,
        endSlot: number,
        inventoryType: "hotbar" | "inventory"
    ): void {
        const dimension = player.dimension;
        const chestBlock = dimension.getBlock(chestPos);
        if (!chestBlock) return;
        const chestInventory = (
            chestBlock.getComponent("inventory") as BlockInventoryComponent
        ).container;
        const playerInventory = player.getComponent("inventory");
        if (!chestInventory || !playerInventory) return;
        const playerContainer = playerInventory.container as Container;
        for (let i = startSlot; i <= endSlot; i++) {
            const chestItem = chestInventory.getItem(i);
            if (chestItem) {
                try {
                    if (inventoryType === "hotbar") {
                        playerContainer.setItem(i - startSlot, chestItem);
                    } else {
                        playerContainer.setItem(i + 9, chestItem);
                    }
                } catch (error) {
                    console.error(`Error adding item to player inventory: ${error}`);
                }
            }
        }
    }
    private giveArmorFromChest(
        player: Player,
        chestPos: Vector3,
        lockArmor: boolean
    ): void {
        const dimension = player.dimension;
        const chestBlock = dimension.getBlock(chestPos);
        if (!chestBlock) return;
        const chestInventory = (
            chestBlock.getComponent("inventory") as BlockInventoryComponent
        ).container;
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
                    itemStack.lockMode = ItemLockMode.slot;
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
        const hotbarSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const playerInventory = player.getComponent("inventory");
        if (!chest || !playerInventory) {
            return;
        }
        const playerContainer = playerInventory.container as Container;
        for (let i = 0; i < enchantSlots.length; i++) {
            const enchantItem = chest.getItem(enchantSlots[i]);
            const playerItem = playerContainer.getItem(hotbarSlots[i]);
            if (
                enchantItem &&
                enchantItem.typeId.startsWith("minecraft:enchanted_book") &&
                playerItem
            ) {
                const enchantable = playerItem.getComponent("enchantable");
                if (enchantable) {
                    const bookEnchantments = enchantItem.getComponent("enchantable");
                    if (!bookEnchantments) continue;
                    const bookEnchantmentList = bookEnchantments.getEnchantments();
                    for (const enchantment of bookEnchantmentList) {
                        try {
                            enchantable.addEnchantment(enchantment);
                        } catch (error) { }
                    }
                }
            }
        }
    }
    public giveKitByName(player: Player, kitName: string): void {
        const registeredKit = this.registeredKits.find(
            (kit) => kit.name === kitName
        );
        if (!registeredKit) {
            player.sendMessage(`§cKit '${kitName}' not found.`);
            return;
        }
        this.clearInventory(player);
        this.giveArmorFromChest(
            player,
            registeredKit.armorPos,
            registeredKit.lockArmor
        );
        this.giveItemsFromChest(player, registeredKit.hotbarPos, 18, 26, "hotbar");
        const chest1 = (
            player.dimension
                .getBlock(registeredKit.hotbarPos)
                ?.getComponent("inventory") as BlockInventoryComponent
        ).container;
        if (chest1) {
            this.applyEnchantmentsFromChest(player, chest1);
        }
        if (registeredKit.inventoryPos) {
            this.giveItemsFromChest(
                player,
                registeredKit.inventoryPos,
                0,
                26,
                "inventory"
            );
        }
        if (registeredKit.lockHotbar) {
            const inventory = player.getComponent("inventory");
            const container = inventory?.container as Container;
            for (let i = 0; i < 9; i++) {
                const item = container.getItem(i);
                if (item) {
                    item.lockMode = ItemLockMode.inventory;
                    container.setItem(i, item);
                }
            }
        }
        if (registeredKit.lockInventory) {
            const inventory = player.getComponent("inventory");
            const container = inventory?.container as Container;
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
            }, 20 * 5);
        }
    }
    private cleanupAfterDuelForRejoin(player: Player): void {
        if (this.activeDuels.has(player.name)) this.activeDuels.delete(player.name);
        this.clearInventory(player);
        this.removePlayerFromScoreboard(player, SCOREBOARD_OBJECTIVES.DUEL_RUNNING);
        player.removeTag(DUELING_PLAYER_TAG);
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
                (name) =>
                    name !== playerName &&
                    this.activeDuels.get(name)?.map === duelInfo.map
            );
            if (otherPlayerName) {
                const otherPlayer = world
                    .getAllPlayers()
                    .find((p) => p.name === otherPlayerName);
                if (otherPlayer) {
                    this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.WIN_COUNT).addScore(
                        otherPlayer,
                        1
                    );
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
            this.clearInventory(player);
            this.removePlayerFromScoreboard(
                player,
                SCOREBOARD_OBJECTIVES.DUEL_RUNNING
            );
            player.removeTag(DUELING_PLAYER_TAG);
            this.leftPlayers.add(player.name);
            const duelConfig = this.duelConfigs[duelInfo.map];
            if (duelConfig) {
                player.teleport(duelConfig.endPos, {
                    dimension: world.getDimension("overworld"),
                });
            }
            player.sendMessage("§aデュエルから退出しました。");
        }
        this.duelRequests = this.duelRequests.filter((req) => {
            if (req.requester === playerName || req.target === playerName) {
                const otherPlayerName =
                    req.requester === playerName ? req.target : req.requester;
                const otherPlayer = world
                    .getAllPlayers()
                    .find((p) => p.name === otherPlayerName);
                if (otherPlayer) {
                    otherPlayer.sendMessage(
                        `§c${playerName} がデュエルリクエストをキャンセルしました。`
                    );
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
                (name) =>
                    name !== playerName &&
                    this.activeDuels.get(name)?.map === duelInfo.map
            );
            if (otherPlayerName) {
                const otherPlayer = world
                    .getAllPlayers()
                    .find((p) => p.name === otherPlayerName);
                if (otherPlayer) {
                    this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.WIN_COUNT).addScore(
                        otherPlayer,
                        1
                    );
                    this.updateAdjustedWins(otherPlayer, 1);
                    this.celebrateWinner(otherPlayer, undefined, playerName);
                    system.runTimeout(() => {
                        this.cleanupAfterDuel(otherPlayer, undefined, playerName);
                    }, 100);
                }
            }
            this.activeDuels.delete(playerName);
            this.leftPlayers.add(playerName);
        }
        this.duelRequests = this.duelRequests.filter((req) => {
            if (req.requester === playerName || req.target === playerName) {
                return false;
            }
            return true;
        });
    }
    private onEntityHitEntity(event: EntityHitEntityAfterEvent): void {
        const { damagingEntity, hitEntity } = event;
        if (
            damagingEntity instanceof Player &&
            hitEntity instanceof Player &&
            this.activeDuels.has(damagingEntity.name)
        ) {
            this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.ATTACK_COUNT).addScore(
                damagingEntity,
                1
            );
        }
    }
    public addDuelConfig(name: string, config: DuelConfig): void {
        this.duelConfigs[name] = config;
    }
    public clearInventory(player: Player): void {
        const inventory = player.getComponent("inventory");
        if (!inventory) return;
        inventory.container.clearAll();
        const equipment = player.getComponent("equippable");
        if (!equipment) return;
        equipment.setEquipment(EquipmentSlot.Head, undefined);
        equipment.setEquipment(EquipmentSlot.Chest, undefined);
        equipment.setEquipment(EquipmentSlot.Legs, undefined);
        equipment.setEquipment(EquipmentSlot.Feet, undefined);
    }
    private teleportPlayer(
        player: Player,
        location: Vector3,
        dimension: Dimension
    ): void {
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
    private setPlayerScoreboard(
        player: Player,
        objectiveName: string,
        score: number
    ): void {
        const objective = this.getScoreboardObjective(objectiveName);
        try {
            objective.setScore(player, score);
        } catch (error) { }
    }
    private removePlayerFromScoreboard(
        player: Player,
        objectiveName: string
    ): void {
        const objective = this.getScoreboardObjective(objectiveName);
        try {
            objective.removeParticipant(player);
        } catch (error) { }
    }
    private calculateWinRate(wins: number, totalGames: number): number {
        if (totalGames === 0) {
            return 0;
        }
        return Math.floor((wins / totalGames) * 100);
    }
    private updateAdjustedWins(player: Player, deltaWins: number): void {
        const objective = this.getScoreboardObjective(
            SCOREBOARD_OBJECTIVES.ADJUSTED_WINS
        );
        let currentAdjustedWins =
            this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.ADJUSTED_WINS) ?? 0;
        objective.setScore(player, currentAdjustedWins + deltaWins);
    }
    private updateWinRate(player: Player): void {
        const totalGames = this.getPlayerScore(
            player,
            SCOREBOARD_OBJECTIVES.TOTAL_GAMES
        );
        const wins = this.getPlayerScore(player, SCOREBOARD_OBJECTIVES.WIN_COUNT);
        const winRate = this.calculateWinRate(wins, totalGames);
        this.setPlayerScoreboard(player, SCOREBOARD_OBJECTIVES.WIN_RATE, winRate);
    }
    private updateMaxKillstreak(player: Player): void {
        const currentKillstreak = this.getPlayerScore(
            player,
            SCOREBOARD_OBJECTIVES.KILLSTREAK
        );
        const maxKillstreak = this.getPlayerScore(
            player,
            SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK
        );
        if (currentKillstreak > maxKillstreak) {
            this.setPlayerScoreboard(
                player,
                SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK,
                currentKillstreak
            );
        }
    }
    private getInterPlayerKills(killer: Player, target: Player): number {
        const objective = this.getScoreboardObjective(
            SCOREBOARD_OBJECTIVES.TOTAL_KILL
        );
        const scoreId = `${killer.name}:${target.name}`;
        const participant = objective
            .getParticipants()
            .find((p) => p.displayName === scoreId);
        return participant ? objective.getScore(participant) ?? 0 : 0;
    }
    private addInterPlayerKill(killer: Player, target: Player): void {
        const objective = this.getScoreboardObjective(
            SCOREBOARD_OBJECTIVES.TOTAL_KILL
        );
        const scoreId = `${killer.name}:${target.name}`;
        let score = this.getInterPlayerKills(killer, target);
        objective.setScore(scoreId, ++score);
    }
    private executeCommands(
        player: Player,
        commands?: string[],
        team1Name?: string,
        team2Name?: string
    ): void {
        if (!commands || commands.length === 0) return;
        system.run(async () => {
            for (const command of commands) {
                if (!command) continue;
                try {
                    let formattedCommand = command.replace(/{playerName}/g, player.name);
                    if (team1Name) {
                        formattedCommand = formattedCommand.replace(/{team1}/g, team1Name);
                    }
                    if (team2Name) {
                        formattedCommand = formattedCommand.replace(/{team2}/g, team2Name);
                    }
                    if (
                        (formattedCommand.includes("{team1}") && !team1Name) ||
                        (formattedCommand.includes("{team2}") && !team2Name)
                    ) {
                        console.warn(
                            `[DuelManager][executeCommands] Command for ${player.name} might have unreplaced team placeholders because team names were not provided: "${formattedCommand}"`
                        );
                    }
                    player.runCommand(formattedCommand);
                } catch (error: any) {
                    const originalCommandSnippet =
                        command.substring(0, 80) + (command.length > 80 ? "..." : "");
                    console.warn(
                        `[DuelManager][executeCommands] Failed to execute command snippet for player ${player.name
                        }: "${originalCommandSnippet}". Error: ${error?.message ?? error}`
                    );
                }
            }
        });
    }
    public startDuel(
        player1Name: string,
        player2Name: string,
        mapName: string
    ): void {
        const player1 = world.getAllPlayers().find((p) => p.name === player1Name);
        const player2 = world.getAllPlayers().find((p) => p.name === player2Name);
        const duelConfig = this.duelConfigs[mapName];
        const dimension = world.getDimension("overworld");
        if (!player1 || !player2 || !duelConfig) {
            console.error(
                "[DuelManager][startDuel] Failed to start duel: Player or DuelConfig not found."
            );
            return;
        }
        if (!player1.hasTag(DUEL_PLAYER_TAG) || !player2.hasTag(DUEL_PLAYER_TAG)) {
            const message =
                "§cあなた、または対戦相手にデュエルを行う権限がありません。";
            try {
                player1.sendMessage(message);
            } catch {
            }
            try {
                player2.sendMessage(message);
            } catch {
            }
            return;
        }
        if (
            this.activeDuels.has(player1Name) ||
            this.activeDuels.has(player2Name)
        ) {
            const message =
                "§cあなた、または対戦相手は既に他のデュエルに参加中です。";
            try {
                player1.sendMessage(message);
            } catch { }
            try {
                player2.sendMessage(message);
            } catch { }
            return;
        }
        const duelInfo: ActiveDuelInfo = {
            map: mapName,
            team1: player1Name,
            team2: player2Name,
        };
        this.activeDuels.set(player1Name, duelInfo);
        this.activeDuels.set(player2Name, duelInfo);
        player1.addTag(DUELING_PLAYER_TAG);
        player2.addTag(DUELING_PLAYER_TAG);
        this.setPlayerScoreboard(player1, SCOREBOARD_OBJECTIVES.DUEL_RUNNING, 1);
        this.setPlayerScoreboard(player2, SCOREBOARD_OBJECTIVES.DUEL_RUNNING, 1);
        this.setPlayerScoreboard(player1, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
        this.setPlayerScoreboard(player2, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
        try {
            this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_GAMES).addScore(
                player1,
                1
            );
        } catch { }
        try {
            this.getScoreboardObjective(SCOREBOARD_OBJECTIVES.TOTAL_GAMES).addScore(
                player2,
                1
            );
        } catch { }
        try {
            this.updateAdjustedWins(player1, 0);
        } catch { }
        try {
            this.updateAdjustedWins(player2, 0);
        } catch { }
        this.clearInventory(player1);
        this.clearInventory(player2);
        const kitName = duelConfig.kit;
        const registeredKit = this.registeredKits.find(
            (kit) => kit.name === kitName
        );
        if (registeredKit) {
            try {
                this.giveKitByName(player1, kitName);
            } catch (e) {
                console.warn(`Failed to give kit ${kitName} to ${player1.name}`, e);
            }
            try {
                this.giveKitByName(player2, kitName);
            } catch (e) {
                console.warn(`Failed to give kit ${kitName} to ${player2.name}`, e);
            }
        } else {
            console.warn(
                `[DuelManager][startDuel] Registered kit not found for '${kitName}'. No kit applied.`
            );
            try {
                player1.sendMessage(
                    `§cエラー: 指定されたキット '${kitName}' が見つかりません。`
                );
            } catch { }
            try {
                player2.sendMessage(
                    `§cエラー: 指定されたキット '${kitName}' が見つかりません。`
                );
            } catch { }
        }
        let countdown = 3;
        const countdownInterval = system.runInterval(() => {
            try {
                this.teleportPlayer(player1, duelConfig.pos1, dimension);
                this.teleportPlayer(player2, duelConfig.pos2, dimension);
                player1.runCommand(`effect @s instant_health 1 255 true`);
                player2.runCommand(`effect @s instant_health 1 255 true`);
                player1.runCommand(`effect @s saturation 5 255 true`);
                player2.runCommand(`effect @s saturation 5 255 true`);
                system.runTimeout(() => {
                    try {
                        player1.runCommand(`effect @s clear`);
                    } catch { }
                    try {
                        player2.runCommand(`effect @s clear`);
                    } catch { }
                }, 10);
            } catch (e) {
                console.warn(
                    `[DuelManager][startDuel] Error during countdown effects/teleport: ${e}`
                );
                system.clearRun(countdownInterval);
                return;
            }
            if (countdown > 0) {
                const title = `§l${countdown}`;
                try {
                    player1.onScreenDisplay.setTitle(title);
                } catch { }
                try {
                    player2.onScreenDisplay.setTitle(title);
                } catch { }
                try {
                    player1.playSound("random.orb", { location: player1.location });
                } catch { }
                try {
                    player2.playSound("random.orb", { location: player2.location });
                } catch { }
                countdown--;
            } else {
                system.clearRun(countdownInterval);
                const startTitle = "§l§a >> 開始 <<";
                try {
                    player1.onScreenDisplay.setTitle(startTitle);
                } catch { }
                try {
                    player2.onScreenDisplay.setTitle(startTitle);
                } catch { }
                try {
                    player1.playSound("conduit.activate", { location: player1.location });
                } catch { }
                try {
                    player2.playSound("conduit.activate", { location: player2.location });
                } catch { }
                console.log(
                    `[DuelManager][startDuel] Executing start commands for map ${mapName}...`
                );
                this.executeCommands(
                    player1,
                    duelConfig.startCommands,
                    player1.name,
                    player2.name
                );
                this.executeCommands(
                    player2,
                    duelConfig.startCommands,
                    player1.name,
                    player2.name
                );
                let onPlayerLeaveSubscription: any = null;
                let onPlayerDieSubscription: any = null;
                const unsubscribeListeners = () => {
                    if (onPlayerLeaveSubscription) {
                        try {
                            world.afterEvents.playerLeave.unsubscribe(
                                onPlayerLeaveSubscription
                            );
                        } catch (e) {
                            console.warn("Error unsubscribing playerLeave", e);
                        }
                        onPlayerLeaveSubscription = null;
                    }
                    if (onPlayerDieSubscription) {
                        try {
                            world.afterEvents.entityDie.unsubscribe(onPlayerDieSubscription);
                        } catch (e) {
                            console.warn("Error unsubscribing entityDie", e);
                        }
                        onPlayerDieSubscription = null;
                    }
                };
                onPlayerLeaveSubscription = world.afterEvents.playerLeave.subscribe(
                    (event) => {
                        const leftPlayerName = event.playerName;
                        const duelInfo = this.activeDuels.get(leftPlayerName);
                        if (
                            duelInfo &&
                            (leftPlayerName === duelInfo.team1 ||
                                leftPlayerName === duelInfo.team2)
                        ) {
                            console.log(
                                `[DuelManager] Player ${leftPlayerName} left during duel.`
                            );
                            const winnerName =
                                leftPlayerName === duelInfo.team1
                                    ? duelInfo.team2
                                    : duelInfo.team1;
                            const winner = world
                                .getAllPlayers()
                                .find((p) => p.name === winnerName);
                            if (winner) {
                                try {
                                    this.getScoreboardObjective(
                                        SCOREBOARD_OBJECTIVES.WIN_COUNT
                                    ).addScore(winner, 1);
                                } catch { }
                                try {
                                    this.updateAdjustedWins(winner, 1);
                                } catch { }
                                try {
                                    this.updateWinRate(winner);
                                } catch { }
                                const loserScoreIdentity = world.scoreboard
                                    .getObjective(SCOREBOARD_OBJECTIVES.DEATH_COUNT)
                                    ?.getParticipants()
                                    .find((p) => p.displayName === leftPlayerName);
                                if (loserScoreIdentity) {
                                    try {
                                        this.getScoreboardObjective(
                                            SCOREBOARD_OBJECTIVES.DEATH_COUNT
                                        ).addScore(loserScoreIdentity, 1);
                                    } catch { }
                                }
                                this.celebrateWinner(winner, undefined, leftPlayerName);
                                system.runTimeout(() => {
                                    this.cleanupAfterDuel(
                                        winner,
                                        undefined,
                                        leftPlayerName,
                                        duelInfo.team1,
                                        duelInfo.team2
                                    );
                                }, 100);
                            } else {
                                console.warn(
                                    `[DuelManager] Winner ${winnerName} not found after ${leftPlayerName} left.`
                                );
                                this.activeDuels.delete(duelInfo.team1);
                                this.activeDuels.delete(duelInfo.team2);
                            }
                            unsubscribeListeners();
                        }
                    }
                );
                onPlayerDieSubscription = world.afterEvents.entityDie.subscribe(
                    (event) => {
                        if (!(event.deadEntity instanceof Player)) return;
                        const deadPlayer = event.deadEntity;
                        const duelInfo = this.activeDuels.get(deadPlayer.name);
                        if (
                            duelInfo &&
                            (deadPlayer.name === duelInfo.team1 ||
                                deadPlayer.name === duelInfo.team2)
                        ) {
                            console.log(
                                `[DuelManager] Player ${deadPlayer.name} died during duel.`
                            );
                            const team1 = duelInfo.team1;
                            const team2 = duelInfo.team2;
                            const loser: Player = deadPlayer;
                            let winner: Player | undefined;
                            if (deadPlayer.name === team1) {
                                winner = world.getAllPlayers().find((p) => p.name === team2);
                            } else {
                                winner = world.getAllPlayers().find((p) => p.name === team1);
                            }
                            if (!winner) {
                                console.warn(
                                    `[DuelManager] Could not determine winner after ${deadPlayer.name} died. Ending duel.`
                                );
                                this.activeDuels.delete(team1);
                                this.activeDuels.delete(team2);
                                unsubscribeListeners();
                                try {
                                    loser.sendMessage(
                                        "§c勝者を特定できませんでした。デュエルは引き分けとして終了します。"
                                    );
                                } catch { }
                                return;
                            }
                            try {
                                this.getScoreboardObjective(
                                    SCOREBOARD_OBJECTIVES.DEATH_COUNT
                                ).addScore(loser, 1);
                            } catch { }
                            try {
                                if (
                                    this.getPlayerScore(loser, SCOREBOARD_OBJECTIVES.KILLSTREAK) >
                                    0
                                ) {
                                    this.getScoreboardObjective(
                                        SCOREBOARD_OBJECTIVES.KILLSTREAK
                                    ).setScore(loser, 0);
                                }
                            } catch { }
                            try {
                                this.updateWinRate(loser);
                            } catch { }
                            const killerEntity = event.damageSource?.damagingEntity;
                            if (
                                killerEntity instanceof Player &&
                                killerEntity.name === winner.name
                            ) {
                                try {
                                    this.getScoreboardObjective(
                                        SCOREBOARD_OBJECTIVES.TOTAL_KILL
                                    ).addScore(winner, 1);
                                } catch { }
                                try {
                                    this.getScoreboardObjective(
                                        SCOREBOARD_OBJECTIVES.KILLSTREAK
                                    ).addScore(winner, 1);
                                } catch { }
                                try {
                                    this.addInterPlayerKill(winner, loser);
                                } catch { }
                            }
                            try {
                                this.updateMaxKillstreak(winner);
                            } catch { }
                            try {
                                this.getScoreboardObjective(
                                    SCOREBOARD_OBJECTIVES.WIN_COUNT
                                ).addScore(winner, 1);
                            } catch { }
                            try {
                                this.updateAdjustedWins(winner, 1);
                            } catch { }
                            try {
                                this.updateWinRate(winner);
                            } catch { }
                            this.celebrateWinner(winner, loser);
                            system.runTimeout(() => {
                                this.cleanupAfterDuel(winner, loser, undefined, team1, team2);
                            }, 100);
                            unsubscribeListeners();
                        }
                    }
                );
            }
        }, 20);
    }
    private celebrateWinner(
        winner: Player,
        loser?: Player,
        loserName?: string
    ): void {
        const fireworkCount = 1;
        if (loser) {
            loser.setGameMode(GameMode.spectator);
            system.runTimeout(() => {
                this.teleportPlayer(loser, winner.location, loser.dimension);
            }, 20);
        }
        const run = system.runInterval(() => {
            for (let i = 0; i < fireworkCount; i++) {
                const offset = {
                    x: (Math.random() - 0.5) * 6,
                    y: Math.random() * 3,
                    z: (Math.random() - 0.5) * 6,
                };
                const spawnLocation = {
                    x: winner.location.x + offset.x,
                    y: winner.location.y + offset.y,
                    z: winner.location.z + offset.z,
                };
                system.run(() =>
                    winner.runCommand(
                        `/summon fireworks_rocket ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z}`
                    )
                );
            }
        }, 10);
        run;
        winner.onScreenDisplay.setTitle(`§l§6§b${winner.name}§6 is Winner!!`);
        winner.sendMessage(
            `§6[デュエル]§r §aWiner§f:§b${winner.name} ${loser ? `§cLoser§f:§b${loser.name}` : `§cLoser§f:§b${loserName}`
            }`
        );
        winner.sendMessage(
            `§a最大連続キル数: §r${this.getPlayerScore(
                winner,
                SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK
            )}`
        );
        if (loser) {
            loser.onScreenDisplay.setTitle(`§l§6§b${winner.name}§6 is Winner!!`);
            loser.sendMessage(
                `§6[デュエル]§r §aWiner§f:§b${winner.name} §cLoser§f:§b${loser.name}`
            );
            loser.sendMessage(
                `§a最大連続キル数: §r${this.getPlayerScore(
                    loser,
                    SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK
                )}`
            );
        }
        system.runTimeout(() => {
            system.clearRun(run);
        }, 20 * 5);
    }
    private cleanupAfterDuel(
        winner: Player,
        loser?: Player,
        loserNameParam?: string,
        team1?: string,
        team2?: string
    ): void {
        const winnerName = winner?.name;
        const actualLoserName = loser?.name ?? loserNameParam;
        console.log(
            `[DuelManager][cleanupAfterDuel] Cleaning up duel. Winner: ${winnerName}, Loser: ${actualLoserName}, team1: ${team1}, team2: ${team2}`
        );
        const duelInfoForMap =
            this.activeDuels.get(winnerName) ??
            (actualLoserName ? this.activeDuels.get(actualLoserName) : undefined);
        const duelMapName = duelInfoForMap?.map;
        const duelConfig = duelMapName ? this.duelConfigs[duelMapName] : undefined;
        if (winnerName) this.activeDuels.delete(winnerName);
        if (actualLoserName) this.activeDuels.delete(actualLoserName);
        try {
            winner?.removeTag(DUELING_PLAYER_TAG);
        } catch { }
        try {
            loser?.removeTag(DUELING_PLAYER_TAG);
        } catch { }
        if (winner) {
            try {
                const winnerOldWinRate = this.getPlayerScore(
                    winner,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                );
                this.updateWinRate(winner);
                const winnerNewWinRate = this.getPlayerScore(
                    winner,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                );
                const winnerWinRateChange = winnerNewWinRate - winnerOldWinRate;
                const winnerAttackCount = this.getPlayerScore(
                    winner,
                    SCOREBOARD_OBJECTIVES.ATTACK_COUNT
                );
                winner.sendMessage(`§6[デュエル結果]§r §aあなたの勝利！`);
                winner.sendMessage(
                    `§a勝率の変化: §r${winnerWinRateChange >= 0 ? "+" : ""
                    }${winnerWinRateChange.toFixed(0)}% (§f${winnerOldWinRate.toFixed(
                        0
                    )}% §a-> §f${winnerNewWinRate.toFixed(0)}%§a)`
                );
                winner.sendMessage(`§a今回の攻撃回数: §r${winnerAttackCount}`);
                this.setPlayerScoreboard(winner, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
                this.removePlayerFromScoreboard(
                    winner,
                    SCOREBOARD_OBJECTIVES.DUEL_RUNNING
                );
                this.clearInventory(winner);
            } catch (e) {
                console.warn(
                    `[DuelManager][cleanupAfterDuel] Error during winner (${winnerName}) processing: ${e}`
                );
            }
        }
        if (loser) {
            try {
                const loserOldWinRate = this.getPlayerScore(
                    loser,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                );
                this.updateWinRate(loser);
                const loserNewWinRate = this.getPlayerScore(
                    loser,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                );
                const loserWinRateChange = loserNewWinRate - loserOldWinRate;
                const loserAttackCount = this.getPlayerScore(
                    loser,
                    SCOREBOARD_OBJECTIVES.ATTACK_COUNT
                );
                loser.sendMessage(`§6[デュエル結果]§r §cあなたの敗北！`);
                loser.sendMessage(
                    `§a勝率の変化: §r${loserWinRateChange >= 0 ? "+" : ""
                    }${loserWinRateChange.toFixed(0)}% (§f${loserOldWinRate.toFixed(
                        0
                    )}% §a-> §f${loserNewWinRate.toFixed(0)}%§a)`
                );
                loser.sendMessage(`§a今回の攻撃回数: §r${loserAttackCount}`);
                this.setPlayerScoreboard(loser, SCOREBOARD_OBJECTIVES.ATTACK_COUNT, 0);
                this.removePlayerFromScoreboard(
                    loser,
                    SCOREBOARD_OBJECTIVES.DUEL_RUNNING
                );
                this.clearInventory(loser);
            } catch (e) {
                console.warn(
                    `[DuelManager][cleanupAfterDuel] Error during loser (${loser.name}) processing: ${e}`
                );
            }
        } else if (actualLoserName) {
            try {
                const objective = this.getScoreboardObjective(
                    SCOREBOARD_OBJECTIVES.DUEL_RUNNING
                );
                const participant = objective
                    .getParticipants()
                    .find(
                        (p) =>
                            p.type === ScoreboardIdentityType.Player &&
                            p.displayName === actualLoserName
                    );
                if (participant) {
                    objective.removeParticipant(participant);
                    console.log(
                        `[DuelManager][cleanupAfterDuel] Removed offline loser ${actualLoserName} from duel_running scoreboard.`
                    );
                }
            } catch (error) {
                console.warn(
                    `[DuelManager][cleanupAfterDuel] Failed to remove offline loser ${actualLoserName} from duel_running scoreboard: ${error}`
                );
            }
        }
        if (duelConfig) {
            const endPos = duelConfig.endPos;
            const dimension = world.getDimension("overworld");
            if (winner) {
                try {
                    this.teleportPlayer(winner, endPos, dimension);
                    winner.setGameMode(GameMode.adventure);
                    this.executeCommands(winner, duelConfig.endCommands, team1, team2);
                } catch (e) {
                    console.warn(
                        `[DuelManager][cleanupAfterDuel] Error during winner (${winnerName}) final cleanup: ${e}`
                    );
                }
            }
            if (loser) {
                try {
                    this.teleportPlayer(loser, endPos, dimension);
                    loser.setGameMode(GameMode.adventure);
                    this.executeCommands(loser, duelConfig.endCommands, team1, team2);
                } catch (e) {
                    console.warn(
                        `[DuelManager][cleanupAfterDuel] Error during loser (${loser.name}) final cleanup: ${e}`
                    );
                }
            }
        } else {
            console.warn(
                `[DuelManager][cleanupAfterDuel] Could not find duel config for map: ${duelMapName}. Skipping final teleport and end commands.`
            );
            try {
                winner?.setGameMode(GameMode.adventure);
            } catch { }
            try {
                loser?.setGameMode(GameMode.adventure);
            } catch { }
        }
        system.runTimeout(() => {
            if (winner && loser) {
                this.displayPostDuelStats(winner, loser);
            } else if (winner && actualLoserName) {
                try {
                    winner.sendMessage(
                        `§6--- ${actualLoserName} の最終ステータスは取得できませんでした (オフライン) ---`
                    );
                } catch { }
            }
        }, 20);
    }
    private displayPostDuelStats(player1: Player, player2: Player) {
        try {
            player1.sendMessage(`§6--- ${player2.name} のデュエル後ステータス ---`);
            player1.sendMessage(
                `§a 合計キル:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.TOTAL_KILL
                )} §a| 現在Streak:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.KILLSTREAK
                )} §a| 勝率:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                ).toFixed(0)}%`
            );
            player1.sendMessage(
                `§a 勝利数:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.WIN_COUNT
                )} §a| 敗北数:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.DEATH_COUNT
                )} §a| 最大Streak:§r ${this.getPlayerScore(
                    player2,
                    SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK
                )}`
            );
        } catch (e) {
            console.warn("Failed to send stats to player1", e);
        }
        try {
            player2.sendMessage(`§6--- ${player1.name} のデュエル後ステータス ---`);
            player2.sendMessage(
                `§a 合計キル:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.TOTAL_KILL
                )} §a| 現在Streak:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.KILLSTREAK
                )} §a| 勝率:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.WIN_RATE
                ).toFixed(0)}%`
            );
            player2.sendMessage(
                `§a 勝利数:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.WIN_COUNT
                )} §a| 敗北数:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.DEATH_COUNT
                )} §a| 最大Streak:§r ${this.getPlayerScore(
                    player1,
                    SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK
                )}`
            );
        } catch (e) {
            console.warn("Failed to send stats to player2", e);
        }
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
            [player1Name, player2Name].forEach((playerName) => {
                world
                    .getAllPlayers()
                    .find((p) => p.name === playerName)
                    ?.sendMessage(
                        "§c現在利用可能なデュエルマップがありません。しばらくお待ちください。"
                    );
            });
        }
    }
    private removeExpiredRequests(): void {
        const now = Date.now();
        this.duelRequests = this.duelRequests.filter((req) => {
            const expired = now - req.timestamp > REQUEST_TIMEOUT;
            if (expired) {
                world
                    .getAllPlayers()
                    .find((p) => p.name === req.requester)
                    ?.sendMessage(
                        `§c${req.target} へのリクエストは期限切れになりました。`
                    );
            }
            return !expired;
        });
    }
    public displayStatus(player: Player, targetPlayerName: string): void {
        const targetPlayer = world
            .getAllPlayers()
            .find((p) => p.name === targetPlayerName);
        const getScore = (objectiveName: string) => {
            const objective = this.getScoreboardObjective(objectiveName);
            return targetPlayer
                ? this.getPlayerScore(targetPlayer, objectiveName)
                : objective
                    .getParticipants()
                    .find((p) => p.displayName === targetPlayerName)
                    ? objective.getScore(
                        objective
                            .getParticipants()
                            .find((p) => p.displayName === targetPlayerName)!
                    )
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
    private async getTopPlayers(
        objectiveName: string,
        topN: number = 10,
        minGames: number = 0
    ): Promise<{ name: string; score: number }[]> {
        try {
            const objective = this.getScoreboardObjective(objectiveName);
            const participants = objective.getParticipants();
            const scores: { name: string; score: number }[] = [];
            const onlinePlayers = world.getAllPlayers();
            let totalGamesObjective: ScoreboardObjective | undefined;
            if (minGames > 0) {
                try {
                    totalGamesObjective = this.getScoreboardObjective(
                        SCOREBOARD_OBJECTIVES.TOTAL_GAMES
                    );
                } catch (e) {
                    console.warn(
                        `[getTopPlayers] Failed to get TOTAL_GAMES objective for filtering.`
                    );
                    totalGamesObjective = undefined;
                }
            }
            for (const participant of participants) {
                const isOnline = onlinePlayers.some(
                    (p) => p.scoreboardIdentity?.id === participant.id
                );
                if (!isOnline || participant.type !== ScoreboardIdentityType.Player) {
                    continue;
                }
                const score = objective.getScore(participant);
                if (score === undefined) continue;
                if (minGames > 0 && totalGamesObjective) {
                    let participantGames = 0;
                    try {
                        participantGames = totalGamesObjective.getScore(participant) ?? 0;
                    } catch (e) {
                        participantGames = 0;
                    }
                    if (participantGames < minGames) {
                        continue;
                    }
                }
                if (participant.displayName) {
                    scores.push({ name: participant.displayName, score });
                } else {
                    console.warn(`[getTopPlayers] Participant with ID ${participant.id} has no displayName.`);
                }
            }
            scores.sort((a, b) => b.score - a.score);
            return scores.slice(0, topN);
        } catch (error) {
            console.error(
                `[getTopPlayers] Error getting ranking for ${objectiveName}: ${error}`
            );
            return [];
        }
    }
    private async showSpecificRanking(
        player: Player,
        objectiveName: string,
        title: string,
        unit: string = "",
        minGames: number = 0
    ): Promise<void> {
        const topPlayers = await this.getTopPlayers(objectiveName, 10, minGames);
        const form = new MessageFormData().title(title);
        if (topPlayers.length === 0) {
            form.body(
                "§c表示可能なオンラインプレイヤーのランキングデータがありません。" +
                (minGames > 0 ? `\n(最低${minGames}試合が必要です)` : "")
            );
        } else {
            let body = "§l--- オンラインプレイヤーランキング ---\n";
            topPlayers.forEach((p, index) => {
                const scoreDisplay =
                    objectiveName === SCOREBOARD_OBJECTIVES.WIN_RATE
                        ? `${p.score.toFixed(0)}${unit}`
                        : `${p.score}${unit}`;
                body += `§e${index + 1}. §b${p.name} §f- §a${scoreDisplay}\n`;
            });
            if (minGames > 0) {
                body += `\n§7(最低${minGames}試合以上)`;
            }
            form.body(body);
        }
        form.button1("§l閉じる");
        //@ts-ignore
        await form.show(player);
    }
    private async showRankingSelectionForm(player: Player): Promise<void> {
        const form = new ActionFormData()
            .title("§h§v§rランキング選択")
            .button("勝利数ランキング")
            .button("勝率ランキング (10試合以上)")
            .button("最大キルストリーク");
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined) return;
        const MIN_GAMES_FOR_WINRATE = 10;
        switch (response.selection) {
            case 0:
                await this.showSpecificRanking(
                    player,
                    SCOREBOARD_OBJECTIVES.WIN_COUNT,
                    "§h§v§r勝利数ランキング",
                    "勝"
                );
                break;
            case 1:
                await this.showSpecificRanking(
                    player,
                    SCOREBOARD_OBJECTIVES.WIN_RATE,
                    `§h§v§r勝率ランキング (${MIN_GAMES_FOR_WINRATE}試合以上)`,
                    "%",
                    MIN_GAMES_FOR_WINRATE
                );
                break;
            case 2:
                await this.showSpecificRanking(
                    player,
                    SCOREBOARD_OBJECTIVES.MAX_KILLSTREAK,
                    "§h§v§r最大キルストリークランキング",
                    "連続キル"
                );
                break;
        }
    }
    public async showDuelForm(player: Player): Promise<void> {
        if (!player.hasTag(DUEL_PLAYER_TAG)) {
            player.sendMessage(`§cデュエルを行う権限がありません。`);
            return;
        }
        const form = new ActionFormData()
            .title("§w§s§1§rデュエルメニュー")
            .button("リクエストを送信", "textures/ui/strength_effect.png")
            .button("リクエストを確認", "textures/ui/Envelope.png")
            .button("自分のステータス", "textures/ui/permissions_member_star_hover.png")
            .button("他の人のステータス", "textures/ui/permissions_member_star.png")
            .button("ランキングを見る", "textures/ui/conduit_power_effect.png")
            .button("自動マッチングに参加", "textures/ui/icon_recipe_equipment.png")
            .button("デュエルから離脱", "textures/ui/realms_red_x.png");
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled || response.selection === undefined) return;
        switch (response.selection) {
            case 0:
                await this.showSendDuelRequestForm(player);
                break;
            case 1:
                await this.showDuelRequestsForm(player);
                break;
            case 2:
                this.displayStatus(player, player.name);
                break;
            case 3:
                await this.showOtherPlayerStatusForm(player);
                break;
            case 4:
                await this.showRankingSelectionForm(player);
                break;
            case 5:
                this.autoMatch(player);
                break;
            case 6:
                this.leaveDuel(player);
                break;
        }
    }
    private async showSendDuelRequestForm(player: Player): Promise<void> {
        const players = world
            .getAllPlayers()
            .filter((p) => p.name !== player.name && p.hasTag("player_hub"));
        if (players.length === 0) {
            player.sendMessage("§cオンラインのプレイヤーがいません。");
            return;
        }
        const playerListForm = new ActionFormData().title("§h§v§rプレイヤーを選択");
        players.forEach((p) => playerListForm.button(p.name));
        //@ts-ignore
        const playerResponse = await playerListForm.show(player);
        if (playerResponse.canceled || playerResponse.selection === undefined)
            return;
        const targetPlayerName = players[playerResponse.selection].name;
        const mapSelectForm = new ActionFormData()
            .title("§h§v§rマップを選択")
            .button("ランダムマップ")
            .button("マップを指定");
        //@ts-ignore
        const mapResponse = await mapSelectForm.show(player);
        if (mapResponse.canceled || mapResponse.selection === undefined) return;
        let mapNameToUse: string | null | undefined = undefined;
        if (mapResponse.selection === 0) {
            mapNameToUse = this.findAvailableMap();
            if (!mapNameToUse) {
                player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                return;
            }
        } else if (mapResponse.selection === 1) {
            const allMapNames = Object.keys(this.duelConfigs);
            const availableMaps = allMapNames.filter((map) => !this.isMapInUse(map));
            mapNameToUse = await showPaginatedMapSelectionForm(player, availableMaps);
            if (mapNameToUse === null) {
                return;
            }
        }
        if (typeof mapNameToUse === "string") {
            this.sendDuelRequest(player, targetPlayerName, mapNameToUse);
        } else if (mapNameToUse === undefined && mapResponse.selection === 0) {
            player.sendMessage("§c現在利用可能なデュエルマップがありません。");
        }
    }
    private async showDuelRequestsForm(player: Player): Promise<void> {
        const requests = this.duelRequests.filter(
            (req) => req.target === player.name
        );
        if (requests.length === 0) {
            player.sendMessage("§aデュエルリクエストはありません。");
            return;
        }
        const form = new ActionFormData().title("§h§v§rデュエルリクエスト");
        requests.forEach((req) =>
            form.button(`${req.requester} - ${req.map ?? "ランダム"} マップ`)
        );
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) return;
        const selectedRequest = requests[response.selection!];
        this.duelRequests = this.duelRequests.filter(
            (req) => req !== selectedRequest
        );
        let mapNameToUse = selectedRequest.map ?? this.findAvailableMap();
        if (mapNameToUse && this.isMapInUse(mapNameToUse)) {
            const availableMap = this.findAvailableMap();
            if (availableMap) {
                mapNameToUse = availableMap;
            } else {
                player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                return;
            }
        }
        if (!mapNameToUse) {
            player.sendMessage("§c現在利用可能なデュエルマップがありません。");
            return;
        }
        this.startDuel(selectedRequest.requester, player.name, mapNameToUse);
    }
    private async showOtherPlayerStatusForm(player: Player): Promise<void> {
        const players = world.getAllPlayers().filter((p) => p.name !== player.name);
        if (players.length === 0) {
            player.sendMessage("§cオンラインのプレイヤーがいません。");
            return;
        }
        const form = new ActionFormData().title("§h§v§rプレイヤーを選択");
        players.forEach((p) => form.button(p.name));
        //@ts-ignore
        const response = await form.show(player);
        if (response.canceled) return;
        this.displayStatus(player, players[response.selection!].name);
    }
    public autoMatch(player: Player): void {
        if (
            this.activeDuels.has(player.name) ||
            this.autoMatchQueue.includes(player.name)
        ) {
            player.sendMessage(
                "§cあなたは既にデュエル中か、自動マッチングのキューに参加しています。"
            );
            return;
        }
        this.autoMatchQueue.push(player.name);
        player.sendMessage("§a自動マッチングのキューに追加されました。");
    }
    private sendDuelRequest(
        requester: Player,
        targetName: string,
        map?: string
    ): void {
        const targetPlayer = world
            .getAllPlayers()
            .find((p) => p.name === targetName);
        if (!targetPlayer) {
            requester.sendMessage("§cターゲットプレイヤーが見つかりません。");
            return;
        }
        if (this.activeDuels.has(targetName)) {
            requester.sendMessage("§cターゲットプレイヤーは既にデュエル中です。");
            return;
        }
        if (map === undefined) {
            map = this.findAvailableMap() ?? undefined;
            if (map === undefined) {
                requester.sendMessage("§c現在利用可能なデュエルマップがありません。");
                return;
            }
        } else if (!this.duelConfigs.hasOwnProperty(map)) {
            requester.sendMessage(`§c無効なマップが指定されました。`);
            return;
        } else if (this.isMapInUse(map)) {
            requester.sendMessage(
                "§c選択したマップは既に使用中です。他のマップを選択するか、ランダムを選択してください。"
            );
            return;
        }
        if (
            this.duelRequests.some(
                (req) => req.requester === requester.name && req.target === targetName
            )
        ) {
            requester.sendMessage("§c既にこのプレイヤーにリクエストを送信済みです。");
            return;
        }
        this.duelRequests.push({
            requester: requester.name,
            target: targetName,
            map,
            timestamp: Date.now(),
        });
        requester.sendMessage(
            `§a${targetName} にデュエルリクエストを送信しました ${map ? `(マップ: ${map})` : ""
            }`
        );
        targetPlayer.sendMessage(
            `§a${requester.name} からデュエルリクエストを受信しました ${map ? `(マップ: ${map})` : ""
            }\nDuel§gUI§a§fアイテム又は\n申請してきたプレイヤーを右クリする事でも承諾できます。`
        );
    }
    public async show(player: Player): Promise<void> {
        if (!player.hasTag("player_hub")) {
            player.sendMessage(`§cデュエルを行う権限がありません。`);
            return;
        }
        const viewDirectionEntities = player.getEntitiesFromViewDirection();
        if (
            !viewDirectionEntities ||
            viewDirectionEntities.length === 0 ||
            !viewDirectionEntities[0].entity
        ) {
            player.sendMessage(`§c見ている先にプレイヤーがいません。`);
            return;
        }
        const nearbyPlayersHit: EntityRaycastHit = viewDirectionEntities[0];
        const nearbyPlayerEntity: Entity = nearbyPlayersHit.entity;
        if (nearbyPlayerEntity.typeId !== "minecraft:player") {
            player.sendMessage(`§c見ている先にプレイヤーがいません。`);
            return;
        }
        const nearbyPlayer = world
            .getAllPlayers()
            .find((p) => p.id === nearbyPlayerEntity.id);
        if (!nearbyPlayer) {
            console.warn(
                `Could not find Player object for entity ID: ${nearbyPlayerEntity.id}`
            );
            player.sendMessage(`§cプレイヤー情報の取得に失敗しました。`);
            return;
        }
        const existingRequest = this.duelRequests.find(
            (req) => req.requester === player.name && req.target === nearbyPlayer.name
        );
        if (existingRequest) {
            const messageForm = new MessageFormData()
                .title("§h§v§rデュエルリクエスト")
                .body(
                    `${nearbyPlayer.name} へのデュエルリクエストをキャンセルしますか？`
                )
                .button1("はい")
                .button2("いいえ");
            //@ts-ignore
            const response = await messageForm.show(player);
            if (response.selection === 0) {
                this.duelRequests = this.duelRequests.filter(
                    (req) => req !== existingRequest
                );
                player.sendMessage("§aデュエルリクエストをキャンセルしました。");
                nearbyPlayer.sendMessage(
                    `§c${player.name} がデュエルリクエストをキャンセルしました。`
                );
            }
        } else {
            const incomingRequest = this.duelRequests.find(
                (req) =>
                    req.requester === nearbyPlayer.name && req.target === player.name
            );
            if (incomingRequest) {
                const messageForm = new MessageFormData()
                    .title("§h§v§rデュエルリクエスト")
                    .body(
                        `${nearbyPlayer.name} からのデュエルリクエスト${incomingRequest.map ? ` (マップ: ${incomingRequest.map})` : ""
                        } を承諾しますか？`
                    )
                    .button1("承諾")
                    .button2("拒否");
                //@ts-ignore
                const response = await messageForm.show(player);
                if (response.selection === 0) {
                    let mapNameToUse = incomingRequest.map;
                    let mapIsAvailable = true;
                    if (mapNameToUse) {
                        if (this.isMapInUse(mapNameToUse)) {
                            player.sendMessage(
                                `§c指定されたマップ '${mapNameToUse}' は現在使用中です。`
                            );
                            mapIsAvailable = false;
                        }
                    } else {
                        mapNameToUse = this.findAvailableMap() ?? undefined;
                        if (!mapNameToUse) {
                            player.sendMessage(
                                "§c現在利用可能なデュエルマップがありません。"
                            );
                            mapIsAvailable = false;
                        }
                    }
                    if (mapIsAvailable && mapNameToUse) {
                        this.duelRequests = this.duelRequests.filter(
                            (req) => req !== incomingRequest
                        );
                        this.startDuel(
                            incomingRequest.requester,
                            player.name,
                            mapNameToUse
                        );
                    } else {
                        player.sendMessage("§cデュエルを開始できませんでした。");
                    }
                } else {
                    this.duelRequests = this.duelRequests.filter(
                        (req) => req !== incomingRequest
                    );
                    player.sendMessage(
                        `§a${nearbyPlayer.name} からのデュエルリクエストを拒否しました。`
                    );
                    nearbyPlayer.sendMessage(
                        `§c${player.name} がデュエルリクエストを拒否しました。`
                    );
                }
            } else {
                const messageForm = new MessageFormData()
                    .title("§h§v§rデュエルリクエスト")
                    .body(`${nearbyPlayer.name} にデュエルを申し込みますか？`)
                    .button1("はい")
                    .button2("いいえ");
                //@ts-ignore
                const response = await messageForm.show(player);
                if (response.selection === 0) {
                    const mapSelectForm = new ActionFormData()
                        .title("§d§e§v§rマップを選択")
                        .button("ランダムマップ")
                        .button("マップを指定");
                    //@ts-ignore
                    const mapResponse = await mapSelectForm.show(player);
                    if (mapResponse.canceled || mapResponse.selection === undefined)
                        return;
                    let mapNameToUse: string | null | undefined = undefined;
                    if (mapResponse.selection === 0) {
                        mapNameToUse = this.findAvailableMap();
                        if (!mapNameToUse) {
                            player.sendMessage(
                                "§c現在利用可能なデュエルマップがありません。"
                            );
                            return;
                        }
                    } else if (mapResponse.selection === 1) {
                        const allMapNames = Object.keys(this.duelConfigs);
                        const availableMaps = allMapNames.filter(
                            (map) => !this.isMapInUse(map)
                        );
                        mapNameToUse = await showPaginatedMapSelectionForm(
                            player,
                            availableMaps
                        );
                        if (mapNameToUse === null) {
                            return;
                        }
                    }
                    if (typeof mapNameToUse === "string") {
                        this.sendDuelRequest(player, nearbyPlayer.name, mapNameToUse);
                    } else if (
                        mapNameToUse === undefined &&
                        mapResponse.selection === 0
                    ) {
                        player.sendMessage("§c現在利用可能なデュエルマップがありません。");
                    }
                }
            }
        }
    }
}