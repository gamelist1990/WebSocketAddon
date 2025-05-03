import {
    Player,
    system,
    world,
    BlockPermutation,
    Vector3,
    Dimension,
} from "@minecraft/server";
import { Handler } from "../../../../module/Handler";


let Debug = false;
// --- Helper Functions ---
const sendMessage = (event: any, msg: string) => {
    if (Debug) {
        const consoleOutput = (m: string) => console.warn(`[FillCommand] ${m}`);
        if (event.sourceEntity && event.sourceEntity.typeId === "minecraft:player") {
            const player = event.sourceEntity as Player;
            system.run(() => player.sendMessage(msg));
        } else {
            consoleOutput(msg);
        }
    }
};


// --- Constants ---
const BLOCKS_PER_CHUNK_TICK = 1000;
const SCRIPT_VOLUME_LIMIT = 1000000;

// --- Command Registration ---
export function registerFillCommand(handler: Handler, moduleName: string) {
    handler.registerCommand("fill", {
        moduleName: moduleName,
        description:
            "指定したブロックで領域を充填、破壊、またはフィルタリングします。チャンク処理により大きな領域もサポートします。",
        usage:
            "fill <x1 y1 z1> <x2 y2 z2> <ブロックID> [モード: replace|destroy|filter] [置換対象フィルターID | フィルター保持ID1 ID2 ...]", // Usageは同じ

        execute: (_message, event, args: string[]) => {
            if (args.length < 7) {
                sendMessage(event, "§c引数が不足しています。");
                sendMessage(
                    event,
                    `§e使用法: fill <x1 y1 z1> <x2 y2 z2> <ブロックID> [replace|destroy|filter] [オプション引数]`
                );
                return;
            }

            const [x1s, y1s, z1s, x2s, y2s, z2s, blockIdRaw] = args;
            const modeRaw = args.length > 7 ? args[7] : "replace";
            const optionalArgs = args.length > 8 ? args.slice(8) : [];

            let fromPos: Vector3, toPos: Vector3;
            let targetBlockId: string | undefined = undefined;
            let mode: "replace" | "destroy" | "filter" = "replace";
            let replaceFilterBlockId: string | undefined = undefined;
            let replaceFilterPermutation: BlockPermutation | undefined = undefined;
            // ★変更点: filter モード用のリストを Permutation から typeId (string) に変更
            let filterKeepTypeIds: string[] = [];
            let targetPermutation: BlockPermutation | undefined = undefined;
            let airPermutation: BlockPermutation | undefined = undefined;

            try {
                fromPos = { x: parseInt(x1s), y: parseInt(y1s), z: parseInt(z1s) };
                toPos = { x: parseInt(x2s), y: parseInt(y2s), z: parseInt(z2s) };

                if (
                    isNaN(fromPos.x) ||
                    isNaN(fromPos.y) ||
                    isNaN(fromPos.z) ||
                    isNaN(toPos.x) ||
                    isNaN(toPos.y) ||
                    isNaN(toPos.z)
                ) {
                    throw new Error("座標は有効な数値である必要があります。");
                }

                airPermutation = BlockPermutation.resolve("minecraft:air");

                const lcMode = modeRaw.toLowerCase();

                if (lcMode === "replace") {
                    mode = "replace";
                    targetBlockId = blockIdRaw.includes(":")
                        ? blockIdRaw
                        : `minecraft:${blockIdRaw}`;
                    targetPermutation = BlockPermutation.resolve(targetBlockId);

                    if (optionalArgs.length > 1) {
                        throw new Error(
                            "replace モードでは、置換対象フィルターは最大1つまで指定できます。"
                        );
                    }
                    if (optionalArgs.length === 1) {
                        const filterIdRaw = optionalArgs[0];
                        if (!filterIdRaw || !filterIdRaw.trim()) {
                            throw new Error(
                                "replace モードでフィルターを指定する場合、空でないブロックIDを指定してください。"
                            );
                        }
                        replaceFilterBlockId = filterIdRaw.includes(":")
                            ? filterIdRaw
                            : `minecraft:${filterIdRaw}`;
                        // replace モードのフィルターは Permutation のまま (特定の状態を置換対象にできるため)
                        replaceFilterPermutation = BlockPermutation.resolve(replaceFilterBlockId);
                    }
                } else if (lcMode === "destroy") {
                    mode = "destroy";
                    targetPermutation = airPermutation;
                } else if (lcMode === "filter") {
                    mode = "filter";
                    targetPermutation = airPermutation; // フィルターされなかったものを空気に

                    if (optionalArgs.length === 0) {
                        throw new Error(
                            "filter モードでは、少なくとも1つの保持するブロックID (フィルター保持ID) を指定する必要があります。"
                        );
                    }
                    // ★変更点: Permutation を resolve せず、typeId 文字列をリストに追加
                    for (const filterIdRaw of optionalArgs) {
                        if (!filterIdRaw || !filterIdRaw.trim()) {
                            throw new Error(
                                "filter モードでは、空のフィルターブロックIDは指定できません。"
                            );
                        }
                        // minecraft: プレフィックスを確実に付与
                        const currentFilterTypeId = filterIdRaw.includes(":")
                            ? filterIdRaw
                            : `minecraft:${filterIdRaw}`;

                        // ★変更点: typeId をリストに追加 (resolve はしない)
                        filterKeepTypeIds.push(currentFilterTypeId);
                    }
                    // ★追加: BlockPermutation.resolve を試行して、無効なIDがないか事前にチェック
                    try {
                        for (const typeId of filterKeepTypeIds) {
                            BlockPermutation.resolve(typeId); // IDが存在するかだけ確認
                        }
                    } catch (resolveError: any) {
                        throw new Error(`指定されたフィルター保持IDのいずれかが無効です: ${resolveError.message}`);
                    }

                } else {
                    throw new Error(
                        `無効なモード: "${modeRaw}"。'replace', 'destroy', または 'filter' を使用してください。`
                    );
                }

            } catch (error: any) {
                let errMsg = `§c引数の解析中にエラーが発生しました: ${error.message}`;
                if (error.message.toLowerCase().includes("could not find block") || error.message.toLowerCase().includes("could not find a block")) {
                    errMsg = `§c指定されたブロックIDが見つかりません。IDを確認してください。(${error.message})`;
                }
                sendMessage(event, errMsg);
                return;
            }

            if (!targetPermutation || !airPermutation) {
                sendMessage(event, `§c内部エラー: Permutation の準備に失敗しました。`);
                return;
            }

            const dimension =
                event.sourceEntity?.dimension ?? world.getDimension("overworld");

            const minX = Math.min(fromPos.x, toPos.x);
            const minY = Math.min(fromPos.y, toPos.y);
            const minZ = Math.min(fromPos.z, toPos.z);
            const maxX = Math.max(fromPos.x, toPos.x);
            const maxY = Math.max(fromPos.y, toPos.y);
            const maxZ = Math.max(fromPos.z, toPos.z);

            const startLocation: Vector3 = { x: minX, y: minY, z: minZ };
            const endLocation: Vector3 = { x: maxX, y: maxY, z: maxZ };

            const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);

            if (volume <= 0) {
                sendMessage(event, "§c無効な領域が指定されました (体積が0以下です)。");
                return;
            }
            if (volume > SCRIPT_VOLUME_LIMIT) {
                sendMessage(
                    event,
                    `§c領域が大きすぎます (体積: ${volume}, 最大: ${SCRIPT_VOLUME_LIMIT})。より小さい範囲を選択してください。`
                );
                return;
            }

            let startMessage = `§a充填処理 (${mode} モード) を開始します... 体積: ${volume} ブロック。`;
            let consoleStartMessage = `充填開始: ${dimension.id} from [${minX},${minY},${minZ}] to [${maxX},${maxY},${maxZ}], モード: ${mode}, 体積: ${volume}`;

            if (mode === 'replace') {
                startMessage += ` 対象: ${targetBlockId}`;
                consoleStartMessage += `, 対象: ${targetBlockId}`;
                if (replaceFilterBlockId) {
                    startMessage += `, 置換フィルター: ${replaceFilterBlockId}`;
                    consoleStartMessage += `, 置換フィルター: ${replaceFilterBlockId}`;
                }
            } else if (mode === 'destroy') {
                startMessage += ` 空気で置換します。`;
                consoleStartMessage += `, 空気で置換`;
            } else if (mode === 'filter') {
                // ★変更点: filterKeepTypeIds を表示
                const filterIds = filterKeepTypeIds.join(', ');
                startMessage += ` 保持するブロックタイプ: ${filterIds}`;
                consoleStartMessage += `, 保持フィルター(typeId): ${filterIds}`;
            }

            sendMessage(event, startMessage);

            const fillGenerator = fillBlocksGenerator(
                dimension,
                startLocation,
                endLocation,
                targetPermutation,
                airPermutation,
                mode,
                replaceFilterPermutation, // replace モード用
                filterKeepTypeIds,       // ★変更点: filter モード用 (typeId のリストを渡す)
                event
            );

            system.runJob(fillGenerator);
        },
    });
}

