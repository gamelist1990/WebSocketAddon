import { Player, system, world, Vector3, Dimension } from "@minecraft/server";
import { Handler } from "../../../module/Handler";

interface RegionData {
    start: Vector3;
    end: Vector3;
    tag: string;
    particle: boolean;
    teleport: boolean;
    teleportLocation?: Vector3;
    particleRange: number;
    particleMinDistance: number;
    ignoreY?: number;
    lastUpdated: number;
    area?: {
        scoreboardObjective: string;
        scoreName: string;
        maxValue: number;
    };
}

export function registerRegionControlCommand(handler: Handler, moduleName: string) {
    const regionDataMap: { [key: string]: RegionData } = {};
    const autoDeleteTimeout = 20 * 30;

    const showRegionParticles = (dimension: Dimension, start: Vector3, end: Vector3, playerLocation: Vector3, particleRange: number, particleMinDistance: number, ignoreY: number | undefined) => {
        const density = 0.5;

        let minX = Math.min(start.x, end.x);
        let minY = Math.min(start.y, end.y);
        let minZ = Math.min(start.z, end.z);
        let maxX = Math.max(start.x, end.x);
        let maxY = Math.max(start.y, end.y);
        let maxZ = Math.max(start.z, end.z);

        if (typeof ignoreY === 'number') {
            minY = Math.max(minY, ignoreY);
        }


        const checkDistanceAndSpawn = (x: number, y: number, z: number) => {
            if (typeof ignoreY === 'number' && y < ignoreY) {
                return;
            }

            const distance = Math.sqrt(
                Math.pow(playerLocation.x - x, 2) +
                Math.pow(playerLocation.y - y, 2) +
                Math.pow(playerLocation.z - z, 2)
            );

            if (distance <= particleRange && distance >= particleMinDistance) {
                dimension.spawnParticle("minecraft:mobflame_single", { x, y, z });
            }
        };

        for (let y = minY; y <= maxY; y += density) {
            for (let z = minZ; z <= maxZ; z += density) {
                checkDistanceAndSpawn(minX, y, z);
                checkDistanceAndSpawn(maxX, y, z);
            }
        }

        for (let x = minX; x <= maxX; x += density) {
            for (let z = minZ; z <= maxZ; z += density) {
                checkDistanceAndSpawn(x, minY, z);
                checkDistanceAndSpawn(x, maxY, z);
            }
        }

        for (let x = minX; x <= maxX; x += density) {
            for (let y = minY; y <= maxY; y += density) {
                checkDistanceAndSpawn(x, y, minZ);
                checkDistanceAndSpawn(x, y, maxZ);
            }
        }
    };


    const getNearestPointInRegion = (playerLocation: Vector3, start: Vector3, end: Vector3): Vector3 => {
        const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

        const nearestX = clamp(playerLocation.x, Math.min(start.x, end.x), Math.max(start.x, end.x));
        const nearestY = clamp(playerLocation.y, Math.min(start.y, end.y), Math.max(start.y, end.y));
        const nearestZ = clamp(playerLocation.z, Math.min(start.z, end.z), Math.max(start.z, end.z));

        return { x: nearestX, y: nearestY, z: nearestZ };
    };

    const processRegionData = (regionDataArray: any[], _dimension: Dimension, sendMessage: (message: string) => void) => {
        if (!Array.isArray(regionDataArray)) {
            sendMessage("regionDataは配列である必要があります。");
            return;
        }

        for (const regionData of regionDataArray) {
            if (typeof regionData !== "object" || regionData === null) {
                sendMessage("regionDataの各要素はオブジェクトである必要があります。");
                continue;
            }

            const {
                regionName,
                start,
                end,
                tag,
                particle,
                teleport,
                teleportLocation,
                particleRange,
                particleMinDistance,
                ignoreY,
                area
            } = regionData;


            if (typeof regionName !== "string") { sendMessage("regionNameは文字列である必要があります。"); continue; }
            if (typeof start !== "object" || start === null || typeof end !== "object" || end === null ||
                typeof start.x !== "number" || typeof start.y !== "number" || typeof start.z !== "number" ||
                typeof end.x !== "number" || typeof end.y !== "number" || typeof end.z !== "number") {
                sendMessage("startとendは{x, y, z}形式の数値オブジェクトである必要があります。"); continue;
            }
            if (typeof tag !== "string") { sendMessage("tagは文字列である必要があります。"); continue; }
            if (typeof particle !== "boolean") { sendMessage("particleは真偽値である必要があります。"); continue; }
            if (typeof teleport !== "boolean") { sendMessage("teleportは真偽値である必要があります。"); continue; }
            if (teleport && (typeof teleportLocation !== "object" || teleportLocation === null ||
                typeof teleportLocation.x !== "number" || typeof teleportLocation.y !== "number" || typeof teleportLocation.z !== "number")) {
                sendMessage("teleportLocationは{x, y, z}形式の数値オブジェクトである必要があります。"); continue;
            }
            if (typeof particleRange !== "number") { sendMessage("particleRange は数値である必要があります。"); continue; }
            if (typeof particleMinDistance !== "number") { sendMessage("particleMinDistance は数値である必要があります。"); continue; }
            if (ignoreY !== undefined && typeof ignoreY !== "number") { sendMessage("ignoreYは数値である必要があります。"); continue; }

            if (area !== undefined && (typeof area !== "object" || area === null ||
                typeof area.scoreboardObjective !== "string" || typeof area.scoreName !== "string" || typeof area.maxValue !== "number")) { // maxValue の型チェック
                sendMessage("areaは{scoreboardObjective, scoreName, maxValue}形式のオブジェクトである必要があります。maxValue は数値です。");
                continue;
            }


            regionDataMap[regionName] = {
                start: { x: start.x, y: start.y, z: start.z },
                end: { x: end.x, y: end.y, z: end.z },
                tag,
                particle,
                teleport,
                teleportLocation: teleport ? { x: teleportLocation.x, y: teleportLocation.y, z: teleportLocation.z } : undefined,
                particleRange,
                particleMinDistance,
                ignoreY,
                lastUpdated: system.currentTick,
                area,
            };
        }

    };

    handler.registerCommand('regionControl', {
        moduleName: moduleName,
        description: 'リージョン制御コマンド',
        usage: 'regionControl <JSON>\n <JSON>: [{"regionName":"name1", "start":{"x":0,"y":60,"z":0}, "end":{"x":10,"y":70,"z":10}, "tag":"tag1", "particle":true, "teleport":true, "teleportLocation":{"x":5,"y":65,"z":5}, "particleRange": 5, "particleMinDistance": 2, "ignoreY": 50, "area":{"scoreboardObjective":"objective", "scoreName":"name", "maxValue": 100}}, ...]', // maxValue を usage に追加
        execute: (_message, event) => {
            const consoleOutput = (message: string) => { console.warn(message); };
            const sendMessage = (message: string) => {
                if (event.sourceEntity instanceof Player) {
                    const player = event.sourceEntity;
                    system.run(() => player.sendMessage(message));
                } else {
                    consoleOutput(message);
                }
            };
            const dimension = event.sourceEntity?.dimension ?? world.getDimension('overworld');

            try {
                const matchResult = event.message.match(/\{.*\}/);
                if (!matchResult) { sendMessage('JSONオブジェクトが見つかりませんでした。'); return; }

                const regionDataStr = matchResult[0];
                const regionData = JSON.parse(regionDataStr);
                processRegionData(Array.isArray(regionData) ? regionData : [regionData], dimension, sendMessage);
            } catch (error) {
                consoleOutput(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
                sendMessage(`JSON解析エラー、または処理中にエラーが発生しました: ${error}`);
            }

        }
    });


    system.runInterval(() => {
        const currentTick = system.currentTick;


        for (const regionName in regionDataMap) {
            if (currentTick - regionDataMap[regionName].lastUpdated > autoDeleteTimeout) {
                delete regionDataMap[regionName];
                console.warn(`リージョン "${regionName}" が自動削除されました。`);
            }
        }

        for (const player of world.getAllPlayers()) {
            for (const regionName in regionDataMap) {
                const regionData = regionDataMap[regionName];
                if (!player.hasTag(regionData.tag)) continue;

                const {
                    start,
                    end,
                    teleport,
                    teleportLocation,
                    particle,
                    particleRange,
                    particleMinDistance,
                    ignoreY,
                    area
                } = regionData;
                let currentStart = { ...start };
                let currentEnd = { ...end };

                if (area) {
                    const objective = world.scoreboard.getObjective(area.scoreboardObjective);
                    if (objective) {
                        const score = objective.getScore(area.scoreName) ?? 0;

                        const clampedScore = Math.min(score, area.maxValue);


                        const centerX = (start.x + end.x) / 2;
                        const centerY = (start.y + end.y) / 2;
                        const centerZ = (start.z + end.z) / 2;

                        const diffX = Math.abs(start.x - end.x);
                        const diffY = Math.abs(start.y - end.y);
                        const diffZ = Math.abs(start.z - end.z);

                        const reduceX = diffX * (1 - (clampedScore / area.maxValue));
                        const reduceY = diffY * (1 - (clampedScore / area.maxValue));
                        const reduceZ = diffZ * (1 - (clampedScore / area.maxValue));

                        currentStart.x = centerX - (diffX - reduceX) / 2;
                        currentStart.y = centerY - (diffY - reduceY) / 2;
                        currentStart.z = centerZ - (diffZ - reduceZ) / 2;

                        currentEnd.x = centerX + (diffX - reduceX) / 2;
                        currentEnd.y = centerY + (diffY - reduceY) / 2;
                        currentEnd.z = centerZ + (diffZ - reduceZ) / 2;


                    }
                }
                const playerLocation = player.location;

                if (typeof ignoreY === 'number' && playerLocation.y < ignoreY) {
                    continue;
                }


                const minX = Math.min(currentStart.x, currentEnd.x);
                const minY = Math.min(currentStart.y, currentEnd.y);
                const minZ = Math.min(currentStart.z, currentEnd.z);
                const maxX = Math.max(currentStart.x, currentEnd.x);
                const maxY = Math.max(currentStart.y, currentEnd.y);
                const maxZ = Math.max(currentStart.z, currentEnd.z);

                const isInside = (
                    playerLocation.x >= minX && playerLocation.x <= maxX &&
                    playerLocation.y >= minY && playerLocation.y <= maxY &&
                    playerLocation.z >= minZ && playerLocation.z <= maxZ
                );

                if (!isInside) {
                    if (teleport && teleportLocation) {
                        player.teleport(teleportLocation, { dimension: player.dimension });
                    } else {
                        const nearestPoint = getNearestPointInRegion(playerLocation, currentStart, currentEnd);
                        player.teleport(nearestPoint, { dimension: player.dimension });
                    }
                }


                if (particle) {
                    showRegionParticles(player.dimension, currentStart, currentEnd, playerLocation, particleRange, particleMinDistance, ignoreY);
                }

            }
        }

    }, 5);
}