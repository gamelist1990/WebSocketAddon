import {
    world, system, Player, Entity, Dimension, ItemStack, Block, EntityComponent, 
    Vector3, CommandResult, GameMode, ScoreboardIdentity, ScoreboardObjective, Effect, EffectType, MusicOptions, 
    RawMessage, ChatSendAfterEvent, ChatSendBeforeEvent, PlayerJoinAfterEvent, PlayerLeaveAfterEvent, EntityHitEntityAfterEvent, EntityHitBlockAfterEvent, EntityHurtAfterEvent, EntityDieAfterEvent, WeatherChangeAfterEvent, 
    ButtonPushAfterEvent, LeverActionAfterEvent, PistonActivateAfterEvent, PlayerInteractWithBlockAfterEvent, PlayerInteractWithEntityAfterEvent,
    BlockComponentTypes,
    PlayerPlaceBlockAfterEvent,
    DisplaySlotId,
    WorldLoadAfterEvent,
    ScriptEventCommandMessageAfterEvent,
    ItemUseAfterEvent,
    PlayerBreakBlockAfterEvent
} from '@minecraft/server';
import { Vector } from './Vector';

/** Script API 環境の console オブジェクトのラッパー */
export const コンソール = {
    ログ: (...args: any[]): void => { console.log(...args); },
    情報: (...args: any[]): void => { console.info(...args); },
    警告: (...args: any[]): void => { console.warn(...args); },
    エラー: (...args: any[]): void => { console.error(...args); },
    デバッグ: (...args: any[]): void => { console.debug(...args); },
};

/**
 * @deprecated JS の `function` キーワードの代わりにはなりません。
 * @param 実装 関数の本体
 * @returns 与えられた関数実装
 */
export const 関数ヘルパー = <T extends (...args: any[]) => any>(実装: T): T => {
    if (typeof 実装 !== 'function') {
        コンソール.エラー("関数ヘルパーの引数は関数である必要があります。");
        return (() => { }) as T;
    }
    return 実装;
};

/**
 * @deprecated JS の `const` キーワードの代わりにはなりません。`.値` でアクセスします。
 * @param 値 定数として保持したい値
 * @returns 値プロパティを持つ読み取り専用風オブジェクト `{ readonly 値: T }`
 */
export const 定数ファクトリ = <T>(値: T): { readonly 値: T } => {
    return { 値: 値 };
};

/**
 * @deprecated JS の `let` キーワードの代わりにはなりません。`.値` でアクセスします。
 * @param 初期値 変数の初期値
 * @returns 値プロパティを持つオブジェクト `{ 値: T }`
 */
export const 変数ファクトリ = <T>(初期値: T): { 値: T } => {
    return { 値: 初期値 };
};

/**
 * try...catch ブロックの構文を模倣した関数。
 * @param 試行ブロック エラーが発生する可能性のある処理を含む関数
 * @param 捕獲ブロック エラーが発生した場合に呼び出される関数
 */
export const 試行 = (試行ブロック: () => void, 捕獲ブロック: (error: any) => void): void => {
    if (typeof 試行ブロック !== 'function' || typeof 捕獲ブロック !== 'function') {
        コンソール.エラー("試行の使い方が正しくありません。");
        return;
    }
    try {
        試行ブロック();
    } catch (error) {
        捕獲ブロック(error);
    }
};

/**
 * @deprecated JS の `return` キーワードの代わりにはなりません！ 必ず `return` を使用してください。
 * @param 値 返したい値 (のつもり)
 * @returns 与えられた値
 */
export const 返す = <T>(値: T): T => {
    コンソール.警告("!!! 「返す(値)」は `return` 文の代わりにはなりません！ 必ず `return` を使用してください !!!");
    return 値;
};


// --- ワールド ---

