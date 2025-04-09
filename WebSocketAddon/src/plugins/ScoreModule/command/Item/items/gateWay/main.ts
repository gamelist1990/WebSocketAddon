import {
    world,
    Player,
    system,
    Vector3,
    Dimension,
    EntityComponentTypes,
    Container,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem"; // Adjust path as needed
import { registerCustomItem } from "../../custom"; // Adjust path as needed
import { Vector } from "../../../../../../module/Vector"; // Adjust path as needed (assuming this is your custom Vector class)

// --- Constants ---
const GATEWAY_ITEM_ID = "minecraft:echo_shard";
const GATEWAY_NAME_TAG = "§5ゲートウェイ";
const GATEWAY_LORE_START = ["§7右クリックでゲートの始点を設置"];
const GATE_PARTICLE = "minecraft:sonic_explosion";
const GATE_ACTIVATION_DELAY_TICKS = 10; // ★ ゲート接続開始までの遅延 (1秒)
const GATE_DURATION_TICKS = 20 * 20; // ★ 接続完了 *後* の持続時間 (10秒)
const TELEPORT_COOLDOWN_TICKS = 1 * 20; // テレポート後のクールダウン (1秒)
const GATE_TOUCH_DISTANCE = 3; // ゲート接触判定の半径
const POS2_TRIGGER_DISTANCE = 30.0; // この距離を移動したらPos2を設置
const POS2_FORCE_PLACE_TICKS = 5 * 20; // この時間経過したらPos2を強制設置 (5秒)
const CUSTOM_ITEM_REGISTRY_ID = 19; // このアイテム固有の登録ID

// --- Gateway State Enum ---
enum GatewayState {
    Idle = "idle",                // 初期状態
    WaitingForPos2 = "waiting_for_pos2", // Pos1設置後、Pos2設置待ち
    Activating = "activating",      // ★ Pos2設置後、接続完了待ち (1秒間)
    Active = "active",              // 接続完了、テレポート可能
}

// --- Gateway Data Structure ---
interface GatewayData {
    state: GatewayState;
    pos1?: Vector3;
    pos2?: Vector3;
    dimensionId?: string;
    initialPosForDistanceCheck?: Vector3; // 移動距離計算用の初期座標
    particleInterval1?: number;       // Pos1 パーティクルタイマーID
    particleInterval2?: number;       // Pos2 パーティクルタイマーID
    teleportInterval?: number;        // テレポート判定タイマーID
    cleanupTimeout?: number;          // ★ ゲート全体の消滅タイマーID (Activeになってから開始)
    activationTimeout?: number;       // ★ ゲート接続完了待ちタイマーID
    movementCheckInterval?: number;   // 移動距離チェックタイマーID
    forcePlaceTimeout?: number;       // Pos2強制設置タイマーID
    forcePlaceTimeoutTargetTick?: number; // Pos2強制設置の目標Tick
    teleportCooldownUntilTick?: number; // テレポートクールダウン終了Tick
}

// --- Global Data Store ---
const gatewayDataMap = new Map<string, GatewayData>();

// --- Helper Functions ---
const consoleOutput = (msg: string) => console.warn(`[GatewayItem] ${msg}`);

/** プレイヤーのインベントリコンテナを取得 */
function getPlayerInventory(player: Player): Container | undefined {
    try {
        if (!player?.isValid) return undefined; // プレイヤーが無効ならnull
        const inventory = player.getComponent(EntityComponentTypes.Inventory);
        return inventory?.container;
    } catch (e) {
        // プレイヤーが無効になった際のエラーはログレベルを下げるか無視
        // consoleOutput(`Error getting inventory for ${player?.name ?? 'Invalid Player'}: ${e}`);
    }
    return undefined;
}

/** プレイヤーの足元のブロック座標を取得 */
function getPlacementLocation(player: Player): Vector3 {
    const loc = player.location;
    return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

/** 指定された system.run ID を停止 */
function stopAndClearRun(runId: number | undefined): void {
    if (typeof runId === 'number') {
        system.clearRun(runId);
    }
}

/** GatewayData 内の指定されたキーの system.run ID を停止し、プロパティをクリア */
function stopAndClearDataRun(playerId: string, dataKey: keyof GatewayData): void {
    const data = gatewayDataMap.get(playerId);
    if (data && typeof data[dataKey] === 'number') {
        system.clearRun(data[dataKey] as number);
        (data[dataKey] as any) = undefined; // プロパティをクリア
    }
}

/** ゲートのパーティクルエフェクトを開始 */
function startGateParticles(playerId: string, location: Vector3, intervalKey: 'particleInterval1' | 'particleInterval2'): number | undefined {
    const data = gatewayDataMap.get(playerId);
    // データとディメンションIDの存在を確認
    if (!data || !data.dimensionId) {
        consoleOutput(`startGateParticles: No data or dimensionId found for player ${playerId}`);
        return undefined;
    }

    let dimension: Dimension;
    try {
        dimension = world.getDimension(data.dimensionId);
    } catch (e) {
        consoleOutput(`Dimension ${data.dimensionId} not found for particle effect for ${playerId}: ${e}`);
        return undefined;
    }

    // パーティクル表示座標 (ブロック中央)
    const particlePos = `${location.x + 0.5} ${location.y + 0.5} ${location.z + 0.5}`;
    const particleCmd = `particle ${GATE_PARTICLE} ${particlePos}`;
    let intervalId: number | undefined = undefined;

    try {
        intervalId = system.runInterval(() => {
            // --- コールバック内でのプレイヤーとデータの再取得と検証 ---
            const currentData = gatewayDataMap.get(playerId);
            const player = world.getEntity(playerId);

            // ★ 停止条件を調整: Activating状態でもパーティクルは表示し続ける
            if (
                !(player instanceof Player && player.isValid) || // プレイヤーが無効
                !currentData ||                              // データがない
                currentData[intervalKey] !== intervalId ||     // このタイマーIDではない
                player.dimension.id !== currentData.dimensionId || // ディメンションが違う
                ( // 停止すべき状態
                    currentData.state === GatewayState.Idle || // Idle状態
                    (currentData.state === GatewayState.WaitingForPos2 && intervalKey === 'particleInterval2') // Waiting状態でPos2パーティクルが動いてる(異常)
                )
            ) {
                stopAndClearRun(intervalId);
                // データ内のIDがこのインターバルIDと一致する場合のみクリア
                if (currentData && currentData[intervalKey] === intervalId) {
                    (currentData[intervalKey] as any) = undefined;
                }
                return; // 停止
            }
            try {
                // runCommandAsync を使用 (runCommandでも可)
                dimension.runCommand(particleCmd);
            } catch (runCmdError) {
                // consoleOutput(`RunCommand error for particle: ${runCmdError}`); // ログが多い可能性があるのでコメントアウトも検討
            }
        }, 5); // 5tickごと (0.25秒)

        // インターバルIDをデータに保存
        data[intervalKey] = intervalId;
        return intervalId;

    } catch (runIntervalError) {
        consoleOutput(`Failed to start particle interval ${intervalKey} for ${playerId}: ${runIntervalError}`);
        return undefined;
    }
}

/** ゲートの終点 (Pos2) を設置し、接続プロセスを開始 */
function placePos2(playerId: string) {
    const player = world.getEntity(playerId);
    const data = gatewayDataMap.get(playerId);

    // --- 事前チェック ---
    if (!(player instanceof Player && player.isValid)) {
        consoleOutput(`placePos2: Player ${playerId} not found or invalid.`);
        cleanupGatewayData(playerId);
        return;
    }
    if (!data) {
        consoleOutput(`placePos2: No data found for player ${playerId}.`);
        return; // データがない場合は何もしない
    }
    // WaitingForPos2 状態でのみ実行 (または Activating 状態から再呼び出しされることは現状ないはずだが念のため)
    if (data.state !== GatewayState.WaitingForPos2) {
        consoleOutput(`placePos2: Player ${playerId} not in WaitingForPos2 state (state: ${data.state}).`);
        // 既に別の状態に移行しているなら何もしない (例: ほぼ同時に移動と右クリックが行われた場合など)
        return;
    }
    // ディメンションチェック
    if (!data.dimensionId || player.dimension.id !== data.dimensionId) {
        system.run(() => player.sendMessage("§cゲートは同じディメンション内でのみ設置できます。キャンセルされました。"));
        cleanupGatewayData(playerId);
        return;
    }
    // Pos1存在チェック
    if (!data.pos1) {
        consoleOutput(`placePos2: Missing pos1 for player ${playerId}.`);
        cleanupGatewayData(playerId);
        return;
    }

    consoleOutput(`Placing Pos2 for ${player.name} at their current location.`);

    // --- WaitingForPos2 関連のタイマー停止 ---
    stopAndClearDataRun(playerId, 'forcePlaceTimeout');
    stopAndClearDataRun(playerId, 'movementCheckInterval');
    data.forcePlaceTimeoutTargetTick = undefined; // 目標Tickもクリア

    // --- アクションバークリア ---
    try {
        player.onScreenDisplay.setActionBar("");
    } catch (e) { /* ignore */ }

    // --- Pos2 設置と接続開始処理 ---
    try {
        const pos2Location = getPlacementLocation(player);

        // Pos1 と同じ場所への設置を禁止
        if (Vector.equals(data.pos1, pos2Location)) {
            system.run(() => player.sendMessage("§c始点と同じ場所には終点を設置できません。キャンセルされました。"));
            cleanupGatewayData(playerId);
            return;
        }

        data.pos2 = pos2Location;
        data.state = GatewayState.Activating; // ★ 状態を Activating に変更

        // Pos2 のパーティクルを開始
        data.particleInterval2 = startGateParticles(playerId, pos2Location, 'particleInterval2');
        if (!data.particleInterval2) {
            consoleOutput(`Failed to start particles for pos2 for player ${playerId}. Proceeding without particles.`);
        }

        // --- ★ アイテム消費 ---
        const inventory = getPlayerInventory(player);
        let consumed = false;
        if (inventory) {
            const selectedSlot = player.selectedSlotIndex;
            const item = inventory.getItem(selectedSlot);
            // 手に持っているアイテムがゲートウェイアイテムか確認
            if (item && item.typeId === GATEWAY_ITEM_ID && item.nameTag === GATEWAY_NAME_TAG) {
                if (item.amount > 1) {
                    item.amount -= 1; // スタック数を減らす
                    inventory.setItem(selectedSlot, item);
                } else {
                    inventory.setItem(selectedSlot, undefined); // アイテムを削除
                }
                consoleOutput(`Consumed one gateway item from ${player.name}`);
                consumed = true;
            } else {
                consoleOutput(`Player ${player.name} was not holding the gateway item upon pos2 placement confirmation.`);
            }
        } else {
            consoleOutput(`Could not get inventory for ${player.name} to consume item.`);
        }

        // アイテム消費に失敗したらキャンセル
        if (!consumed) {
            system.run(() => player.sendMessage("§cゲートウェイアイテムを手に持っていなかったため、設置をキャンセルしました。"));
            cleanupGatewayData(playerId);
            return;
        }
        // --- ★ アイテム消費ここまで ---

        // アイテムのLoreを元に戻す (消費後に行う)
        updateGatewayItemLore(player, GATEWAY_LORE_START);

        // --- ★ ゲート接続完了までの遅延タイマーを設定 ---
        const activationTimeoutId = system.runTimeout(() => {
            // --- コールバック内でのプレイヤーとデータの再取得・検証 ---
            const currentData = gatewayDataMap.get(playerId);
            const currentPlayer = world.getEntity(playerId); // 最新のプレイヤー情報を取得

            // プレイヤーが有効か、データが存在するか、状態が Activating か、このタイマーIDが正しいかを確認
            if (
                !(currentPlayer instanceof Player && currentPlayer.isValid) ||
                !currentData ||
                currentData.state !== GatewayState.Activating || // ★ Activating 状態であることを確認
                currentData.activationTimeout !== activationTimeoutId // ★ このタイマーIDであることを確認
            ) {
                consoleOutput(`Activation cancelled or invalid state for ${playerId} during activation timeout.`);
                // 既にキャンセルされたか、状態が変わったか、プレイヤーがログアウトした可能性
                // Activating 状態でない場合、既に cleanup されている可能性が高い
                if (currentData && currentData.state !== GatewayState.Activating) {
                    // 状態が変わっている場合は何もしない（既に別の処理が走っている）
                } else {
                    cleanupGatewayData(playerId); // それ以外（プレイヤー無効など）の場合はクリーンアップ
                }
                return; // 何もしない
            }
            // --- 検証ここまで ---

            consoleOutput(`Activating gate for ${playerId}`);
            currentData.state = GatewayState.Active; // <-- ★ 状態を Active に設定
            currentData.activationTimeout = undefined; // ★ 使用済みタイマーIDをクリア

            // テレポートチェックを開始 (接続完了後)
            currentData.teleportInterval = startTeleportCheck(playerId);
            if (!currentData.teleportInterval) {
                consoleOutput(`Failed to start teleport check for player ${playerId} after activation. Gate inactive.`);
                system.run(() => currentPlayer.sendMessage("§cテレポート機能の開始に失敗しました。"));
                cleanupGatewayData(playerId); // テレポート開始失敗時はクリーンアップ
                return;
            }

            // ゲート全体の消滅タイマーを開始 (接続完了後)
            const cleanupTimeoutId = system.runTimeout(() => {
                // コールバック内でデータを再取得・検証
                const latestData = gatewayDataMap.get(playerId);
                // ゲートがまだ Active で、このタイムアウトが有効なものか確認
                if (latestData && latestData.state === GatewayState.Active && latestData.cleanupTimeout === cleanupTimeoutId) {
                    const finalPlayer = world.getEntity(playerId);
                    // プレイヤーが有効ならメッセージ送信
                    if (finalPlayer instanceof Player && finalPlayer.isValid) {
                        system.run(() => finalPlayer.sendMessage("§7ゲートの接続が切れました。"));
                    }
                    cleanupGatewayData(playerId); // 時間切れでクリーンアップ
                }
            }, GATE_DURATION_TICKS); // 全体の有効期間
            currentData.cleanupTimeout = cleanupTimeoutId; // ★ メインのクリーンアップタイマーIDを保存

            // プレイヤーに接続完了を通知
            system.run(() => {
                // currentPlayer がまだ有効か確認
                if (currentPlayer?.isValid) {
                    currentPlayer.sendMessage(`§aゲートの接続が完了しました！ (${GATE_DURATION_TICKS / 20}秒間有効)`);
                    currentPlayer.playSound("block.beacon.activate", { location: currentPlayer.location }); // 接続完了サウンド
                }
            });

        }, GATE_ACTIVATION_DELAY_TICKS); // ★ 設定した遅延時間

        // ★ 開始した遅延タイマーのIDをデータに保存
        data.activationTimeout = activationTimeoutId;

        // --- ★ プレイヤーへの初期メッセージを変更 ---
        system.run(() => {
            if (player?.isValid) {
                player.sendMessage(`§bゲート終点を設置し、接続を開始します... (${GATE_ACTIVATION_DELAY_TICKS / 20}秒後に開通)`);
                player.playSound("block.portal.trigger", { location: player.location }); // 設置音
                // Lore は消費後にリセット済み
            }
        });

    } catch (error) {
        consoleOutput(`Error during placePos2 (or activation setup) for ${playerId}: ${error}`);
        system.run(() => {
            // エラー発生時、player がまだ有効かチェック
            if (player?.isValid) {
                player.sendMessage("§cゲート終点の設置または接続開始に失敗しました。");
            }
        });
        cleanupGatewayData(playerId); // エラー発生時もクリーンアップ
    }
}

/** ゲート付近のプレイヤーをテレポートさせる処理を開始 */
function startTeleportCheck(playerId: string): number | undefined {
    consoleOutput(`Starting teleport check for ${playerId}`);
    try {
        let intervalId: number | undefined = undefined;
        intervalId = system.runInterval(() => {
            // --- コールバック内でのプレイヤーとデータの再取得と検証 ---
            const player = world.getEntity(playerId);
            const data = gatewayDataMap.get(playerId);

            // プレイヤー有効性、データ存在、Active状態、タイマーID一致、
            // 位置情報存在、ディメンション一致を確認
            if (
                !(player instanceof Player && player.isValid) ||
                !data || data.state !== GatewayState.Active || // ★ Active状態でのみ動作
                data.teleportInterval !== intervalId ||
                !data.pos1 || !data.pos2 || !data.dimensionId ||
                player.dimension.id !== data.dimensionId
            ) {
                stopAndClearRun(intervalId); // このインターバルを停止 (clearDataRun だと無限ループの可能性)
                // データ内のIDがこのインターバルIDと一致する場合のみクリア
                if (data && data.teleportInterval === intervalId) {
                    data.teleportInterval = undefined;
                }
                // Active状態でのみクリーンアップを検討すべきだが、通常は cleanupTimeout が処理
                // プレイヤーが無効になった場合は playerLeave イベントで cleanup される
                return; // 条件を満たさない場合は終了
            }
            // --- 検証ここまで ---

            // --- クールダウンチェック ---
            const currentTick = system.currentTick;
            if (data.teleportCooldownUntilTick && currentTick < data.teleportCooldownUntilTick) {
                return; // クールダウン中
            } else if (data.teleportCooldownUntilTick && currentTick >= data.teleportCooldownUntilTick) {
                data.teleportCooldownUntilTick = undefined; // クールダウン終了
            }

            // --- テレポートロジック ---
            const gatePos1 = data.pos1;
            const gatePos2 = data.pos2;
            // Vector.add が未定義の場合、手動で加算する
            const gateCenter1: Vector3 = { x: gatePos1.x + 0.5, y: gatePos1.y + 0.5, z: gatePos1.z + 0.5 };
            const gateCenter2: Vector3 = { x: gatePos2.x + 0.5, y: gatePos2.y + 0.5, z: gatePos2.z + 0.5 };
            const playerLocation = player.location;

            try {
                let targetLocation: Vector3 | undefined = undefined;
                let soundLocation: Vector3 | undefined = undefined;

                // Pos1 付近かチェック
                // Vector.distance が未定義の場合、MinecraftのVectorを使うか手動で計算
                // MinecraftVector.distance を使う例:
                // if (MinecraftVector.distance(playerLocation, gateCenter1) <= GATE_TOUCH_DISTANCE) {
                // 手動計算の例:
                const dx1 = playerLocation.x - gateCenter1.x;
                const dy1 = playerLocation.y - gateCenter1.y;
                const dz1 = playerLocation.z - gateCenter1.z;
                const distSq1 = dx1 * dx1 + dy1 * dy1 + dz1 * dz1;

                const dx2 = playerLocation.x - gateCenter2.x;
                const dy2 = playerLocation.y - gateCenter2.y;
                const dz2 = playerLocation.z - gateCenter2.z;
                const distSq2 = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;

                const touchDistSq = GATE_TOUCH_DISTANCE * GATE_TOUCH_DISTANCE;

                if (distSq1 <= touchDistSq) {
                    targetLocation = gateCenter2; // Pos2へ
                    soundLocation = gateCenter2;
                }
                // Pos2 付近かチェック
                else if (distSq2 <= touchDistSq) {
                    targetLocation = gateCenter1; // Pos1へ
                    soundLocation = gateCenter1;
                }

                // テレポート実行
                if (targetLocation && soundLocation) {
                    player.teleport(targetLocation, {
                        dimension: player.dimension // 同じディメンション内なのでこれでOK
                    });
                    player.playSound("mob.shulker.teleport", { location: soundLocation }); // 到着地点で音を鳴らす

                    // クールダウン設定
                    data.teleportCooldownUntilTick = currentTick + TELEPORT_COOLDOWN_TICKS;
                }

            } catch (teleportError) {
                consoleOutput(`Teleport error for ${playerId}: ${teleportError}`);
                // テレポートエラーでインターバルを止める必要は通常ない
            }

        }, 2); // 2tickごと (0.1秒) にチェック

        // インターバルIDをデータに保存
        const currentData = gatewayDataMap.get(playerId);
        if (currentData) {
            currentData.teleportInterval = intervalId;
        } else {
            // データがない場合は開始したインターバルを即停止
            system.clearRun(intervalId);
            consoleOutput(`Failed to store teleport interval ID for ${playerId} as data was missing.`);
            return undefined;
        }
        return intervalId;

    } catch (runIntervalError) {
        consoleOutput(`Failed to start teleport check interval for ${playerId}: ${runIntervalError}`);
        return undefined;
    }
}

/** 指定されたプレイヤーIDのゲートウェイ関連データとタイマーをすべてクリーンアップ */
function cleanupGatewayData(playerId: string) {
    const data = gatewayDataMap.get(playerId);
    if (!data) return; // データが存在しない場合は何もしない

    consoleOutput(`Cleaning up gateway data for ${playerId} (State: ${data.state})`);
    const wasActive = data.state === GatewayState.Active || data.state === GatewayState.Activating; // クリーンアップ前にアクティブだったか

    try {
        // すべての関連タイマーを停止
        stopAndClearRun(data.particleInterval1);
        stopAndClearRun(data.particleInterval2);
        stopAndClearRun(data.teleportInterval);
        stopAndClearRun(data.movementCheckInterval);
        stopAndClearRun(data.forcePlaceTimeout);
        stopAndClearRun(data.activationTimeout); // ★ activationTimeout もクリア
        stopAndClearRun(data.cleanupTimeout);

        // プレイヤーがオンラインならアクションバークリアとLoreリセットを試みる
        const player = world.getEntity(playerId);
        if (player instanceof Player && player.isValid) {
            try {
                // WaitingForPos2状態でのキャンセル時のみアクションバークリア
                // (Active/Activating 完了/キャンセル時はメッセージを残さないようにする)
                if (data.state === GatewayState.WaitingForPos2) {
                    player.onScreenDisplay.setActionBar("");
                }
            } catch (e) { /* ignore */ }
            // Loreのリセット (キャンセル時や終了時に重要)
            // アクティブだった場合は既にアイテム消費＆Loreリセットされているはずなので、Waiting中のみリセット
            if (!wasActive) {
                system.run(() => updateGatewayItemLore(player, GATEWAY_LORE_START));
            } else {
                // アクティブだった場合は、次のアイテム使用に備えて念のためリセットしても良い
                system.run(() => updateGatewayItemLore(player, GATEWAY_LORE_START));
            }
        }

    } catch (error) {
        consoleOutput(`Error during cleanup task stopping for ${playerId}: ${error}`);
    } finally {
        // 常にマップからデータを削除
        gatewayDataMap.delete(playerId);
        consoleOutput(`Gateway data deleted for ${playerId}`);
    }
}

/** プレイヤーが手に持っているゲートウェイアイテムのLoreを更新 */
function updateGatewayItemLore(player: Player, newLore: string[]) {
    // system.run内で実行し、タイミング問題を回避
    system.run(() => {
        // プレイヤーの有効性を再チェック
        if (!player?.isValid) return;

        try {
            const inventory = getPlayerInventory(player);
            if (!inventory) return;

            const selectedSlot = player.selectedSlotIndex;
            const item = inventory.getItem(selectedSlot);

            // 手に持っているのがゲートウェイアイテムか確認
            if (item && item.typeId === GATEWAY_ITEM_ID && item.nameTag === GATEWAY_NAME_TAG) {
                // Lore が既に目的のものと同じ場合は更新しない (パフォーマンス改善)
                const currentLore = item.getLore();
                if (JSON.stringify(currentLore) !== JSON.stringify(newLore)) {
                    item.setLore(newLore);
                    inventory.setItem(selectedSlot, item);
                }
            }
        } catch (e) {
            // consoleOutput(`Failed to update lore for ${player.name}: ${e}`); // ログが多い可能性
        }
    });
}

// --- Custom Item Definition ---
const gatewayItem = new CustomItem({
    name: GATEWAY_NAME_TAG,
    lore: GATEWAY_LORE_START,
    item: GATEWAY_ITEM_ID,
    amount: 1,
    remove: false, // アイテム消費は placePos2 内で手動で行う
});

// --- Event Handler (ItemUse) ---
gatewayItem.then((player: Player, eventData: { eventType: EventType, /* other props */ }) => {
    // ItemUse イベント以外は無視
    if (eventData.eventType !== EventType.ItemUse) {
        return;
    }

    // プレイヤーの有効性を最初にチェック
    if (!player?.isValid) {
        consoleOutput("Gateway item used by an invalid player entity.");
        return;
    }

    const playerId = player.id;

    // system.run で処理を遅延実行 (イベントハンドラ内での長時間処理を避ける)
    system.run(() => {
        // --- system.run 内で再度プレイヤーの有効性をチェック ---
        const currentPlayer = world.getEntity(playerId);
        if (!(currentPlayer instanceof Player && currentPlayer.isValid)) {
            consoleOutput(`Player ${playerId} became invalid before gateway logic could run.`);
            // プレイヤーが無効ならデータもクリーンアップ (ログアウトなど)
            // cleanupGatewayData(playerId); // playerLeaveイベントで処理されるため、通常は不要
            return;
        }
        // --- ここからは currentPlayer を使う ---

        try {
            let currentData = gatewayDataMap.get(playerId);

            // --- 既存のゲート状態に応じた処理 ---
            if (currentData && currentData.state !== GatewayState.Idle) {
                switch (currentData.state) {
                    // ===============================================================
                    // ★★★ 修正箇所 ★★★
                    // ===============================================================
                    case GatewayState.WaitingForPos2: // Pos2設置待ち中に右クリック → その場に設置
                        currentPlayer.sendMessage("§a右クリック地点にゲート終点を設置します。");
                        // 設置音は placePos2 内で鳴らすのでここでは不要かも
                        // currentPlayer.playSound("block.portal.trigger", { location: currentPlayer.location });

                        // placePos2 を呼び出して終点を設置
                        placePos2(playerId);
                        break;
                    // ===============================================================
                    // ★★★ 修正ここまで ★★★
                    // ===============================================================

                    case GatewayState.Activating: // ★ 接続中に右クリック
                        currentPlayer.sendMessage("§eゲート接続中です。しばらくお待ちください。");
                        // 特に何もしない（キャンセル不可）
                        break;

                    case GatewayState.Active: // 接続完了後に右クリック
                        currentPlayer.sendMessage("§c現在ゲートが接続中です。");
                        // 特に何もしない（キャンセル不可）
                        break;
                }
                return; // 既存状態を処理したら終了
            }

            // --- 新規ゲート設置開始 (StateがIdle または データが存在しない) ---
            const pos1Location = getPlacementLocation(currentPlayer);

            // 新しいデータを初期化
            currentData = {
                state: GatewayState.WaitingForPos2, // 状態を更新
                pos1: pos1Location,
                initialPosForDistanceCheck: currentPlayer.location, // 移動距離計算の基点
                dimensionId: currentPlayer.dimension.id,
                forcePlaceTimeoutTargetTick: system.currentTick + POS2_FORCE_PLACE_TICKS, // 強制設置の目標Tick
            };
            gatewayDataMap.set(playerId, currentData); // ★★★ データを先にマップに保存 ★★★

            consoleOutput(`Set Pos1 for ${currentPlayer.name} at ${JSON.stringify(pos1Location)}`);

            // Pos1 のパーティクルを開始
            currentData.particleInterval1 = startGateParticles(playerId, pos1Location, 'particleInterval1');
            if (!currentData.particleInterval1) {
                consoleOutput(`Failed to start particles for pos1 for ${playerId}.`);
                // パーティクル失敗は致命的ではないことが多いので続行
            }

            // Pos2 強制設置タイマーを開始
            const forcePlaceTimeoutId = system.runTimeout(() => {
                // コールバック内でデータを再取得・検証
                const latestData = gatewayDataMap.get(playerId);
                const timeoutPlayer = world.getEntity(playerId); // プレイヤーも再取得

                // タイムアウト時にプレイヤーが有効で、まだ WaitingForPos2 状態か、かつこのタイマーIDか確認
                if (
                    timeoutPlayer?.isValid && // プレイヤーが有効か
                    latestData && latestData.state === GatewayState.WaitingForPos2 &&
                    latestData.forcePlaceTimeout === forcePlaceTimeoutId
                ) {
                    consoleOutput(`Force placement timeout triggered for ${playerId}`);
                    placePos2(playerId); // 強制的に Pos2 を設置
                } else {
                    consoleOutput(`Force placement timeout cancelled or invalid state for ${playerId}.`);
                    // 既に placePos2 が呼ばれたか、キャンセルされたか、プレイヤーがログアウトした
                }
            }, POS2_FORCE_PLACE_TICKS);
            currentData.forcePlaceTimeout = forcePlaceTimeoutId; // ★ タイマーIDを保存

            // 移動距離チェックとアクションバー更新タイマーを開始
            let movementIntervalId: number | undefined = undefined;
            movementIntervalId = system.runInterval(() => {
                // --- コールバック内でのプレイヤーとデータの再取得・検証 ---
                const intervalPlayer = world.getEntity(playerId);
                const latestData = gatewayDataMap.get(playerId);

                // プレイヤー有効性、データ存在、WaitingForPos2状態、タイマーID一致、
                // 必須情報存在、ディメンション一致を確認
                if (
                    !(intervalPlayer instanceof Player && intervalPlayer.isValid) ||
                    !latestData || latestData.state !== GatewayState.WaitingForPos2 ||
                    latestData.movementCheckInterval !== movementIntervalId ||
                    !latestData.initialPosForDistanceCheck ||
                    !latestData.forcePlaceTimeoutTargetTick ||
                    !latestData.dimensionId || intervalPlayer.dimension.id !== latestData.dimensionId
                ) {
                    stopAndClearRun(movementIntervalId);
                    // データ内のIDがこのインターバルIDと一致する場合のみクリア
                    if (latestData && latestData.movementCheckInterval === movementIntervalId) {
                        latestData.movementCheckInterval = undefined;
                    }
                    // アクションバーは placePos2 か cleanup でクリアされる
                    return; // 停止
                }
                // --- 検証ここまで ---

                // --- 距離と残り時間を計算 ---
                // Vector.distance が未定義の場合、手動計算 or MinecraftVector を使用
                // const distanceMoved = MinecraftVector.distance(intervalPlayer.location, latestData.initialPosForDistanceCheck);
                const pLoc = intervalPlayer.location;
                const iLoc = latestData.initialPosForDistanceCheck;
                const dx = pLoc.x - iLoc.x;
                const dy = pLoc.y - iLoc.y; // Y軸の移動も考慮する
                const dz = pLoc.z - iLoc.z;
                const distanceMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

                const currentTick = system.currentTick;
                const remainingTicks = Math.max(0, latestData.forcePlaceTimeoutTargetTick - currentTick);
                const remainingSeconds = Math.ceil(remainingTicks / 20);

                // --- アクションバー更新 ---
                // ★★★ 右クリックでの設置が可能になったことをアクションバーに追記 ★★★
                const actionBarMessage = `§bゲート終点設置まで: 残り ${remainingSeconds}秒 / 移動 ${distanceMoved.toFixed(1)}/${POS2_TRIGGER_DISTANCE.toFixed(1)}B §7(右クリックで現在地に設置)`;
                try {
                    intervalPlayer.onScreenDisplay.setActionBar(actionBarMessage);
                } catch (e) {
                    // consoleOutput(`Error setting action bar for ${intervalPlayer.name}: ${e}`);
                }

                // --- 移動距離によるトリガーチェック ---
                if (distanceMoved >= POS2_TRIGGER_DISTANCE) {
                    consoleOutput(`Movement trigger reached for ${playerId}`);
                    // placePos2内で関連タイマー停止とアクションバークリアが行われる
                    placePos2(playerId); // 移動距離に達したのでPos2設置
                    // 移動距離でplacePos2が呼ばれた場合、このインターバルは placePos2 内で停止されるはず
                }

            }, 10); // 10tickごと (0.5秒) にチェック
            currentData.movementCheckInterval = movementIntervalId; // ★ インターバルIDを保存

            // プレイヤーに通知、サウンド再生
            currentPlayer.sendMessage("§aゲートの始点を設置しました。移動するか、再度右クリックで終点を設置します。"); // メッセージ変更
            currentPlayer.playSound("block.respawn_anchor.set_spawn", { location: currentPlayer.location });
            // Lore はここでは変更せず、デフォルトのままにする
            // updateGatewayItemLore(currentPlayer, ["§7終点設置待機中...", "§7右クリックで現在地に設置"]); // 必要ならLoreも変更

        } catch (error) {
            consoleOutput(`Error in item use handler for ${playerId}: ${error}`);
            // エラー発生時、currentPlayer がまだ有効か確認してからメッセージ送信
            const finalPlayer = world.getEntity(playerId);
            if (finalPlayer instanceof Player && finalPlayer.isValid) {
                finalPlayer.sendMessage("§cゲートウェイの処理中にエラーが発生しました。");
            }
            cleanupGatewayData(playerId); // エラー時は必ずクリーンアップ
        }
    });
});

// --- Player Leave Cleanup ---
// プレイヤーが退出した際に、関連データをクリーンアップする
world.afterEvents.playerLeave.subscribe(event => {
    const playerId = event.playerId;
    if (gatewayDataMap.has(playerId)) {
        consoleOutput(`Player ${event.playerName ?? playerId} left, cleaning up gateway data.`);
        cleanupGatewayData(playerId);
    }
});


registerCustomItem(CUSTOM_ITEM_REGISTRY_ID, gatewayItem);

