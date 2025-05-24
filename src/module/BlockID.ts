// blockIdManager.ts (ファイル名は何でも良いです)

import { Block, Dimension, Vector3 } from "@minecraft/server";

/**
 * ブロックIDに関連するエラーの種類
 */
export enum BlockIdErrorType {
    InvalidBlock = "InvalidBlock",
    InvalidDimension = "InvalidDimension",
    InvalidLocation = "InvalidLocation",
}

/**
 * ブロックID生成時のエラーオブジェクト
 */
export interface BlockIdError {
    type: BlockIdErrorType;
    message: string;
}

/**
 * ブロックIDのプレフィックスやサフィックスのオプション
 */
export interface BlockIdOptions {
    /**
     * IDの先頭に付加するプレフィックス (例: "mylocks:")
     * デフォルト: ""
     */
    prefix?: string;
    /**
     * IDの末尾に付加するサフィックス (例: ":lockData")
     * デフォルト: ""
     */
    suffix?: string;
    /**
     * ディメンション名をIDに含めるかどうか
     * デフォルト: true
     */
    includeDimension?: boolean;
    /**
     * ディメンションIDの "minecraft:" プレフィックスを削除するかどうか
     * デフォルト: true
     */
    stripDimensionPrefix?: boolean;
    /**
     * 座標の区切り文字
     * デフォルト: ":"
     */
    coordinateSeparator?: string;
    /**
     * プレフィックス/サフィックスと主要ID部分の区切り文字
     * デフォルト: "" (直接連結)
     */
    affixSeparator?: string;
}

/**
 * ブロックの一意なIDを管理するためのクラス
 */
export class BlockIdManager {
    private readonly defaultOptions: Required<BlockIdOptions>;

    /**
     * BlockIdManagerのインスタンスを作成します。
     * @param defaultOptions このマネージャーで生成されるIDのデフォルトオプション。
     */
    constructor(defaultOptions?: Partial<BlockIdOptions>) {
        this.defaultOptions = {
            prefix: defaultOptions?.prefix ?? "",
            suffix: defaultOptions?.suffix ?? "",
            includeDimension: defaultOptions?.includeDimension ?? true,
            stripDimensionPrefix: defaultOptions?.stripDimensionPrefix ?? true,
            coordinateSeparator: defaultOptions?.coordinateSeparator ?? ":",
            affixSeparator: defaultOptions?.affixSeparator ?? "",
        };
    }

    /**
     * 指定されたBlockインスタンスから一意なID文字列を生成します。
     * @param block IDを生成する対象のBlockインスタンス。
     * @param options このID生成に特有のオプション（デフォルトオプションを上書き）。
     * @returns 生成されたブロックID文字列、またはエラーオブジェクト。
     */
    public getIdFromBlock(block: Block, options?: Partial<BlockIdOptions>): string | BlockIdError {
        if (!block || !block.isValid) { // block.isValid は比較的新しいAPIなので注意
            return { type: BlockIdErrorType.InvalidBlock, message: "Provided block is invalid or null." };
        }
        return this.getIdFromLocation(block.dimension, block.location, options);
    }

    /**
     * 指定されたディメンションと座標から一意なID文字列を生成します。
     * @param dimension 対象のディメンション。
     * @param location 対象の座標 (Vector3)。
     * @param options このID生成に特有のオプション（デフォルトオプションを上書き）。
     * @returns 生成されたブロックID文字列、またはエラーオブジェクト。
     */
    public getIdFromLocation(dimension: Dimension, location: Vector3, options?: Partial<BlockIdOptions>): string | BlockIdError {
        if (!dimension) {
            return { type: BlockIdErrorType.InvalidDimension, message: "Provided dimension is invalid or null." };
        }
        if (!location || typeof location.x !== 'number' || typeof location.y !== 'number' || typeof location.z !== 'number') {
            return { type: BlockIdErrorType.InvalidLocation, message: "Provided location is invalid or not a Vector3." };
        }

        const opt: Required<BlockIdOptions> = { ...this.defaultOptions, ...options };
        const cs = opt.coordinateSeparator; // coordinate separator
        const as = opt.affixSeparator; // affix separator

        let idParts: string[] = [];

        if (opt.includeDimension) {
            let dimName = dimension.id;
            if (opt.stripDimensionPrefix && dimName.startsWith("minecraft:")) {
                dimName = dimName.substring("minecraft:".length);
            }
            idParts.push(dimName);
        }

        idParts.push(String(Math.floor(location.x))); // 整数座標を推奨
        idParts.push(String(Math.floor(location.y)));
        idParts.push(String(Math.floor(location.z)));

        let mainId = idParts.join(cs);

        let finalId = "";
        if (opt.prefix) {
            finalId += opt.prefix + (mainId && opt.affixSeparator ? as : "");
        }
        finalId += mainId;
        if (opt.suffix) {
            finalId += (mainId && opt.affixSeparator ? as : "") + opt.suffix;
        }

        return finalId;
    }