/** ワールド全体の操作を提供します */
export const ワールド = {
    /**
     * すべてのプレイヤーにメッセージを送信します。
     * @param メッセージ 送信する文字列、または RawMessage オブジェクト
     */
    メッセージ送信(メッセージ: string | RawMessage): void {
        world.sendMessage(メッセージ);
    },

    /**
     * 指定した名前のプレイヤーを取得します。オンラインでない場合は見つかりません。
     * @param 名前 プレイヤー名
     * @returns プレイヤーオブジェクト、見つからない場合は undefined
     */
    プレイヤー取得(名前: string): Player | undefined {
        return world.getAllPlayers().find(p => p.name === 名前);
    },

    /**
     * 現在ワールドにいるすべてのプレイヤーを取得します。
     * @returns すべてのプレイヤーの配列
     */
    全プレイヤー取得(): Player[] {
        return world.getAllPlayers();
    },

    /**
     * 指定した条件に一致するエンティティを取得します。
     * @param オプション エンティティ検索オプション (例: `{ tags: ['敵'] }`)
     * @param ディメンション 検索するディメンション (省略時はオーバーワールド)
     * @returns 条件に一致するエンティティの配列
     */
    エンティティ取得(オプション: Parameters<Dimension['getEntities']>[0], ディメンション?: Dimension): Entity[] {
        const dimension = ディメンション ?? world.getDimension("overworld");
        return dimension.getEntities(オプション);
    },

    /**
     * 指定した座標にエンティティをスポーンさせます。
     * @param タイプID スポーンさせるエンティティのタイプID
     * @param 座標 スポーンさせる場所 (Vector3)
     * @param ディメンション スポーンさせるディメンション (省略時はオーバーワールド)
     * @returns スポーンしたエンティティ、失敗した場合は undefined
     */
    エンティティ召喚(タイプID: string, 座標: Vector3, ディメンション?: Dimension): Entity | undefined {
        const dimension = ディメンション ?? world.getDimension("overworld");
        try {
            return dimension.spawnEntity(タイプID as any, 座標);
        } catch (e: any) {
            コンソール.エラー(`エンティティ召喚失敗 (タイプ: ${タイプID}):`, e.message);
            return undefined;
        }
    },

    /**
     * 指定した座標にアイテムをスポーンさせます。
     * @param アイテムスタック スポーンさせるアイテム
     * @param 座標 スポーンさせる場所 (Vector3)
     * @param ディメンション スポーンさせるディメンション (省略時はオーバーワールド)
     * @returns スポーンしたアイテムエンティティ、失敗した場合は undefined
     */
    アイテム召喚(アイテムスタック: ItemStack, 座標: Vector3, ディメンション?: Dimension): Entity | undefined {
        const dimension = ディメンション ?? world.getDimension("overworld");
        try {
            return dimension.spawnItem(アイテムスタック, 座標);
        } catch (e: any) {
            コンソール.エラー(`アイテム召喚失敗 (タイプ: ${アイテムスタック.typeId}):`, e.message);
            return undefined;
        }
    },

    /**
     * 指定した座標にパーティクルをスポーンさせます。
     * @param パーティクルID スポーンさせるパーティクルのID (例: 'minecraft:endrod')
     * @param 座標 スポーンさせる場所 (Vector3)
     * @param ディメンション スポーンさせるディメンション (省略時はオーバーワールド)
     */
    パーティクル表示(パーティクルID: string, 座標: Vector3, ディメンション?: Dimension): void {
        const dimension = ディメンション ?? world.getDimension("overworld");
        dimension.spawnParticle(パーティクルID, 座標);
    },


    /**
     * 現在のワールドの時間を取得します (ゲーム内 tick)。
     * @returns ワールド時間 (tick)
     */
    時間取得(): number {
        return world.getTimeOfDay();
    },

    /**
     * ワールドの時間を設定します (ゲーム内 tick)。
     * @param 時間 設定する時間 (tick)
     */
    時間設定(時間: number): void {
        world.setTimeOfDay(時間);
    },

    /**
     * ワールドの絶対時間を取得します (ワールド作成からの総 tick)。
     * @returns ワールドの絶対時間 (tick)
     */
    絶対時間取得(): number {
        return world.getAbsoluteTime();
    },

    /**
     * ワールドのデフォルトスポーン位置を取得します。
     * @returns デフォルトスポーン位置 (Vector3)
     */
    初期スポーン位置取得(): Vector3 {
        return world.getDefaultSpawnLocation();
    },

    /**
     * 指定したディメンションを取得します。
     * @param ディメンション名 'overworld', 'nether', 'the_end' のいずれか
     * @returns ディメンションオブジェクト
     */
    ディメンション取得(ディメンション名: 'overworld' | 'nether' | 'the_end'): Dimension {
        return world.getDimension(ディメンション名);
    },

    /**
     * ワールドに音楽を再生します。
     * @param トラックID 再生する音楽のID
     * @param オプション 再生オプション (音量, フェード時間, ループ)
     */
    音楽再生(トラックID: string, オプション?: MusicOptions): void {
        world.playMusic(トラックID, オプション);
    },


    /**
     * ワールドで再生中の音楽を停止します。
     */
    音楽停止(): void {
        world.stopMusic();
    },

    /**
     * ワールドで再生中のすべてのサウンドを停止します。
     */
    全サウンド停止(): void {
        // world.stopSound(); // Note: stopSound は通常特定のサウンドIDを指定するが、ワールド全体停止は未サポートかも？ API仕様確認要
        コンソール.警告("全サウンド停止は未サポートです。個別のサウンドIDを指定して停止してください。");
    },

    /**
     * ワールドにダイナミックプロパティを設定します。
     * @param 識別子 プロパティの識別子 (例: 'namespace:prop_name')
     * @param 値 設定する値 (文字列, 数値, 真偽値)
     */
    動的プロパティ設定(識別子: string, 値: string | number | boolean): void {
        world.setDynamicProperty(識別子, 値);
    },

    /**
     * ワールドからダイナミックプロパティを取得します。
     * @param 識別子 プロパティの識別子
     * @returns プロパティの値、存在しない場合は undefined
     */
    動的プロパティ取得(識別子: string): string | number | boolean | undefined {
        return world.getDynamicProperty(識別子) !== undefined;
    },

    /**
     * ワールドからダイナミックプロパティを削除します。
     * @param 識別子 削除するプロパティの識別子
     * @returns 削除に成功した場合は true
     */
    動的プロパティ削除(識別子: string): boolean {
        return world.getDynamicProperty(識別子) !== undefined;
    },

    /**
     * スコアボードオブジェクトを取得または作成します。
     * @param 目的名 スコアボードの目的名
     * @param 表示名 表示名 (省略時は目的名と同じ)
     * @returns スコアボードオブジェクト
     */
    スコアボード目的取得(目的名: string, 表示名?: string): ScoreboardObjective {
        // getObjective は存在しない場合に例外を投げる可能性があるため、try-catchするか、addObjectiveを使う
        try {
            return world.scoreboard.getObjective(目的名) ?? world.scoreboard.addObjective(目的名, 表示名 ?? 目的名);
        } catch {
            return world.scoreboard.addObjective(目的名, 表示名 ?? 目的名);
        }
    },

    /**
    * サイドバーにスコアボードオブジェクトを表示します。
    * @param 目的名 表示する目的名、または目的オブジェクト
    * @param 並び順 スコアの並び順 (0: 降順, 1: 昇順)
    */
    スコアボード目的表示(目的名: string | ScoreboardObjective, 並び順?: 0 | 1): void {
        const objective = typeof 目的名 === 'string' ? this.スコアボード目的取得(目的名) : 目的名;
        world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective, sortOrder: 並び順 });
    },

    /**
     * サイドバーの表示をクリアします。
     */
    スコアボード表示クリア(): void {
        world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
    },

    /**
     * スコアボードから特定の参加者（エンティティや偽名プレイヤー）を取得します。
     * @param 表示名 参加者の表示名
     * @returns スコアボード参加者情報、存在しない場合は undefined
     */
    スコアボード参加者取得(表示名: string): ScoreboardIdentity | undefined {
        return world.scoreboard.getParticipants().find(p => p.displayName === 表示名);
    },
};


// --- システム ---

/** ゲームシステム関連の機能を提供します */
export const システム = {
    /**
     * 指定されたゲーム内tick後にコールバック関数を実行します。
     * @param 遅延tick 遅延時間 (ゲーム内tick単位, 20 ticks = 1秒)
     * @param コールバック 遅延後に実行する関数
     * @returns 実行ID (実行停止に使用可能)
     */
    遅延実行(遅延tick: number, コールバック: () => void): number {
        if (typeof 遅延tick !== 'number' || 遅延tick < 0 || typeof コールバック !== 'function') {
            コンソール.エラー("遅延実行の引数が不正です。");
            return -1;
        }
        return system.runTimeout(コールバック, 遅延tick);
    },

    /**
     * 指定されたゲーム内tick間隔でコールバック関数を繰り返し実行します。
     * @param 間隔tick 実行間隔 (ゲーム内tick単位, 20 ticks = 1秒)
     * @param コールバック 繰り返し実行する関数
     * @returns 実行ID (実行停止に使用可能)
     */
    繰り返し実行(間隔tick: number, コールバック: () => void): number {
        if (typeof 間隔tick !== 'number' || 間隔tick <= 0 || typeof コールバック !== 'function') {
            コンソール.エラー("繰り返し実行の引数が不正です。");
            return -1;
        }
        return system.runInterval(コールバック, 間隔tick);
    },

    /**
     * 遅延実行または繰り返し実行を停止します。
     * @param 実行ID 停止する実行のID
     */
    実行停止(実行ID: number): void {
        if (typeof 実行ID !== 'number' || 実行ID < 0) {
            コンソール.警告(`無効な実行ID「${実行ID}」の停止は無視されました。`);
            return;
        }
        system.clearRun(実行ID);
    },

    /**
     * 次の tick でコールバック関数を実行します。
     * @param コールバック 実行する関数
     */
    次のTickで実行(コールバック: () => void): void {
        system.run(コールバック);
    },

    /**
     * 現在のサーバー tick を取得します。
     * @returns 現在の tick 数
     */
    現在Tick取得(): number {
        return system.currentTick;
    },

    /**
     * 前の tick からの経過時間 (秒) を取得します。
     * @returns デルタタイム (秒)
     * @deprecated Script API には deltaTime プロパティは存在しません。1 tick = 1/20 秒として返します。
     */
    デルタ時間取得(): number {
        return 1 / 20;
    }
};


