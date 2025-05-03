import { Handler } from "../../../../module/Handler";
import { Player, world, Vector3 } from "@minecraft/server"; // Import necessary types
import { DuelManager as ActualDuelManager, DuelConfig, DuelRequest, RegisteredKit } from "../duel";

// Interface for the JSON input structure in the 'create' command
interface DuelConfigInput {
    name: string;
    pos1: { x: number; y: number; z: number };
    pos2: { x: number; y: number; z: number };
    kit: string;
    endPos: { x: number; y: number; z: number };
    startCommands?: string[]; // Optional start commands
    endCommands?: string[];   // Optional end commands
}

// Define the interface matching the public API of DuelManager we intend to use
// This acts as a contract for the command handler.
interface IDuelManager {
    addDuelConfig(name: string, config: DuelConfig): void; // Takes name (lowercase key) and config object
    registerKitChest(name: string, pos1: Vector3, pos2?: Vector3): void; // Takes lowercase name
    showDuelForm(player: Player): Promise<void>;
    leaveDuel(player: Player): void;
    show(player: Player): Promise<void>; // This is the right-click/view interaction
    autoMatch(player: Player): void;
    sendDuelRequest(requester: Player, targetName: string, mapName?: string): void; // mapName should be lowercase
    startDuel(requesterName: string, targetName: string, mapName: string): void; // mapName should be lowercase
    giveKitByName(player: Player, kitName: string): void; // kitName should be lowercase
    duelRequests: DuelRequest[]; // Use the actual interface type
    findAvailableMap(): string | null; // Return type is string or null
    isMapInUse(mapName: string): boolean; // mapName should be lowercase
    duelConfigs: Record<string, DuelConfig>; // Keys should be lowercase
    registeredKits: RegisteredKit[]; // Names should be lowercase
    // activeDuels: Map<string, { map: string }>; // Expose if needed, e.g., for status checks
}

// --- Duplicate Tracking Sets ---
// These sets track names registered during the current script runtime
// to prevent adding duplicates if the command is run multiple times (e.g., script reload).
const registeredConfigNames = new Set<string>();
const registeredKitNames = new Set<string>();
// --- End Duplicate Tracking Sets ---