    /**
     * ブロックID文字列から座標とディメンション名を解析しようと試みます。
     * 注意: この関数は、このマネージャーの現在のオプション設定でIDが生成されたことを前提とします。
     * プレフィックス、サフィックス、区切り文字が一致しない場合、正しく解析できない可能性があります。
     * @param id 解析するブロックID文字列。
     * @param options ID生成時に使用されたオプション（デフォルトオプションを上書き）。
     * @returns 解析された情報 ({ dimensionName?: string, location: Vector3 }) または null（解析失敗時）。
     */
    public parseId(id: string, options?: Partial<BlockIdOptions>): { dimensionName?: string, location: Vector3 } | null {
        if (!id) return null;

        const opt: Required<BlockIdOptions> = { ...this.defaultOptions, ...options };
        const cs = opt.coordinateSeparator;
        const as = opt.affixSeparator;

        let workingId = id;

        // サフィックスの除去
        if (opt.suffix) {
            const suffixWithSeparator = (opt.affixSeparator && workingId.includes(opt.prefix) ? as : "") + opt.suffix;
            if (workingId.endsWith(suffixWithSeparator)) {
                workingId = workingId.substring(0, workingId.length - suffixWithSeparator.length);
            } else if (workingId.endsWith(opt.suffix)) { // セパレータなしの場合も考慮
                 workingId = workingId.substring(0, workingId.length - opt.suffix.length);
            }
        }

        // プレフィックスの除去
        if (opt.prefix) {
            const prefixWithSeparator = opt.prefix + (opt.affixSeparator && workingId.includes(opt.suffix) ? as : "");
            if (workingId.startsWith(prefixWithSeparator)) {
                workingId = workingId.substring(prefixWithSeparator.length);
            } else if (workingId.startsWith(opt.prefix)) { // セパレータなしの場合も考慮
                workingId = workingId.substring(opt.prefix.length);
            }
        }


        const parts = workingId.split(cs);

        try {
            if (opt.includeDimension) {
                if (parts.length !== 4) return null; // dimension, x, y, z
                const dimensionName = opt.stripDimensionPrefix ? parts[0] : `minecraft:${parts[0]}`;
                const x = parseInt(parts[1]);
                const y = parseInt(parts[2]);
                const z = parseInt(parts[3]);
                if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
                return { dimensionName, location: { x, y, z } };
            } else {
                if (parts.length !== 3) return null; // x, y, z
                const x = parseInt(parts[0]);
                const y = parseInt(parts[1]);
                const z = parseInt(parts[2]);
                if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
                return { location: { x, y, z } };
            }
        } catch (e) {
            return null;
        }
    }
}

// --- 使用例 ---
/*
// デフォルトオプションでマネージャーを作成
const defaultBlockIdManager = new BlockIdManager();

// 特定のサフィックスを持つマネージャーを作成 (ロックアドオン風)
const lockIdManager = new BlockIdManager({ suffix: ":lockBlock" });

// world や player が利用可能なスコープで...
// import { world, Player } from "@minecraft/server";
// let somePlayer: Player; // 仮のプレイヤー
// let someBlock: Block;   // 仮のブロック (player.getBlockFromViewDirection() などで取得)

// --- ID生成の例 ---
// if (someBlock) {
//     const id1 = defaultBlockIdManager.getIdFromBlock(someBlock);
//     if (typeof id1 === 'string') {
//         console.log("Default ID:", id1); // 例: overworld:10:64:20
//     } else {
//         console.error("Error generating default ID:", id1.message);
//     }

//     const id2 = lockIdManager.getIdFromBlock(someBlock);
//     if (typeof id2 === 'string') {
//         console.log("Lock ID:", id2); // 例: overworld:10:64:20:lockBlock
//         // world.setDynamicProperty(id2, JSON.stringify({ password: "123" }));
//     } else {
//         console.error("Error generating lock ID:", id2.message);
//     }

//     const customId = defaultBlockIdManager.getIdFromLocation(
//         someBlock.dimension,
//         someBlock.location,
//         { prefix: "data:", suffix: ":meta", includeDimension: false, coordinateSeparator: "_" }
//     );
//     if (typeof customId === 'string') {
//         console.log("Custom ID:", customId); // 例: data:10_64_20:meta
//     } else {
//         console.error("Error generating custom ID:", customId.message);
//     }
// }

// --- ID解析の例 ---
// const testLockId = "overworld:12:34:56:lockBlock";
// const parsedLockInfo = lockIdManager.parseId(testLockId);
// if (parsedLockInfo) {
//     console.log("Parsed Lock Info:", parsedLockInfo.dimensionName, parsedLockInfo.location);
//     // const dimension = world.getDimension(parsedLockInfo.dimensionName!);
//     // const block = dimension.getBlock(parsedLockInfo.location);
//     // ...
// } else {
//     console.log(`Failed to parse lock ID: ${testLockId}`);
// }

// const testCustomId = "data:100_200_300:meta";
// const parsedCustomInfo = defaultBlockIdManager.parseId(testCustomId, {
//     prefix: "data:",
//     suffix: ":meta",
//     includeDimension: false,
//     coordinateSeparator: "_"
// });
// if (parsedCustomInfo) {
//     console.log("Parsed Custom Info:", parsedCustomInfo.location); // dimensionName は undefined
// } else {
//     console.log(`Failed to parse custom ID: ${testCustomId}`);
// }
*/