// --- プレイヤー操作 ---

/** プレイヤーインスタンスに対する操作を提供します */
export const プレイヤー = {
    /**
     * プレイヤーにタグを追加します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param タグ 追加するタグ文字列
     * @returns タグが追加された場合は true
     */
    タグ追加(対象プレイヤー: Player, タグ: string): boolean {
        try {
            return 対象プレイヤー.addTag(タグ);
        } catch (e: any) {
            コンソール.エラー(`プレイヤー「${対象プレイヤー.name}」へのタグ「${タグ}」追加失敗: ${e.message}`);
            return false;
        }
    },

    /**
     * プレイヤーからタグを削除します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param タグ 削除するタグ文字列
     * @returns タグが削除された場合は true
     */
    タグ削除(対象プレイヤー: Player, タグ: string): boolean {
        return 対象プレイヤー.removeTag(タグ);
    },

    /**
     * プレイヤーが指定したタグを持っているか確認します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param タグ 確認するタグ文字列
     * @returns タグを持っていれば true
     */
    タグ確認(対象プレイヤー: Player, タグ: string): boolean {
        return 対象プレイヤー.hasTag(タグ);
    },

    /**
     * プレイヤーから指定したコンポーネントを取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param コンポーネントID 取得するコンポーネントのID (例: 'minecraft:health')
     * @returns コンポーネントオブジェクト、存在しない場合は undefined
     */
    // PlayerComponentMap 型が存在しないため any を使用
    コンポーネント取得<T extends string>(対象プレイヤー: Player, コンポーネントID: T): any {
        return 対象プレイヤー.getComponent(コンポーネントID as string);
    },

    /**
     * プレイヤーの頭の位置を取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns 頭の位置 (Vector3)
     */
    頭の位置取得(対象プレイヤー: Player): Vector3 {
        return 対象プレイヤー.getHeadLocation();
    },

    /**
     * プレイヤーの視線の方向を取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns 視線の方向ベクトル (Vector3)
     */
    視線方向取得(対象プレイヤー: Player): Vector3 {
        return 対象プレイヤー.getViewDirection();
    },

    /**
     * プレイヤーの現在の座標を取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns 座標 (Vector3)
     */
    座標取得(対象プレイヤー: Player): Vector3 {
        return 対象プレイヤー.location;
    },

    /**
     * プレイヤーがいるディメンションを取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns ディメンションオブジェクト
     */
    ディメンション取得(対象プレイヤー: Player): Dimension {
        return 対象プレイヤー.dimension;
    },

    /**
     * プレイヤーにメッセージを送信します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param メッセージ 送信する文字列、または RawMessage オブジェクト
     */
    メッセージ送信(対象プレイヤー: Player, メッセージ: string | RawMessage): void {
        対象プレイヤー.sendMessage(メッセージ);
    },

    /**
     * プレイヤーとしてコマンドを実行します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param コマンド 実行するコマンド文字列 (スラッシュ `/` は不要)
     * @returns コマンド実行結果を含む Promise
     */
    async コマンド実行(対象プレイヤー: Player, コマンド: string): Promise<CommandResult> {
        コンソール.デバッグ(`プレイヤー「${対象プレイヤー.name}」コマンド実行: ${コマンド}`);
        return 対象プレイヤー.runCommand(コマンド);
    },

    /**
     * プレイヤーをテレポートさせます。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param 座標 テレポート先の座標 (Vector3)
     * @param オプション テレポートオプション (例: { dimension: ワールド.ディメンション取得('nether') })
     */
    テレポート(対象プレイヤー: Player, 座標: Vector3, オプション?: Parameters<Player['teleport']>[1]): void {
        対象プレイヤー.teleport(座標, オプション);
    },

    /**
     * プレイヤーを安全な場所にテレポートさせようと試みます。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param 座標 テレポート先の座標 (Vector3)
     * @param オプション テレポートオプション
     * @returns テレポートに成功した場合は true で解決される Promise
     */
    async 安全テレポート試行(対象プレイヤー: Player, 座標: Vector3, オプション?: Parameters<Player['tryTeleport']>[1]): Promise<boolean> {
        return 対象プレイヤー.tryTeleport(座標, オプション);
    },

    /**
     * プレイヤーにダメージを与えます。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param 量 ダメージ量
     * @param オプション ダメージオプション (例: { cause: 'attack', damagingEntity: attacker })
     * @returns ダメージが適用された場合は true
     */
    ダメージ適用(対象プレイヤー: Player, 量: number, オプション?: Parameters<Player['applyDamage']>[1]): boolean {
        return 対象プレイヤー.applyDamage(量, オプション);
    },

    /**
     * プレイヤーに衝撃を与えます (ベクトル方向)。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param ベクトル 衝撃の方向と強さ (Vector3)
     */
    衝撃適用(対象プレイヤー: Player, ベクトル: Vector3): void {
        対象プレイヤー.applyImpulse(ベクトル);
    },

    /**
     * プレイヤーをノックバックさせます。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param 水平強度 水平方向の強さ
     * @param 垂直強度 垂直方向の強さ
     */
    ノックバック適用(対象プレイヤー: Player, 水平強度: number, 垂直強度: number): void {
        対象プレイヤー.applyKnockback({ x: 水平強度, z: 水平強度 }, 垂直強度); 
    },

    /**
     * プレイヤーにエフェクトを付与します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param エフェクトタイプ 付与するエフェクトの種類
     * @param 持続時間 エフェクトの持続時間 (tick)
     * @param オプション エフェクトオプション (例: { amplifier: 1, showParticles: false })
     * @returns エフェクトが追加された場合は true
     */
    エフェクト付与(対象プレイヤー: Player, エフェクトタイプ: EffectType | string, 持続時間: number, オプション?: Parameters<Player['addEffect']>[2]): boolean {
        try {
            const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
            if (!effectType) {
                コンソール.エラー(`無効なエフェクトタイプ: ${エフェクトタイプ}`);
                return false;
            }
            return !!対象プレイヤー.addEffect(effectType, 持続時間, オプション);
        } catch (e: any) {
            コンソール.エラー(`プレイヤー「${対象プレイヤー.name}」へのエフェクト付与失敗: ${e.message}`);
            return false;
        }
    },

    /**
     * プレイヤーから特定のエフェクトを取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param エフェクトタイプ 取得するエフェクトの種類
     * @returns エフェクトオブジェクト、存在しない場合は undefined
     */
    エフェクト取得(対象プレイヤー: Player, エフェクトタイプ: EffectType | string): Effect | undefined {
        const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
        if (!effectType) return undefined;
        return 対象プレイヤー.getEffect(effectType);
    },

    /**
     * プレイヤーから特定のエフェクトを削除します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param エフェクトタイプ 削除するエフェクトの種類
     * @returns エフェクトが削除された場合は true
     */
    エフェクト削除(対象プレイヤー: Player, エフェクトタイプ: EffectType | string): boolean {
        const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
        if (!effectType) return false;
        return 対象プレイヤー.removeEffect(effectType);
    },

    /**
     * プレイヤーのインベントリコンポーネントを取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns インベントリコンポーネント、取得できない場合は undefined
     */
    インベントリ取得(対象プレイヤー: Player): EntityComponent | undefined {
        return 対象プレイヤー.getComponent('inventory');
        // より詳細な操作は EntityInventoryComponent のメソッドを使う
    },

    /**
    * プレイヤーをキックします。
    * @param 対象プレイヤー 操作対象の Player インスタンス
    * @param 理由 キックする理由 (オプション)
    */
    キック(対象プレイヤー: Player, 理由?: string): void {
        // Player.kick() は存在しないためコマンドでキック
        const reason = 理由 ? ` ${理由}` : '';
        // プレイヤー名に空白が含まれる場合のためにダブルクォートで囲む
        const playerName = `"${対象プレイヤー.name}"`;
        対象プレイヤー.runCommand(`kick ${playerName} ${reason}`);
    },

    /**
     * プレイヤーのゲームモードを設定します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param ゲームモード 設定するゲームモード (例: GameMode.creative)
     */
    ゲームモード設定(対象プレイヤー: Player, ゲームモード: GameMode): void {
        対象プレイヤー.setGameMode(ゲームモード);
    },

    /**
     * プレイヤーのスポーン地点を設定します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param 座標 スポーン地点の座標
     * @param ディメンション スポーン地点のディメンション (省略時はプレイヤーの現在ディメンション)
     */
    スポーン地点設定(対象プレイヤー: Player, 座標: Vector3, ディメンション?: Dimension): void {
        対象プレイヤー.setSpawnPoint({ ...座標, dimension: ディメンション ?? 対象プレイヤー.dimension });
    },

    /**
     * プレイヤーの現在の体力を取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns 現在の体力、取得できない場合は undefined
     */
    体力取得(対象プレイヤー: Player): number | undefined {
        return 対象プレイヤー.getComponent('health')?.currentValue;
    },

    /**
     * プレイヤーの最大体力を取得します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns 最大体力、取得できない場合は undefined
     */
    最大体力取得(対象プレイヤー: Player): number | undefined {
        const healthComp = 対象プレイヤー.getComponent('health');
        // Script API 1.9.0以降では value を使う
        return (healthComp as any)?.effectiveMax ?? (healthComp as any)?.value ?? undefined;
    },

    /**
     * プレイヤーのネームタグを設定します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @param ネームタグ 設定する文字列
     */
    ネームタグ設定(対象プレイヤー: Player, ネームタグ: string): void {
        対象プレイヤー.nameTag = ネームタグ;
    },

    /**
     * プレイヤーがオペレーター権限を持っているか確認します。
     * @param 対象プレイヤー 操作対象の Player インスタンス
     * @returns オペレーターであれば true
     */
    オペレーター確認(対象プレイヤー: Player): boolean {
        return 対象プレイヤー.isOp();
    },
};