export function registerDuelCommand(handler: Handler, moduleName: string) {

    // Instantiate the actual DuelManager and cast it to the interface
    // Ensure the DuelManager methods consistently use lowercase keys/names where appropriate
    const duelManager = new ActualDuelManager() as unknown as IDuelManager;

    handler.registerCommand("duel", {
        moduleName: moduleName,
        description: "プレイヤー間のデュエルを管理します。",
        usage:
            "duel create <設定JSON>\n" +
            "  - 全てのデュエル設定を単一のJSON文字列で指定します。\n" +
            "  - §bチャットからの実行のみサポートされます。\n" + // Added note about chat-only
            "  - 例: duel create {\"name\":\"Arena 1\",\"pos1\":{\"x\":0,\"y\":64,\"z\":0},\"pos2\":{\"x\":10,\"y\":74,\"z\":10},\"kit\":\"swords\",\"endPos\":{\"x\":0,\"y\":60,\"z\":0},\"startCommands\":[\"say Go!\"],\"endCommands\":[\"say GG\"]}\n" +
            "  - §e推奨: JSONにスペースが含まれる場合、JSON全体をシングルクォート(')等で囲むと確実です。\n" +
            "  - §b注意: 同名の設定は一度しか登録されません（大文字小文字無視）。\n" +
            "  - 必須項目: name, pos1, pos2, kit, endPos\n" +
            "duel kit <キット名> <x1> <y1> <z1> [x2] [y2] [z2]\n" +
            "  - キット用のチェスト位置を登録します。\n" +
            "  - §b注意: 同名のキットは一度しか登録されません（大文字小文字無視）。\n" +
            "  - 詳細はDuelManagerの実装を参照してください（スロットロック設定など）。\n" +
            "duel form\n" +
            "  - デュエルメニューUIを表示します。\n" +
            "duel show\n" +
            "  - 見ている先のプレイヤーとの対話UIを表示します（リクエスト送信/承諾/キャンセル）。\n" +
            "duel automatch\n" +
            "  - 自動マッチングキューに参加します。\n" +
            "duel r <プレイヤー名> [マップ名]\n" +
            "  - 指定したプレイヤーにデュエルリクエストを送信します。マップ名を省略するとランダムになります。\n" +
            "duel a <プレイヤー名>\n" +
            "  - 指定したプレイヤーからのデュエルリクエストを承諾します。\n" +
            "duel leave\n" +
            "  - 現在のデュエル、またはマッチングキューから退出します。\n" +
            "duel give <キット名>\n" +
            "  - 指定されたキットを自分に与えます（テスト用）。",
        execute: (message, event, args) => { // message parameter is crucial here
            const player = event.sourceEntity;
            const subCommand = args[0] ? args[0].toLowerCase() : "";

            // Allow commands without arguments like 'form', 'show', 'automatch', 'leave'
            // For 'create', we specifically check the message later.
            if (args.length < 1 && !["form", "show", "automatch", "leave"].includes(subCommand)) {
                const msg = "§c無効なデュエルコマンドです。`/help duel`で使用法を確認してください。";
                if (player instanceof Player) player.sendMessage(msg);
                else console.warn("[Duel Command] Invalid usage. Use '/help duel'.");
                return;
            }

            switch (subCommand) {
                case "create": {
                    // --- Use ONLY message for JSON extraction ---
                    if (!message) {
                        // This command requires the raw message to extract the JSON
                        const errorMessage = `§cこのコマンド ('create') はチャットからの実行のみサポートされます（設定JSONの取得に必要）。コンソールからは実行できません。`;
                        if (player instanceof Player) player.sendMessage(errorMessage);
                        else console.warn("[Duel Create] Cannot execute 'create' command without raw message input (required for JSON extraction).");
                        return;
                    }

                    let configJsonString: string | undefined = undefined;
                    let potentialJson = "";
                    // Define potential command prefixes (case-insensitive check later)
                    const prefixes = ["create"];
                    let foundPrefix = false;

                    for (const prefix of prefixes) {
                        const baseCommandIndex = message.toLowerCase().indexOf(prefix);
                        if (baseCommandIndex !== -1) {
                            // Extract the part after the prefix
                            potentialJson = message.substring(baseCommandIndex + prefix.length).trim();
                            foundPrefix = true;
                            break; // Stop after finding the first matching prefix
                        }
                    }

                    if (!foundPrefix) {
                        const errorMessage = `§cコマンドの形式が正しくありません。'duel create {JSON}' の形式で入力してください。`;
                        if (player instanceof Player) player.sendMessage(errorMessage);
                        else console.warn("[Duel Create] Could not find 'duel create ' prefix in the message.");
                        return;
                    }

                    // Basic check if the extracted part looks like JSON
                    if (potentialJson.startsWith("{") && potentialJson.endsWith("}")) {
                        configJsonString = potentialJson;
                    }

                    if (!configJsonString) {
                        const errorMessage = `§c設定JSONをコマンドから抽出できませんでした。\n§cJSON部分は '{' で始まり '}' で終わる必要があります。\n§c例: duel create {"name":"MyArena", ...}`;
                        if (player instanceof Player) player.sendMessage(errorMessage);
                        else console.warn("[Duel Create] Could not extract valid JSON part from message after prefix.");
                        return;
                    }
                    // --- JSON Extraction End ---


                    let configInput: DuelConfigInput;
                    try {
                        // Attempt to parse the JSON string
                        configInput = JSON.parse(configJsonString);

                        // --- Validation ---
                        if (typeof configInput !== 'object' || configInput === null) {
                            throw new Error("JSONがオブジェクトではありません。");
                        }
                        if (typeof configInput.name !== 'string' || !configInput.name) {
                            throw new Error("必須項目 'name' (文字列) がありません。");
                        }
                        const configNameLower = configInput.name.toLowerCase(); // Use lowercase for checking duplicates and as the key

                        // --- Duplicate Config Check ---
                        if (registeredConfigNames.has(configNameLower)) {
                            const skipMsg = `§eデュエル設定 '${configInput.name}' は既に登録されています。スキップしました。`;
                            if (player instanceof Player) player.sendMessage(skipMsg);
                            // Optional: Log to console as well
                            // console.log(`[Duel Create] Config '${configInput.name}' (${configNameLower}) already registered. Skipping.`);
                            return; // Skip registration
                        }
                        // --- Duplicate Check End ---


                        const validatePos = (pos: any, key: string): Vector3 => {
                            if (typeof pos !== 'object' || pos === null ||
                                typeof pos.x !== 'number' || isNaN(pos.x) ||
                                typeof pos.y !== 'number' || isNaN(pos.y) ||
                                typeof pos.z !== 'number' || isNaN(pos.z)) {
                                throw new Error(`必須項目 '${key}' の形式が不正です。{"x":数値,"y":数値,"z":数値} である必要があります。`);
                            }
                            return { x: pos.x, y: pos.y, z: pos.z };
                        };
                        configInput.pos1 = validatePos(configInput.pos1, 'pos1');
                        configInput.pos2 = validatePos(configInput.pos2, 'pos2');
                        configInput.endPos = validatePos(configInput.endPos, 'endPos');

                        if (typeof configInput.kit !== 'string' || !configInput.kit) {
                            throw new Error("必須項目 'kit' (文字列) がありません。");
                        }
                        const kitNameLower = configInput.kit.toLowerCase(); // Ensure kit name is lowercase for check

                        // Check if the specified kit is registered (using the tracking set)
                        if (!registeredKitNames.has(kitNameLower)) {
                            // Show original casing in error message
                            throw new Error(`キット '${configInput.kit}' が登録されていません。先に 'duel kit' コマンドで登録してください。`);
                        }


                        // Validate optional commands arrays
                        if (configInput.startCommands !== undefined) {
                            if (!Array.isArray(configInput.startCommands) || !configInput.startCommands.every(cmd => typeof cmd === 'string')) {
                                throw new Error("'startCommands' は文字列の配列である必要があります。");
                            }
                        }
                        if (configInput.endCommands !== undefined) {
                            if (!Array.isArray(configInput.endCommands) || !configInput.endCommands.every(cmd => typeof cmd === 'string')) {
                                throw new Error("'endCommands' は文字列の配列である必要があります。");
                            }
                        }
                        // --- End Validation ---

                    } catch (e: any) {
                        const errorMessage = `§c設定JSONの解析または検証に失敗しました: ${e.message}\n§c入力されたJSON部分: ${configJsonString.substring(0, 100)}${configJsonString.length > 100 ? '...' : ''}`;
                        if (player instanceof Player) {
                            player.sendMessage(errorMessage);
                        } else {
                            console.warn(`[Duel Create] Failed to parse/validate config JSON: ${e.message}. Input JSON part: ${configJsonString}`);
                        }
                        return;
                    }

                    try {
                        // Prepare the config object for DuelManager
                        const duelConfig: DuelConfig = {
                            name: configInput.name, // Keep original name for display purposes in DuelConfig
                            pos1: configInput.pos1,
                            pos2: configInput.pos2,
                            kit: configInput.kit.toLowerCase(), // Store lowercase kit name reference
                            endPos: configInput.endPos,
                            startCommands: configInput.startCommands, // Pass optional arrays directly
                            endCommands: configInput.endCommands
                        };

                        console.log(`${JSON.stringify(duelConfig)}`)

                        // Add the config using the manager's method, using lowercase name as the key
                        const configKey = configInput.name.toLowerCase();
                        duelManager.addDuelConfig(configKey, duelConfig);
                        registeredConfigNames.add(configKey); // Track successful registration

                        const successMsg = `§aデュエル設定 '${configInput.name}' を登録しました。`;
                        const detailMsg = `§7 - Kit: ${configInput.kit}, StartCmds: ${configInput.startCommands?.length ?? 0}, EndCmds: ${configInput.endCommands?.length ?? 0}`;
                        if (player instanceof Player) {
                            player.sendMessage(successMsg + "\n" + detailMsg);
                        } else {
                            console.log(`[Duel Create] Successfully registered duel config '${configInput.name}' (Key: ${configKey}). Kit: ${configInput.kit.toLowerCase()}`);
                        }
                    } catch (error: any) {
                        const errorMsg = `§cデュエル設定 '${configInput.name}' の追加中にエラーが発生しました: ${error.message || error}`;
                        if (player instanceof Player) {
                            player.sendMessage(errorMsg);
                        } else {
                            console.error(`[Duel Create] Error adding duel config '${configInput.name}': ${error.message || error}`);
                        }
                    }
                    break;
                } // End case "create"

                case "kit": {
                    // Args are still needed for kit registration parameters
                    if (args.length !== 5 && args.length !== 8) {
                        const errorMessage = "§c使用法: duel kit <キット名> <x1> <y1> <z1> [x2] [y2] [z2]";
                        if (player instanceof Player) player.sendMessage(errorMessage);
                        else console.warn("[Duel Kit] Usage: duel kit <kitName> <x1> <y1> <z1> [x2] [y2] [z2]");
                        return;
                    }
                    const kitName = args[1]; // Keep original casing for messages
                    const kitNameLower = kitName.toLowerCase(); // Use lowercase for checking duplicates and as the key

                    // --- Duplicate Kit Check ---
                    if (registeredKitNames.has(kitNameLower)) {
                        const skipMsg = `§eキット '${kitName}' は既に登録されています。スキップしました。`;
                        if (player instanceof Player) player.sendMessage(skipMsg);
                        // Optional: Log to console
                        // console.log(`[Duel Kit] Kit '${kitName}' (${kitNameLower}) already registered. Skipping.`);
                        return; // Skip registration
                    }
                    // --- Duplicate Check End ---


                    const x1 = parseFloat(args[2]);
                    const y1 = parseFloat(args[3]);
                    const z1 = parseFloat(args[4]);
                    if (isNaN(x1) || isNaN(y1) || isNaN(z1)) {
                        const errormsg = "§c無効な座標です (pos1)。数値を入力してください。";
                        if (player instanceof Player) player.sendMessage(errormsg);
                        else console.warn("[Duel Kit] Invalid coordinates for pos1.");
                        return;
                    }
                    let pos1: Vector3 = { x: x1, y: y1, z: z1 };
                    let pos2: Vector3 | undefined = undefined;
                    if (args.length === 8) {
                        const x2 = parseFloat(args[5]);
                        const y2 = parseFloat(args[6]);
                        const z2 = parseFloat(args[7]);
                        if (isNaN(x2) || isNaN(y2) || isNaN(z2)) {
                            const errormsg = "§c無効な座標です (pos2)。数値を入力してください。";
                            if (player instanceof Player) player.sendMessage(errormsg);
                            else console.warn("[Duel Kit] Invalid coordinates for pos2.");
                            return;
                        }
                        pos2 = { x: x2, y: y2, z: z2 };
                    }
                    try {
                        // Register kit chest position(s) using lowercase name
                        duelManager.registerKitChest(kitNameLower, pos1, pos2);
                        // Confirmation message is handled inside registerKitChest via console.warn
                        // Track successful registration *after* the call
                        registeredKitNames.add(kitNameLower);

                        // Provide feedback to the command user (use original casing kitName)
                        const pos2Str = pos2 ? `(${pos2.x}, ${pos2.y}, ${pos2.z})` : "なし";
                        const successMsg = `§aキット '${kitName}' のチェスト位置登録を試みました。\n§7 - Pos1: (${pos1.x}, ${pos1.y}, ${pos1.z}), Pos2: ${pos2Str}\n§7コンソールで詳細を確認してください（チェストの検証結果など）。`;
                        if (player instanceof Player) player.sendMessage(successMsg);
                        else console.log(`[Duel Kit] Attempted registration for kit '${kitName}' (Key: ${kitNameLower}). Pos1: (${pos1.x},${pos1.y},${pos1.z}), Pos2: ${pos2Str}. Check console for validation details.`);
                    } catch (error: any) {
                        // Catch errors specifically from registerKitChest if it throws them
                        const errorMsg = `§cキットチェスト '${kitName}' の登録中に予期せぬエラー: ${error.message || error}`;
                        if (player instanceof Player) player.sendMessage(errorMsg);
                        else console.error(`[Duel Kit] Error during registration attempt for kit '${kitName}': ${error.message || error}`);
                    }
                    break;
                } // End case "kit"

                // --- Player-only commands ---
                case "form":
                case "show":
                case "automatch":
                case "r": // Request
                case "a": // Accept
                case "leave":
                case "give": // Add give here
                    {
                        if (!(player instanceof Player)) {
                            console.warn(`[Duel] コマンド '${subCommand}' はプレイヤーのみが使用できます。`);
                            return;
                        }
                        // Wrap async operations in a self-executing async function
                        (async () => {
                            try {
                                switch (subCommand) {
                                    case "form":
                                        await duelManager.showDuelForm(player);
                                        break;
                                    case "leave":
                                        duelManager.leaveDuel(player);
                                        break;
                                    case "show":
                                        await duelManager.show(player);
                                        break;
                                    case "automatch":
                                        duelManager.autoMatch(player);
                                        break;
                                    case "r": { // Request
                                        if (args.length < 2) {
                                            player.sendMessage("§c使用法: duel r <プレイヤー名> [マップ名]");
                                            return;
                                        }
                                        const targetName = args[1];
                                        const mapNameArg = args.length > 2 ? args.slice(2).join(" ") : undefined;
                                        const mapNameLower = mapNameArg?.toLowerCase(); // Map name key is lowercase

                                        if (targetName === player.name) {
                                            player.sendMessage("§c自分自身にデュエルリクエストを送ることはできません。");
                                            return;
                                        }
                                        const targetPlayer = world.getAllPlayers().find(p => p.name === targetName);
                                        if (!targetPlayer) {
                                            player.sendMessage(`§cプレイヤー '${targetName}' が見つかりません (オンラインではありません)。`);
                                            return;
                                        }
                                        // Map validation (if provided) using lowercase key
                                        if (mapNameLower) {
                                            // Check against registeredConfigNames for existence
                                            if (!registeredConfigNames.has(mapNameLower)) {
                                                // Show original casing in message
                                                player.sendMessage(`§c指定されたマップ '${mapNameArg}' は存在しません。`);
                                                return;
                                            }
                                            // Check if map is in use (requires lowercase key)
                                            if (duelManager.isMapInUse(mapNameLower)) {
                                                // Show original casing in message
                                                player.sendMessage(`§cマップ '${mapNameArg}' は現在使用中です。`);
                                                return;
                                            }
                                        }
                                        // Send request with lowercase map name if provided
                                        duelManager.sendDuelRequest(player, targetName, mapNameLower);
                                        break;
                                    }
                                    case "a": { // Accept
                                        if (args.length !== 2) {
                                            player.sendMessage("§c使用法: duel a <プレイヤー名>");
                                            return;
                                        }
                                        const requesterName = args[1];
                                        const requests = duelManager.duelRequests;

                                        const requestIndex = requests.findIndex(req => req.requester === requesterName && req.target === player.name);
                                        if (requestIndex === -1) {
                                            player.sendMessage(`§c${requesterName} からの有効なデュエルリクエストが見つかりません。`);
                                            return;
                                        }
                                        const request = requests[requestIndex];
                                        // Map name in request should already be lowercase if set by 'r' command
                                        let mapNameToUse = request.map;
                                        let mapUnavailableReason: string | null = null;

                                        if (mapNameToUse) {
                                            // Validate if the requested map still exists and is free
                                            if (!registeredConfigNames.has(mapNameToUse)) {
                                                mapUnavailableReason = `リクエストされたマップ '${mapNameToUse}' はもう存在しません。`;
                                                mapNameToUse = undefined;
                                            } else if (duelManager.isMapInUse(mapNameToUse)) {
                                                mapUnavailableReason = `リクエストされたマップ '${mapNameToUse}' は現在使用中です。`;
                                                mapNameToUse = undefined;
                                            }
                                        }

                                        if (!mapNameToUse) {
                                            if (mapUnavailableReason) player.sendMessage(`§e${mapUnavailableReason} ランダムマップを探します...`);
                                            mapNameToUse = duelManager.findAvailableMap() ?? undefined; // Convert null to undefined
                                        }

                                        if (!mapNameToUse) {
                                            player.sendMessage("§c現在利用可能なデュエルマップがありません。管理者に連絡してください。");
                                            const requesterPlayer = world.getAllPlayers().find(p => p.name === requesterName);
                                            requesterPlayer?.sendMessage(`§c${player.name} がリクエストを承認しましたが、利用可能なマップがありませんでした。`);
                                            requests.splice(requestIndex, 1); // Remove failed request
                                            return;
                                        }

                                        requests.splice(requestIndex, 1); // Remove successful request
                                        duelManager.startDuel(requesterName, player.name, mapNameToUse); // Start duel with lowercase map key
                                        break;
                                    }
                                    case "give": {
                                        if (args.length !== 2) {
                                            player.sendMessage("§c使用法: duel give <キット名>");
                                            return;
                                        }
                                        const kitNameArg = args[1]; // Original casing for messages
                                        const kitNameLower = kitNameArg.toLowerCase(); // Lowercase for checks and giving
                                        // Check if kit exists using the tracking set
                                        if (!registeredKitNames.has(kitNameLower)) {
                                            player.sendMessage(`§cキット '${kitNameArg}' は登録されていません。`); // Show original case
                                            return;
                                        }
                                        duelManager.giveKitByName(player, kitNameLower); // Give using lowercase name
                                        player.sendMessage(`§aキット '${kitNameArg}' を装備しました。`); // Show original case
                                        break;
                                    }
                                }
                            } catch (e: any) {
                                console.error(`[Duel Command:${subCommand}] Error executing command for ${player.name}: ${e.message || e}`, e.stack);
                                player.sendMessage(`§cコマンド '${subCommand}' の実行中にエラーが発生しました: ${e.message || '不明なエラー'}`);
                            }
                        })(); // Immediately invoke the async function
                        break;
                    } // End player-only commands block

                default: {
                    const errorMsg = `§c無効なデュエルサブコマンド '${subCommand}' です。'/help duel' で使用法を確認してください。`;
                    if (player instanceof Player) {
                        player.sendMessage(errorMsg);
                    } else {
                        console.warn(`[Duel Command] Invalid subcommand '${subCommand}'.`);
                    }
                }
            } // End outer switch
        }, // End execute
    }); // End registerCommand
} // End registerDuelCommand