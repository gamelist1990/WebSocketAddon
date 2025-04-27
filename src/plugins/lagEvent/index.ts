import {
    world,
    system,
    Vector3,
} from '@minecraft/server';
import { Module, moduleManager } from '../../module/module';

interface PlayerPingData {
    lastPosition: Vector3;
    lastTick: number;
    estimatedPing: number; // 推定ping (tick単位)
    pingHistory: number[];
    smoothedPing: number;
    lastDistance: number;
    speedHistory: number[];
    averageSpeed: number;  // 平均速度
    isMoving: boolean; // プレイヤーが移動中かどうか
}

class PingDetectionModule implements Module {
    name = 'PingDetector';
    enabledByDefault = true;
    docs = `プレイヤーの動きからPingを推定し、アクションバーに詳細な情報を表示します。\n
**機能**\n
§r- プレイヤーの位置情報の変化からPingを推定します。\n
§r- アクションバーに詳細なPing情報 (tick, ms, 平滑化値, 移動距離, 速度) を表示します。\n
§r- 推定Ping値をconsole.logに出力します。`;

    private playerPingData: Map<string, PlayerPingData> = new Map();
    private readonly MAX_PING = 50;
    private readonly SMOOTHING_FACTOR = 0.5;
    private readonly PING_HISTORY_SIZE = 10;
    private readonly SPEED_HISTORY_SIZE = 10; // スピード履歴サイズ
    private readonly EXPECTED_SPEED = 0.22;  // 期待される/通常の移動速度 (blocks/tick)
    private readonly STOP_THRESHOLD = 0.05; // 停止判定の閾値 (これより小さい移動は停止とみなす)

    private displayActionbar = true;

    constructor() { }

    onEnable(): void {
        this.registerEventListeners();
    }

    onInitialize(): void {
        this.registerEventListeners();
    }

    onDisable(): void {
        this.unregisterEventListeners();
        this.playerPingData.clear();
        this.displayActionbar = false;
    }

    private registerEventListeners(): void {
        system.runInterval(() => this.estimatePing(), 1);
    }

    private unregisterEventListeners(): void {
        // system.runInterval() で登録したものは解除できない
    }

    private calculateDistance(pos1: Vector3, pos2: Vector3): number {
        return Math.sqrt(
            Math.pow(pos1.x - pos2.x, 2) +
            Math.pow(pos1.y - pos2.y, 2) +
            Math.pow(pos1.z - pos2.z, 2)
        );
    }

    private estimatePing(): void {
        for (const player of world.getAllPlayers()) {
            const playerName = player.name;
            const currentPosition = player.location;
            const currentTick = system.currentTick;

            if (!this.playerPingData.has(playerName)) {
                this.playerPingData.set(playerName, {
                    lastPosition: currentPosition,
                    lastTick: currentTick,
                    estimatedPing: 0,
                    pingHistory: [],
                    smoothedPing: 0,
                    lastDistance: 0,
                    speedHistory: [],
                    averageSpeed: 0,
                    isMoving: false, // 最初は停止状態
                });
                continue;
            }

            const data = this.playerPingData.get(playerName)!;
            const distance = this.calculateDistance(currentPosition, data.lastPosition);

            // 停止判定:  微小な移動が一定時間続いたら停止とみなす
            if (distance < this.STOP_THRESHOLD) {
                if (data.isMoving) {
                    // 停止状態に移行
                    data.isMoving = false;
                    this.updatePlayerData(player, data, data.smoothedPing, data.smoothedPing, 0, 0); // 情報更新、速度は0
                    continue; // 停止状態ではこれ以降の処理はスキップ
                } else {
                    // smoothedPingの維持。
                    this.updatePlayerData(player, data, data.smoothedPing, data.smoothedPing, 0, 0);
                    continue;
                }
            } else {
                data.isMoving = true;
            }


            // 速度の計算 (1 tick あたりの移動距離)
            const speed = distance;

            // Ping の推定:  速度と期待速度の比率に基づいて計算
            let estimatedPing = 1; // 基本は1tick
            if (speed > 0) { // 速度が0より大きい場合のみ計算
                estimatedPing = this.EXPECTED_SPEED / speed;
                estimatedPing = Math.max(1, estimatedPing); // 最小値を1にする
            }


            let smoothedPing = estimatedPing;
            if (data.pingHistory.length > 0) {
                const lastPing = data.pingHistory[data.pingHistory.length - 1];
                smoothedPing = this.SMOOTHING_FACTOR * lastPing + (1 - this.SMOOTHING_FACTOR) * estimatedPing;
            }

            smoothedPing = Math.min(smoothedPing, this.MAX_PING);

            this.updatePlayerData(player, data, estimatedPing, smoothedPing, distance, speed);

        }
    }


    private updatePlayerData(player: any, data: PlayerPingData, estimatedPing: number, smoothedPing: number, distance: number, speed: number): void {
        data.estimatedPing = estimatedPing;
        data.smoothedPing = smoothedPing;
        data.lastDistance = distance;

        data.pingHistory.push(estimatedPing);
        if (data.pingHistory.length > this.PING_HISTORY_SIZE) {
            data.pingHistory.shift();
        }

        data.speedHistory.push(speed);
        if (data.speedHistory.length > this.SPEED_HISTORY_SIZE) {
            data.speedHistory.shift();
        }

        // 平均速度の計算
        data.averageSpeed = data.speedHistory.reduce((sum, val) => sum + val, 0) / data.speedHistory.length;


        data.lastPosition = player.location;
        data.lastTick = system.currentTick;

        // アクションバーの表示 (見やすく整理)
        if (this.displayActionbar) {

            const status = data.isMoving ? "§aMoving§r" : "§cStopped§r"; // 移動状態

            const actionbarText = `§l§6[Ping Info]§r  ${status}\n` + // タイトル (太字、色付き) + 移動状態
                `§aPing:§r ${data.estimatedPing.toFixed(1)} tick (§b${(data.estimatedPing * 50).toFixed(0)} ms§r)  ` +
                `§2|§r  §aSmoothed:§r ${data.smoothedPing.toFixed(1)} tick (§b${(data.smoothedPing * 50).toFixed(0)} ms§r)\n` +
                `§aDistance:§r ${data.lastDistance.toFixed(2)} blocks  ` +
                `§2|§r  §aSpeed:§r ${speed.toFixed(2)} b/t  ` +
                `§2|§r  §aAvg Speed:§r ${data.averageSpeed.toFixed(2)} b/t`;

            player.onScreenDisplay.setActionBar(actionbarText);
        }


        console.log(`[${player.name}] Ping: ${data.estimatedPing.toFixed(1)} ticks (${(data.estimatedPing * 50).toFixed(0)} ms), Smoothed Ping: ${data.smoothedPing.toFixed(1)} ticks (${(data.smoothedPing * 50).toFixed(0)} ms), Distance: ${distance.toFixed(2)}, Speed: ${speed.toFixed(2)} b/t, Avg Speed: ${data.averageSpeed.toFixed(2)} b/t, Moving: ${data.isMoving}`);

    }

}

const pingDetectionModule = new PingDetectionModule();
moduleManager.registerModule(pingDetectionModule);