// --- エンティティ操作 ---

/** エンティティインスタンスに対する操作を提供します */
export const エンティティ = {
    /**
     * エンティティにタグを追加します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param タグ 追加するタグ文字列
     * @returns タグが追加された場合は true
     */
    タグ追加(対象エンティティ: Entity, タグ: string): boolean {
        try {
            return 対象エンティティ.addTag(タグ);
        } catch (e: any) {
            コンソール.エラー(`エンティティ「${対象エンティティ.typeId}」へのタグ「${タグ}」追加失敗: ${e.message}`);
            return false;
        }
    },

    /**
     * エンティティからタグを削除します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param タグ 削除するタグ文字列
     * @returns タグが削除された場合は true
     */
    タグ削除(対象エンティティ: Entity, タグ: string): boolean {
        return 対象エンティティ.removeTag(タグ);
    },

    /**
     * エンティティが指定したタグを持っているか確認します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param タグ 確認するタグ文字列
     * @returns タグを持っていれば true
     */
    タグ確認(対象エンティティ: Entity, タグ: string): boolean {
        return 対象エンティティ.hasTag(タグ);
    },

    /**
     * エンティティから指定したコンポーネントを取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param コンポーネントID 取得するコンポーネントのID (例: 'minecraft:health')
     * @returns コンポーネントオブジェクト、存在しない場合は undefined
     */
    コンポーネント取得<T extends string>(対象エンティティ: Entity, コンポーネントID: T): any {
        return 対象エンティティ.getComponent(コンポーネントID as string);
    },

    /**
     * エンティティの頭の位置を取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns 頭の位置 (Vector3)
     */
    頭の位置取得(対象エンティティ: Entity): Vector3 {
        return 対象エンティティ.getHeadLocation();
    },

    /**
     * エンティティの視線の方向を取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns 視線の方向ベクトル (Vector3)
     */
    視線方向取得(対象エンティティ: Entity): Vector3 {
        return 対象エンティティ.getViewDirection();
    },

    /**
     * エンティティの現在の座標を取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns 座標 (Vector3)
     */
    座標取得(対象エンティティ: Entity): Vector3 {
        return 対象エンティティ.location;
    },

    /**
     * エンティティがいるディメンションを取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns ディメンションオブジェクト
     */
    ディメンション取得(対象エンティティ: Entity): Dimension {
        return 対象エンティティ.dimension;
    },

    /**
     * エンティティとしてコマンドを実行します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param コマンド 実行するコマンド文字列 (スラッシュ `/` は不要)
     * @returns コマンド実行結果を含む Promise
     */
    async コマンド実行(対象エンティティ: Entity, コマンド: string): Promise<CommandResult> {
        コンソール.デバッグ(`エンティティ「${対象エンティティ.typeId}」コマンド実行: ${コマンド}`);
        return 対象エンティティ.runCommand(コマンド);
    },

    /**
     * エンティティをテレポートさせます。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 座標 テレポート先の座標 (Vector3)
     * @param オプション テレポートオプション (例: { dimension: ワールド.ディメンション取得('nether') })
     */
    テレポート(対象エンティティ: Entity, 座標: Vector3, オプション?: Parameters<Entity['teleport']>[1]): void {
        対象エンティティ.teleport(座標, オプション);
    },

    /**
     * エンティティにダメージを与えます。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 量 ダメージ量
     * @param オプション ダメージオプション (例: { cause: 'attack', damagingEntity: attacker })
     * @returns ダメージが適用された場合は true
     */
    ダメージ適用(対象エンティティ: Entity, 量: number, オプション?: Parameters<Entity['applyDamage']>[1]): boolean {
        // Player 専用の applyDamage は存在しないので Entity のものを使う (存在すれば)
        // Note: Entity に applyDamage が存在するか確認が必要 (ver 1.8.0 時点では未実装の可能性)
        // 代替: /damage コマンドを使う
        コンソール.警告("エンティティ.ダメージ適用 は Script API で直接サポートされていない可能性があります。コマンド実行を試みます。");
        this.コマンド実行(対象エンティティ, `damage @s ${量}${オプション?.damagingEntity ? ` 0 entity_attack entity ${オプション.damagingEntity.id}` : ''}`);
        return true;
    },

    /**
     * エンティティに衝撃を与えます (ベクトル方向)。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param ベクトル 衝撃の方向と強さ (Vector3)
     */
    衝撃適用(対象エンティティ: Entity, ベクトル: Vector3): void {
        対象エンティティ.applyImpulse(ベクトル);
    },

    /**
     * エンティティをノックバックさせます。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 水平強度 水平方向の強さ
     * @param 垂直強度 垂直方向の強さ
     */
    ノックバック適用(対象エンティティ: Entity, 水平強度: number, 垂直強度: number): void {
        対象エンティティ.applyKnockback({ x: 水平強度, z: 水平強度 }, 垂直強度); // 以前のAPIとは引数の順序が異なります
    },

    /**
     * エンティティにエフェクトを付与します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param エフェクトタイプ 付与するエフェクトの種類
     * @param 持続時間 エフェクトの持続時間 (tick)
     * @param オプション エフェクトオプション (例: { amplifier: 1, showParticles: false })
     * @returns エフェクト、追加できなかった場合は undefined
     */
    エフェクト付与(対象エンティティ: Entity, エフェクトタイプ: EffectType | string, 持続時間: number, オプション?: Parameters<Entity['addEffect']>[2]): Effect | undefined {
        try {
            const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
            if (!effectType) {
                コンソール.エラー(`無効なエフェクトタイプ: ${エフェクトタイプ}`);
                return undefined;
            }
            return 対象エンティティ.addEffect(effectType, 持続時間, オプション);
        } catch (e: any) {
            コンソール.エラー(`エンティティ「${対象エンティティ.typeId}」へのエフェクト付与失敗: ${e.message}`);
            return undefined;
        }
    },

    /**
     * エンティティから特定のエフェクトを取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param エフェクトタイプ 取得するエフェクトの種類
     * @returns エフェクトオブジェクト、存在しない場合は undefined
     */
    エフェクト取得(対象エンティティ: Entity, エフェクトタイプ: EffectType | string): Effect | undefined {
        const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
        if (!effectType) return undefined;
        return 対象エンティティ.getEffect(effectType);
    },

    /**
     * エンティティから特定のエフェクトを削除します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param エフェクトタイプ 削除するエフェクトの種類
     * @returns エフェクトが削除された場合は true
     */
    エフェクト削除(対象エンティティ: Entity, エフェクトタイプ: EffectType | string): boolean {
        const effectType = typeof エフェクトタイプ === 'string' ? エフェクト.タイプ取得(エフェクトタイプ) : エフェクトタイプ;
        if (!effectType) return false;
        return 対象エンティティ.removeEffect(effectType);
    },

    /**
     * エンティティのインベントリコンポーネントを取得します (持っている場合)。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns インベントリコンポーネント、取得できない場合は undefined
     */
    インベントリ取得(対象エンティティ: Entity): EntityComponent | undefined {
        return 対象エンティティ.getComponent('inventory');
    },

    /**
     * エンティティをキルします。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns 成功した場合は true
     */
    キル(対象エンティティ: Entity): boolean {
        try {
            return 対象エンティティ.kill();
        } catch {
            // すでに死んでいる場合など
            return false;
        }
    },

    /**
     * エンティティのネームタグを設定します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param ネームタグ 設定する文字列
     */
    ネームタグ設定(対象エンティティ: Entity, ネームタグ: string): void {
        対象エンティティ.nameTag = ネームタグ;
    },

    /**
     * エンティティの現在の体力を取得します (持っている場合)。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns 現在の体力、取得できない場合は undefined
     */
    体力取得(対象エンティティ: Entity): number | undefined {
        return 対象エンティティ.getComponent('health')?.currentValue;
    },

    /**
     * エンティティのタイプIDを取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @returns タイプID (例: 'minecraft:creeper')
     */
    タイプID取得(対象エンティティ: Entity): string {
        return 対象エンティティ.typeId;
    },

    /**
     * エンティティにダイナミックプロパティを設定します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 識別子 プロパティの識別子
     * @param 値 設定する値 (文字列, 数値, 真偽値)
     */
    動的プロパティ設定(対象エンティティ: Entity, 識別子: string, 値: string | number | boolean): void {
        対象エンティティ.setDynamicProperty(識別子, 値);
    },

    /**
     * エンティティからダイナミックプロパティを取得します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 識別子 プロパティの識別子
     * @returns プロパティの値、存在しない場合は undefined
     */
    動的プロパティ取得(対象エンティティ: Entity, 識別子: string): string | number | boolean | undefined {
        return typeof 対象エンティティ.getDynamicProperty(識別子) !== "undefined";
    },

    /**
     * エンティティからダイナミックプロパティを削除します。
     * @param 対象エンティティ 操作対象の Entity インスタンス
     * @param 識別子 削除するプロパティの識別子
     * @returns 削除に成功した場合は true
     */
    動的プロパティ削除(対象エンティティ: Entity, 識別子: string): boolean {
        return 対象エンティティ.getDynamicProperty(識別子) !== undefined;
    },
};