// --- Block Filling Generator ---
function* fillBlocksGenerator(
    dimension: Dimension,
    start: Vector3,
    end: Vector3,
    targetPermutation: BlockPermutation,
    airPermutation: BlockPermutation,
    mode: "replace" | "destroy" | "filter",
    replaceFilterPermutation: BlockPermutation | undefined,
    // ★変更点: filterKeepPermutations から filterKeepTypeIds へ変更
    filterKeepTypeIds: string[],
    event: any
): Generator<void, void, unknown> {
    const startTime = Date.now();
    let blocksProcessed = 0;
    let blocksModified = 0;
    const totalVolume =
        (end.x - start.x + 1) * (end.y - start.y + 1) * (end.z - start.z + 1);
    const currentPos: Vector3 = { x: start.x, y: start.y, z: start.z };

    try {
        for (let y = start.y; y <= end.y; y++) {
            currentPos.y = y;
            for (let z = start.z; z <= end.z; z++) {
                currentPos.z = z;
                for (let x = start.x; x <= end.x; x++) {
                    currentPos.x = x;
                    blocksProcessed++;

                    let shouldModify = false;
                    let permutationToSet: BlockPermutation | undefined = undefined;

                    try {
                        const currentBlock = dimension.getBlock(currentPos);

                        if (!currentBlock) {
                            continue;
                        }
                        const currentPermutation = currentBlock.permutation;
                        // ★変更点: currentBlock.typeId を取得
                        const currentTypeId = currentBlock.typeId;

                        if (mode === "replace") {
                            // replace モードのロジックは変更なし (Permutation で比較)
                            if (replaceFilterPermutation) {
                                if (currentPermutation.matches(replaceFilterPermutation.type.id, replaceFilterPermutation.getAllStates()) &&
                                    !currentPermutation.matches(targetPermutation.type.id, targetPermutation.getAllStates())) {
                                    shouldModify = true;
                                    permutationToSet = targetPermutation;
                                }
                            } else {
                                if (!currentPermutation.matches(targetPermutation.type.id, targetPermutation.getAllStates())) {
                                    shouldModify = true;
                                    permutationToSet = targetPermutation;
                                }
                            }
                        } else if (mode === "destroy") {
                            if (!currentBlock.isAir) {
                                shouldModify = true;
                                permutationToSet = airPermutation;
                            }
                        } else if (mode === "filter") {
                            // ★変更点: filterKeepTypeIds リストに現在のブロックの typeId が含まれているかチェック
                            // 空気は常に保持、そうでなければリストに含まれているか確認
                            const shouldKeep = currentBlock.isAir || filterKeepTypeIds.includes(currentTypeId);

                            // 保持しない (shouldKeep が false) なら空気にする
                            if (!shouldKeep) {
                                shouldModify = true;
                                permutationToSet = airPermutation;
                            }
                        }

                        if (shouldModify && permutationToSet) {
                            try {
                                dimension.setBlockPermutation(currentPos, permutationToSet);
                                blocksModified++;
                            } catch (setBlockError: any) {
                            }
                        }

                    } catch (getBlockError: any) {
                    }

                    if (blocksProcessed % BLOCKS_PER_CHUNK_TICK === 0) {
                        yield;
                    }
                } // x loop
            } // z loop
            // yield; // オプション: Y ループの終わりで yield
        } // y loop

        const duration = (Date.now() - startTime) / 1000;
        sendMessage(
            event,
            `§a充填処理完了！ ${blocksModified} ブロックを変更しました (${blocksProcessed}/${totalVolume} ブロック処理) 所要時間: ${duration.toFixed(
                2
            )} 秒。`
        );

    } catch (error: any) {
        sendMessage(event, `§c充填処理が予期せぬエラーで失敗しました: ${error.message}`);
    }
}