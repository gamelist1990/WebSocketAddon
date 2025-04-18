// Minecraft Server API の Vector3 は使わない
import { Player, system, world, Dimension } from "@minecraft/server";
import { Handler } from "../../../module/Handler";
import { Vector3 } from "../../../module/Vector3";
// --- 自作の Vector3 クラスをインポート ---

// --- RegionData インターフェースの座標を Vector3 型に変更 ---
interface RegionData {
    regionName: string; // regionName を追加 (Mapのキーと重複するが、データ内にも保持)
    start: Vector3;
    end: Vector3;
    tag: string;
    particle: boolean;
    teleport: boolean;
    teleportLocation?: Vector3; // オプショナルに変更し、Vector3 型に
    particleRange: number;
    particleMinDistance: number;
    ignoreY?: number;
    lastUpdated: number; // Tick単位の最終更新時刻
    area?: {
        scoreboardObjective: string;
        scoreName: string;
        maxValue: number;
    };
    // 内部計算用に追加（オプション）
    minBounds?: Vector3;
    maxBounds?: Vector3;
    center?: Vector3;
}

export function registerRegionControlCommand(handler: Handler, moduleName: string) {
    // --- regionDataMap の型定義を修正 ---
    const regionDataMap: { [key: string]: RegionData } = {};
    const autoDeleteIntervalTicks = 1; // 5秒 (例)

    // --- Vector3 を使うようにヘルパー関数を修正 ---
    // (showRegionParticles, isInsideRegion, getNearestPointInRegion は変更なし)
    const showRegionParticles = (
        dimension: Dimension,
        minBounds: Vector3,
        maxBounds: Vector3,
        playerLocation: Vector3,
        particleRange: number,
        particleMinDistance: number,
        ignoreY: number | undefined
    ) => {
        const density = 0.5;
        const particleRangeSq = particleRange * particleRange;
        const particleMinDistanceSq = particleMinDistance * particleMinDistance;
        const particlePos = new Vector3();

        const shouldSpawnY = (y: number): boolean => {
            return typeof ignoreY !== 'number' || y >= ignoreY;
        };

        const checkDistanceAndSpawn = (pos: Vector3) => {
            if (!shouldSpawnY(pos.y)) return;
            const distSq = playerLocation.distanceToSquared(pos);
            if (distSq <= particleRangeSq && distSq >= particleMinDistanceSq) {
                try {
                    dimension.spawnParticle("minecraft:basic_flame_particle", pos);
                } catch (e) {
                    // console.warn(`Particle spawn failed at ${pos}: ${e}`);
                }
            }
        };

        for (let x = minBounds.x; x <= maxBounds.x; x += density) {
            for (let y = minBounds.y; y <= maxBounds.y; y += density) {
                checkDistanceAndSpawn(particlePos.set(x, y, minBounds.z));
                checkDistanceAndSpawn(particlePos.set(x, y, maxBounds.z));
            }
        }
        for (let x = minBounds.x; x <= maxBounds.x; x += density) {
            for (let z = minBounds.z; z <= maxBounds.z; z += density) {
                checkDistanceAndSpawn(particlePos.set(x, minBounds.y, z));
                checkDistanceAndSpawn(particlePos.set(x, maxBounds.y, z));
            }
        }
        for (let y = minBounds.y; y <= maxBounds.y; y += density) {
            for (let z = minBounds.z; z <= maxBounds.z; z += density) {
                checkDistanceAndSpawn(particlePos.set(minBounds.x, y, z));
                checkDistanceAndSpawn(particlePos.set(maxBounds.x, y, z));
            }
        }
    };

    const isInsideRegion = (point: Vector3, minBounds: Vector3, maxBounds: Vector3, ignoreY?: number): boolean => {
        if (typeof ignoreY === 'number' && point.y < ignoreY) {
            return false;
        }
        return (
            point.x >= minBounds.x && point.x <= maxBounds.x &&
            point.y >= minBounds.y && point.y <= maxBounds.y &&
            point.z >= minBounds.z && point.z <= maxBounds.z
        );
    }

    const getNearestPointInRegion = (point: Vector3, minBounds: Vector3, maxBounds: Vector3): Vector3 => {
        const nearestX = Math.max(minBounds.x, Math.min(point.x, maxBounds.x));
        const nearestY = Math.max(minBounds.y, Math.min(point.y, maxBounds.y));
        const nearestZ = Math.max(minBounds.z, Math.min(point.z, maxBounds.z));
        return new Vector3(nearestX, nearestY, nearestZ);
    };


    /**
     * JSONデータ(配列)からRegionDataオブジェクトを生成・更新する
     * (この関数自体は配列を受け取る前提のまま)
     */
    const processRegionData = (regionDataArray: any[], sendMessage: (message: string) => void) => {
        if (!Array.isArray(regionDataArray)) {
            // 基本的にこの関数が呼ばれる時点では配列のはずだが、念のためチェック
            sendMessage("内部エラー: processRegionData は配列を受け取る必要があります。");
            return;
        }

        let processedCount = 0;
        let errorCount = 0;

        for (const regionJson of regionDataArray) {
            if (typeof regionJson !== "object" || regionJson === null) {
                sendMessage("警告: 配列内の無効なデータ型をスキップしました (オブジェクトではありません)。");
                errorCount++;
                continue;
            }

            // --- バリデーション ---
            const { regionName, start, end, tag, particle, teleport, teleportLocation, particleRange, particleMinDistance, ignoreY, area } = regionJson;

            if (typeof regionName !== "string" || regionName.trim() === "") { sendMessage(`エラー [${regionName ?? '不明'}]: regionName は必須の文字列です。`); errorCount++; continue; }
            if (!start || !end || typeof start !== 'object' || typeof end !== 'object') { sendMessage(`エラー [${regionName}]: start と end は必須のオブジェクトです。`); errorCount++; continue; }
            if (typeof start.x !== 'number' || typeof start.y !== 'number' || typeof start.z !== 'number') { sendMessage(`エラー [${regionName}]: start の座標が無効です。`); errorCount++; continue; }
            if (typeof end.x !== 'number' || typeof end.y !== 'number' || typeof end.z !== 'number') { sendMessage(`エラー [${regionName}]: end の座標が無効です。`); errorCount++; continue; }
            if (typeof tag !== "string") { sendMessage(`エラー [${regionName}]: tag は必須の文字列です。`); errorCount++; continue; }
            if (typeof particle !== "boolean") { sendMessage(`エラー [${regionName}]: particle は必須の真偽値です。`); errorCount++; continue; }
            if (typeof teleport !== "boolean") { sendMessage(`エラー [${regionName}]: teleport は必須の真偽値です。`); errorCount++; continue; }
            if (teleport && (!teleportLocation || typeof teleportLocation !== 'object' || typeof teleportLocation.x !== 'number' || typeof teleportLocation.y !== 'number' || typeof teleportLocation.z !== 'number')) {
                sendMessage(`エラー [${regionName}]: teleport が true の場合、teleportLocation ({x,y,z}) が必須です。`); errorCount++; continue;
            }
            if (typeof particleRange !== "number" || particleRange < 0) { sendMessage(`エラー [${regionName}]: particleRange は 0 以上の数値である必要があります。`); errorCount++; continue; }
            if (typeof particleMinDistance !== "number" || particleMinDistance < 0) { sendMessage(`エラー [${regionName}]: particleMinDistance は 0 以上の数値である必要があります。`); errorCount++; continue; }
            if (particleMinDistance > particleRange) { sendMessage(`エラー [${regionName}]: particleMinDistance は particleRange 以下である必要があります。`); errorCount++; continue; }
            if (ignoreY !== undefined && typeof ignoreY !== "number") { sendMessage(`エラー [${regionName}]: ignoreY を指定する場合、数値である必要があります。`); errorCount++; continue; }
            if (area !== undefined && (typeof area !== "object" || area === null || typeof area.scoreboardObjective !== "string" || typeof area.scoreName !== "string" || typeof area.maxValue !== "number" || area.maxValue <= 0)) {
                sendMessage(`エラー [${regionName}]: area は {scoreboardObjective: string, scoreName: string, maxValue: number (>0)} 形式のオブジェクトである必要があります。`); errorCount++; continue;
            }

            // --- Vector3 インスタンスの生成 ---
            const startVec = new Vector3(start.x, start.y, start.z);
            const endVec = new Vector3(end.x, end.y, end.z);
            const teleportVec = teleport && teleportLocation ? new Vector3(teleportLocation.x, teleportLocation.y, teleportLocation.z) : undefined;

            // --- 最小・最大座標と中心座標を計算して保存（事前計算） ---
            const minBounds = new Vector3(
                Math.min(startVec.x, endVec.x),
                Math.min(startVec.y, endVec.y),
                Math.min(startVec.z, endVec.z)
            );
            const maxBounds = new Vector3(
                Math.max(startVec.x, endVec.x),
                Math.max(startVec.y, endVec.y),
                Math.max(startVec.z, endVec.z)
            );
            const center = startVec.add(endVec).multiplyScalarInPlace(0.5);


            // --- regionDataMap に格納 ---
            regionDataMap[regionName] = {
                regionName,
                start: startVec,
                end: endVec,
                tag,
                particle,
                teleport,
                teleportLocation: teleportVec,
                particleRange,
                particleMinDistance,
                ignoreY,
                lastUpdated: system.currentTick,
                area,
                minBounds,
                maxBounds,
                center
            };
            processedCount++;
        }

        if (processedCount > 0) {
        }
        if (errorCount > 0) {
        }
    };

    // --- コマンド登録 ---
    handler.registerCommand('regionControl', {
        moduleName: moduleName,
        description: 'リージョン制御コマンド。指定されたJSONに基づいてリージョン設定を追加または更新します。',
        usage: 'regionControl <JSONオブジェクト または JSON配列>\n 例1: regionControl {"regionName":"area1", ...}\n 例2: regionControl [{"regionName":"area1", ...}, {"regionName":"area2", ...}]',
        execute: (_message, event, args) => {
            const consoleOutput = (msg: string) => console.warn(`[${moduleName}] ${msg}`);
            const sendMessage = (msg: string) => {
                const prefixedMsg = `[${moduleName}] ${msg}`;
                const player = event.sourceEntity;
                if (player instanceof Player) {
                    system.run(() => player.sendMessage(prefixedMsg));
                } else {
                    consoleOutput(msg);
                }
            };

            try {
                const argsString = args.join(' ')

                if (argsString === "") {
                    sendMessage('JSONデータが指定されていません。usageを確認してください。');
                    return;
                }

                let regionDataInput: any;
                try {
                    // 引数全体をJSONとしてパース試行
                    regionDataInput = JSON.parse(argsString);
                } catch (e: any) {
                    sendMessage(`JSONの解析に失敗しました: ${e.message}`);
                    consoleOutput(`JSON Parse Error for input: ${argsString} - Error: ${e}`);
                    return;
                }

                let regionDataArray: any[];

                // --- ★★★ 入力がオブジェクトか配列かをチェックして処理を分岐 ★★★ ---
                if (Array.isArray(regionDataInput)) {
                    regionDataArray = regionDataInput;
                } else if (typeof regionDataInput === 'object' && regionDataInput !== null) {
                    regionDataArray = [regionDataInput];
                } else {
                    sendMessage('入力データはJSONオブジェクトまたはJSON配列である必要があります。');
                    return;
                }
                // --------------------------------------------------------------

                // processRegionData には常に配列を渡す
                processRegionData(regionDataArray, sendMessage);

            } catch (error: any) {
                consoleOutput(`コマンド処理中に予期せぬエラーが発生しました: ${error.message ?? error}\n${error.stack}`);
                sendMessage(`エラーが発生しました: ${error.message ?? error}`);
            }
        }
    });

    // --- 定期実行処理 (Tickイベント) ---
    system.runInterval(() => {
        const currentTick = system.currentTick;
        const players = world.getAllPlayers();

        // --- 古いリージョンデータの削除 ---
        for (const regionName in regionDataMap) {
            if (currentTick - regionDataMap[regionName].lastUpdated > autoDeleteIntervalTicks) {
                delete regionDataMap[regionName];
            }
        }

        // --- 各プレイヤーに対するリージョン処理 ---
        if (players.length === 0 || Object.keys(regionDataMap).length === 0) {
            return;
        }

        const playerLocationVec = new Vector3();
        const currentMin = new Vector3();
        const currentMax = new Vector3();
        const size = new Vector3();
        const halfSize = new Vector3();
        const scaledHalfSize = new Vector3();


        for (const player of players) {
            playerLocationVec.set(player.location.x, player.location.y, player.location.z);
            const playerDimension = player.dimension;

            for (const regionName in regionDataMap) {
                const regionData = regionDataMap[regionName];

                if (!player.hasTag(regionData.tag)) continue;

                let regionMin = regionData.minBounds!;
                let regionMax = regionData.maxBounds!;
                let regionCenter = regionData.center!;

                if (regionData.area) {
                    const objective = world.scoreboard.getObjective(regionData.area.scoreboardObjective);
                    if (objective) {
                        const score = objective.getScore(regionData.area.scoreName) ?? 0;
                        const clampedScore = Math.max(0, Math.min(score, regionData.area.maxValue));
                        const ratio = clampedScore / regionData.area.maxValue;

                        size.copy(regionData.maxBounds!).subtractInPlace(regionData.minBounds!);
                        halfSize.copy(size).multiplyScalarInPlace(0.5);
                        scaledHalfSize.copy(halfSize).multiplyScalarInPlace(ratio);

                        currentMin.copy(regionCenter).subtractInPlace(scaledHalfSize);
                        currentMax.copy(regionCenter).addInPlace(scaledHalfSize);

                        regionMin = currentMin;
                        regionMax = currentMax;
                    }
                }

                const isPlayerInside = isInsideRegion(playerLocationVec, regionMin, regionMax, regionData.ignoreY);

                if (!isPlayerInside) {
                    if (typeof regionData.ignoreY === 'number' && playerLocationVec.y < regionData.ignoreY) {
                        continue;
                    }

                    if (regionData.teleport && regionData.teleportLocation) {
                        player.teleport(regionData.teleportLocation, { dimension: playerDimension });
                    } else {
                        const nearestPoint = getNearestPointInRegion(playerLocationVec, regionMin, regionMax);
                        const pushDistance = 2.0;
                        const directionToCenter = new Vector3().copy(regionCenter).subtractInPlace(nearestPoint); // regionCenter - nearestPoint

                        let teleportTarget = nearestPoint; 

                        if (directionToCenter.lengthSquared() > 0.001) { // ゼロベクトルでないことを確認
                            directionToCenter.normalizeInPlace(); // 方向ベクトルを正規化
                            const pushVector = directionToCenter.multiplyScalarInPlace(pushDistance); // 押し込みベクトル計算
                            teleportTarget = new Vector3().copy(nearestPoint).addInPlace(pushVector); // 最近接点から内側に移動

                        }
                        // Player.teleport は {x, y, z} を期待するため、Vector3 をそのまま渡せない場合がある
                        // toIVec3() や {x: nearestPoint.x, ...} のような変換が必要な場合がある
                        try {
                            player.teleport({ x: teleportTarget.x, y: teleportTarget.y, z: teleportTarget.z }, { dimension: playerDimension });
                        } catch (e) {
                            console.warn(`テレポート失敗: ${e}`);
                            // Vector3 の toJSON() など、適切な形式に変換する
                            // player.teleport(nearestPoint.toJSON(), { dimension: playerDimension });
                        }
                    }
                    // continue; // テレポート後の処理を続けるかどうかの判断
                }

                if (regionData.particle) {
                    // showRegionParticles に渡す pos は {x,y,z} 形式を spawnParticle が期待する
                    // 自作 Vector3 が {x,y,z} プロパティを持っていればそのまま使える可能性が高い
                    showRegionParticles(
                        playerDimension,
                        regionMin,
                        regionMax,
                        playerLocationVec,
                        regionData.particleRange,
                        regionData.particleMinDistance,
                        regionData.ignoreY
                    );
                }
            } 
        } 
    }, 5);
}