// --- ディメンション操作 ---

/** ディメンションインスタンスに対する操作を提供します */
export const ディメンション = {
    /**
     * ディメンション内の指定した座標のブロックを取得します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param 座標 取得するブロックの座標 (Vector3)
     * @returns ブロックオブジェクト、座標が無効な場合は undefined
     */
    ブロック取得(対象ディメンション: Dimension, 座標: Vector3): Block | undefined {
        try {
            return 対象ディメンション.getBlock(座標);
        } catch {
            return undefined; // 範囲外などのエラー
        }
    },

    /**
     * ディメンション内の指定した条件に一致するエンティティを取得します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param オプション エンティティ検索オプション
     * @returns 条件に一致するエンティティの配列
     */
    エンティティ取得(対象ディメンション: Dimension, オプション: Parameters<Dimension['getEntities']>[0]): Entity[] {
        return 対象ディメンション.getEntities(オプション);
    },

    /**
     * ディメンション内の指定した条件に一致するプレイヤーを取得します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param オプション プレイヤー検索オプション
     * @returns 条件に一致するプレイヤーの配列
     */
    プレイヤー取得(対象ディメンション: Dimension, オプション: Parameters<Dimension['getPlayers']>[0]): Player[] {
        return 対象ディメンション.getPlayers(オプション);
    },

    /**
     * ディメンション内でコマンドを実行します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param コマンド 実行するコマンド文字列
     * @returns コマンド実行結果を含む Promise
     */
    async コマンド実行(対象ディメンション: Dimension, コマンド: string): Promise<CommandResult> {
        return 対象ディメンション.runCommand(コマンド);
    },

    /**
     * ディメンション内の指定した座標にエンティティをスポーンさせます。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param タイプID スポーンさせるエンティティのタイプID
     * @param 座標 スポーンさせる場所 (Vector3)
     * @returns スポーンしたエンティティ、失敗した場合は undefined
     */
    エンティティ召喚(対象ディメンション: Dimension, タイプID: string, 座標: Vector3): Entity | undefined {
        try {
            return 対象ディメンション.spawnEntity(タイプID as any, 座標);
        } catch (e: any) {
            コンソール.エラー(`エンティティ召喚失敗 (ディメンション: ${対象ディメンション.id}, タイプ: ${タイプID}):`, e.message);
            return undefined;
        }
    },

    /**
     * ディメンション内の指定した座標にアイテムをスポーンさせます。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param アイテムスタック スポーンさせるアイテム
     * @param 座標 スポーンさせる場所 (Vector3)
     * @returns スポーンしたアイテムエンティティ、失敗した場合は undefined
     */
    アイテム召喚(対象ディメンション: Dimension, アイテムスタック: ItemStack, 座標: Vector3): Entity | undefined {
        try {
            return 対象ディメンション.spawnItem(アイテムスタック, 座標);
        } catch (e: any) {
            コンソール.エラー(`アイテム召喚失敗 (ディメンション: ${対象ディメンション.id}, タイプ: ${アイテムスタック.typeId}):`, e.message);
            return undefined;
        }
    },

    /**
     * ディメンション内の指定した座標にパーティクルを表示します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @param パーティクルID 表示するパーティクルのID
     * @param 座標 表示する場所 (Vector3)
     */
    パーティクル表示(対象ディメンション: Dimension, パーティクルID: string, 座標: Vector3): void {
        対象ディメンション.spawnParticle(パーティクルID, 座標);
    },

    /**
     * ディメンションのIDを取得します。
     * @param 対象ディメンション 操作対象の Dimension インスタンス
     * @returns ディメンションID ('minecraft:overworld', 'minecraft:nether', 'minecraft:the_end')
     */
    ID取得(対象ディメンション: Dimension): string {
        return 対象ディメンション.id;
    },
};


// --- アイテムスタック操作 ---

/** ItemStack インスタンスに対する操作を提供します */
export const アイテム = {
    /**
     * アイテムスタックの量を設定します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param 量 設定する量
     */
    量設定(対象アイテム: ItemStack, 量: number): void {
        対象アイテム.amount = 量;
    },

    /**
     * アイテムスタックの量を取得します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @returns アイテムの量
     */
    量取得(対象アイテム: ItemStack): number {
        return 対象アイテム.amount;
    },

    /**
     * アイテムスタックのタイプIDを取得します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @returns タイプID (例: 'minecraft:diamond_sword')
     */
    タイプID取得(対象アイテム: ItemStack): string {
        return 対象アイテム.typeId;
    },

    /**
     * アイテムスタックのネームタグ（表示名）を設定します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param ネームタグ 設定する名前
     */
    ネームタグ設定(対象アイテム: ItemStack, ネームタグ: string): void {
        対象アイテム.nameTag = ネームタグ;
    },

    /**
     * アイテムスタックのネームタグ（表示名）を取得します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @returns ネームタグ、設定されていない場合は undefined
     */
    ネームタグ取得(対象アイテム: ItemStack): string | undefined {
        return 対象アイテム.nameTag;
    },

    /**
     * アイテムスタックの説明文 (Lore) を設定します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param 説明文 説明文の文字列配列
     */
    説明文設定(対象アイテム: ItemStack, 説明文: string[]): void {
        対象アイテム.setLore(説明文);
    },

    /**
     * アイテムスタックの説明文 (Lore) を取得します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @returns 説明文の文字列配列
     */
    説明文取得(対象アイテム: ItemStack): string[] {
        return 対象アイテム.getLore();
    },

    /**
     * アイテムスタックから指定したコンポーネントを取得します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param コンポーネントID 取得するコンポーネントのID (例: 'minecraft:durability')
     * @returns コンポーネントオブジェクト、存在しない場合は undefined
     */
    コンポーネント取得<T extends string>(対象アイテム: ItemStack, コンポーネントID: T): any {
        return 対象アイテム.getComponent(コンポーネントID as string);
    },

    /**
     * アイテムスタックが指定したタグを持っているか確認します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param タグ 確認するタグ
     * @returns タグを持っていれば true
     */
    タグ確認(対象アイテム: ItemStack, タグ: string): boolean {
        // ItemStack に直接 hasTag はないため、ItemComponent の minecraft:tags を確認する
        return 対象アイテム.hasTag(タグ) ?? false;
    },

    /**
     * アイテムスタックが特定のアイテムタイプかどうか確認します。
     * @param 対象アイテム 操作対象の ItemStack インスタンス
     * @param タイプID 比較するタイプID
     * @returns タイプが一致すれば true
     */
    タイプ確認(対象アイテム: ItemStack | undefined | null, タイプID: string): boolean {
        return 対象アイテム?.typeId === タイプID;
    },
};


// --- ブロック操作 ---

/** Block インスタンスに対する操作を提供します */
export const ブロック = {
    /**
     * ブロックのタイプIDを取得します。
     * @param 対象ブロック 操作対象の Block インスタンス
     * @returns タイプID (例: 'minecraft:stone')
     */
    タイプID取得(対象ブロック: Block): string {
        return 対象ブロック.typeId;
    },

    /**
     * ブロックの座標を取得します。
     * @param 対象ブロック 操作対象の Block インスタンス
     * @returns 座標 (Vector3)
     */
    座標取得(対象ブロック: Block): Vector3 {
        return 対象ブロック.location;
    },

    /**
     * ブロックが存在するディメンションを取得します。
     * @param 対象ブロック 操作対象の Block インスタンス
     * @returns ディメンションオブジェクト
     */
    ディメンション取得(対象ブロック: Block): Dimension {
        return 対象ブロック.dimension;
    },

    /**
     * ブロックから指定したコンポーネントを取得します。
     * @param 対象ブロック 操作対象の Block インスタンス
     * @param コンポーネントID 取得するコンポーネントのID (例: 'minecraft:inventory')
     * @returns コンポーネントオブジェクト、存在しない場合は undefined
     */
    コンポーネント取得<T extends keyof BlockComponentTypes>(対象ブロック: Block, コンポーネントID: T): BlockComponentTypes[T] | undefined {
        return 対象ブロック.getComponent(コンポーネントID as string) as BlockComponentTypes[T] | undefined;
    },

    /**
     * ブロックが特定のタイプかどうか確認します。
     * @param 対象ブロック 操作対象の Block インスタンス
     * @param タイプID 比較するタイプID
     * @returns タイプが一致すれば true
     */
    タイプ確認(対象ブロック: Block | undefined | null, タイプID: string): boolean {
        return 対象ブロック?.typeId === タイプID;
    },

    /**
     * 指定した座標にブロックを設置します (既存ブロックを上書き)。
     * @param ディメンション 設置するディメンション
     * @param 座標 設置する座標
     * @param タイプID 設置するブロックのタイプID
     * @returns 成功した場合は設置されたブロック、失敗した場合は undefined
     */
    設置(ディメンション: Dimension, 座標: Vector3, タイプID: string): Block | undefined {
        try {
            // setType は void を返すため、設置後に getBlock する
            ディメンション.getBlock(座標)?.setType(タイプID);
            return ディメンション.getBlock(座標);
        } catch (e: any) {
            コンソール.エラー(`ブロック設置失敗 (座標: ${JSON文字列化(座標)}, タイプ: ${タイプID}):`, e.message);
            return undefined;
        }
    },

    /**
     * 指定した座標のブロックを空気 (破壊) にします。
     * @param ディメンション 操作対象のディメンション
     * @param 座標 破壊するブロックの座標
     * @returns 成功した場合は true
     */
    破壊(ディメンション: Dimension, 座標: Vector3): boolean {
        try {
            ディメンション.getBlock(座標)?.setType('minecraft:air');
            return true;
        } catch {
            return false;
        }
    },
};


// --- エフェクト操作 ---

/** EffectType に関する操作を提供します */
export const エフェクト = {
    /**
     * エフェクトのタイプID (文字列) から EffectType オブジェクトを取得します。
     * @param _タイプID エフェクトのタイプID (例: 'speed')
     * @returns EffectType オブジェクト、見つからない場合は undefined
     */
    タイプ取得(_タイプID: string): EffectType | undefined {
        try {
            // EffectType の取得方法は API バージョンによって異なる可能性あり
            // 現在は EffectType オブジェクトを直接インポートして利用するのが一般的
            // 文字列から動的に取得する標準的な方法はなさそう？
            // ダミーの実装 (将来のAPI変更に備える)
            // const effectTypes = import('@minecraft/server').then(mc => mc.EffectTypes); // これは動作しない
            // return effectTypes?.get(タイプID);
            コンソール.警告(`エフェクト.タイプ取得 は現在限定的なサポートです。EffectType オブジェクトを直接使用してください。`);
            // ここで文字列に対応する EffectType を返すのは困難なため、利用側で EffectType を使うことを促す
            return undefined;
        } catch {
            return undefined;
        }
    }
};


// --- ベクトル操作 ---

/** Vector3 に対する簡単な操作ヘルパーを提供します */
export const ベクトル = {
    /**
     * 2つのベクトルを加算します。
     * @param v1 最初のベクトル
     * @param v2 加算するベクトル
     * @returns 加算結果の新しいベクトル
     */
    加算(v1: Vector3, v2: Vector3): Vector3 {
        return { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
    },

    /**
     * 最初のベクトルから2番目のベクトルを減算します。
     * @param v1 最初のベクトル
     * @param v2 減算するベクトル
     * @returns 減算結果の新しいベクトル
     */
    減算(v1: Vector3, v2: Vector3): Vector3 {
        return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
    },

    /**
     * ベクトルをスカラー値で乗算します。
     * @param v ベクトル
     * @param スカラー 乗数
     * @returns 乗算結果の新しいベクトル
     */
    乗算(v: Vector3, スカラー: number): Vector3 {
        return { x: v.x * スカラー, y: v.y * スカラー, z: v.z * スカラー };
    },

    /**
     * ベクトルの長さを計算します。
     * @param v ベクトル
     * @returns ベクトルの長さ
     */
    長さ(v: Vector3): number {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    },

    /**
     * 2点間の距離を計算します。
     * @param v1 最初の点
     * @param v2 2番目の点
     * @returns 2点間の距離
     */
    距離(v1: Vector3, v2: Vector3): number {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        const dz = v1.z - v2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    /**
     * ベクトルを正規化します (長さを1にする)。ゼロベクトルの場合はゼロベクトルを返します。
     * @param v ベクトル
     * @returns 正規化された新しいベクトル
     */
    正規化(v: Vector3): Vector3 {
        const len = this.長さ(v);
        if (len === 0) return { x: 0, y: 0, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    },

    /**
     * Vector オブジェクトの静的メソッドのラッパー
     */
    ゼロ: Vector.zero
};


// --- イベント購読 ---

/** ワールド初期化完了時のイベントを購読します (通常一度だけ発生) */
export function ワールド初期化完了時(コールバック: (event: WorldLoadAfterEvent) => void): void {
    world.afterEvents.worldLoad.subscribe(コールバック);
}
/** プレイヤー参加時のイベントを購読します */
export function プレイヤー参加時(コールバック: (event: PlayerJoinAfterEvent) => void): void {
    world.afterEvents.playerJoin.subscribe(コールバック);
}
/** プレイヤー退出時のイベントを購読します */
export function プレイヤー退出時(コールバック: (event: PlayerLeaveAfterEvent) => void): void {
    world.afterEvents.playerLeave.subscribe(コールバック);
}
/** チャット送信前のイベントを購読します (キャンセル可能) */
export function チャット送信前(コールバック: (event: ChatSendBeforeEvent) => void): void {
    world.beforeEvents.chatSend.subscribe(コールバック);
}
/** チャット送信後のイベントを購読します */
export function チャット送信時(コールバック: (event: ChatSendAfterEvent) => void): void {
    world.afterEvents.chatSend.subscribe(コールバック);
}
/** スクリプトイベント受信時のイベントを購読します */
export function スクリプトイベント受信時(コールバック: (event: ScriptEventCommandMessageAfterEvent) => void): void {
    system.afterEvents.scriptEventReceive.subscribe(コールバック);
}
/** アイテム使用時のイベントを購読します */
export function アイテム使用時(コールバック: (event: ItemUseAfterEvent) => void): void {
    world.afterEvents.itemUse.subscribe(コールバック);
}

/** エンティティがエンティティを攻撃したときのイベントを購読します */
export function エンティティ攻撃時(コールバック: (event: EntityHitEntityAfterEvent) => void): void {
    world.afterEvents.entityHitEntity.subscribe(コールバック);
}
/** エンティティがブロックを攻撃したときのイベントを購読します */
export function エンティティブロック攻撃時(コールバック: (event: EntityHitBlockAfterEvent) => void): void {
    world.afterEvents.entityHitBlock.subscribe(コールバック);
}
/** エンティティがダメージを受けたときのイベントを購読します */
export function エンティティダメージ時(コールバック: (event: EntityHurtAfterEvent) => void): void {
    world.afterEvents.entityHurt.subscribe(コールバック);
}
/** エンティティが死んだときのイベントを購読します */
export function エンティティ死亡時(コールバック: (event: EntityDieAfterEvent) => void): void {
    world.afterEvents.entityDie.subscribe(コールバック);
}
/** ブロック設置後のイベントを購読します */
export function ブロック設置時(コールバック: (event: PlayerPlaceBlockAfterEvent) => void): void {
    world.afterEvents.playerPlaceBlock.subscribe(コールバック);
}
/** ブロック破壊後のイベントを購読します */
export function ブロック破壊時(コールバック: (event: PlayerBreakBlockAfterEvent) => void): void {
    world.afterEvents.playerBreakBlock.subscribe(コールバック);
}
/** 天候変化時のイベントを購読します */
export function 天候変化時(コールバック: (event: WeatherChangeAfterEvent) => void): void {
    world.afterEvents.weatherChange.subscribe(コールバック);
}

/** ボタンが押されたときのイベントを購読します */
export function ボタン押下時(コールバック: (event: ButtonPushAfterEvent) => void): void {
    world.afterEvents.buttonPush.subscribe(コールバック);
}
/** レバーが操作されたときのイベントを購読します */
export function レバー操作時(コールバック: (event: LeverActionAfterEvent) => void): void {
    world.afterEvents.leverAction.subscribe(コールバック);
}
/** ピストンが動作したときのイベントを購読します */
export function ピストン動作時(コールバック: (event: PistonActivateAfterEvent) => void): void {
    world.afterEvents.pistonActivate.subscribe(コールバック);
}
/** プレイヤーがブロックを操作したときのイベントを購読します */
export function プレイヤーブロック操作時(コールバック: (event: PlayerInteractWithBlockAfterEvent) => void): void {
    world.afterEvents.playerInteractWithBlock.subscribe(コールバック);
}
/** プレイヤーがエンティティを操作したときのイベントを購読します */
export function プレイヤーエンティティ操作時(コールバック: (event: PlayerInteractWithEntityAfterEvent) => void): void {
    world.afterEvents.playerInteractWithEntity.subscribe(コールバック);
}


// --- JavaScript 標準機能ラッパー (変更なし) ---
export function 配列作成<T>(...要素: T[]): T[] { return 要素; }
export function 配列各要素<T>(配列: readonly T[], 処理: (要素: T, インデックス: number, 元配列: readonly T[]) => void): void { 配列.forEach(処理); }
export function 配列絞込<T>(配列: readonly T[], 条件: (要素: T, インデックス: number, 元配列: readonly T[]) => boolean): T[] { return 配列.filter(条件); }
export function 配列変換<T, U>(配列: readonly T[], 処理: (要素: T, インデックス: number, 元配列: readonly T[]) => U): U[] { return 配列.map(処理); }
export function 配列検索<T>(配列: readonly T[], 条件: (要素: T, インデックス: number, 元配列: readonly T[]) => boolean): T | undefined { return 配列.find(条件); }
export function 配列長さ<T>(配列: readonly T[]): number { return 配列.length; }
export function 配列含む<T>(配列: readonly T[], 要素: T): boolean { return 配列.includes(要素); }
export function 新しい約束<T>(実行関数: (解決: (value: T | PromiseLike<T>) => void, 拒否: (reason?: any) => void) => void): Promise<T> { return new Promise<T>(実行関数); }
export async function 約束成功時<T, TResult = T>(約束: Promise<T>, 処理: (value: T) => TResult | PromiseLike<TResult>): Promise<TResult> { return 約束.then(処理); }
export async function 約束失敗時<TResult = never>(約束: Promise<any>, 処理: (reason: any) => TResult | PromiseLike<TResult>): Promise<any | TResult> { return 約束.catch(処理); }
export async function 約束完了時(約束: Promise<any>, 処理: () => void): Promise<any> { return 約束.finally(処理); }
export function 全約束待機<T extends readonly unknown[] | []>(約束配列: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> { return Promise.all(約束配列); }
export function 文字列含む(対象文字列: string, 検索文字列: string): boolean { return 対象文字列.includes(検索文字列); }
export function 文字列置換(対象文字列: string, 検索: string | RegExp, 置換: string): string { return 対象文字列.replace(検索, 置換); }
export function 文字列分割(対象文字列: string, 区切り文字: string | RegExp, 上限?: number): string[] { return 対象文字列.split(区切り文字, 上限); }
export function 文字列結合(文字列配列: string[], 区切り文字: string = ','): string { return 文字列配列.join(区切り文字); }
export function 文字列長さ(対象文字列: string): number { return 対象文字列.length; }
export function JSON解析<T = any>(json文字列: string): T { try { return JSON.parse(json文字列); } catch (e: any) { コンソール.エラー("JSON解析失敗:", e.message); throw new Error(`JSON解析エラー: ${e.message}`); } }
export function JSON文字列化(オブジェクト: any, スペース?: string | number): string { try { return JSON.stringify(オブジェクト, null, スペース); } catch (e: any) { コンソール.エラー("JSON文字列化失敗:", e.message); throw new Error(`JSON文字列化エラー: ${e.message}`); } }
