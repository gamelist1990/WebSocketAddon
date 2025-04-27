/**
 * 3次元ベクトルを表すクラス。
 * パフォーマンスと軽量性を考慮し、イミュータブル操作とミュータブル（インプレース）操作を提供します。
 */
export class Vector3 {
    public x: number;
    public y: number;
    public z: number;

    /**
     * Vector3 の新しいインスタンスを作成します。
     * @param x x成分 (デフォルトは 0)
     * @param y y成分 (デフォルトは 0)
     * @param z z成分 (デフォルトは 0)
     */
    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    // --- 静的プロパティ (定数ベクトル) ---

    /** ゼロベクトル (0, 0, 0) */
    static readonly ZERO = new Vector3(0, 0, 0);
    /** 全成分が1のベクトル (1, 1, 1) */
    static readonly ONE = new Vector3(1, 1, 1);
    /** X軸の正方向単位ベクトル (1, 0, 0) */
    static readonly UNIT_X = new Vector3(1, 0, 0);
    /** Y軸の正方向単位ベクトル (0, 1, 0) */
    static readonly UNIT_Y = new Vector3(0, 1, 0);
    /** Z軸の正方向単位ベクトル (0, 0, 1) */
    static readonly UNIT_Z = new Vector3(0, 0, 1);
    /** 上方向ベクトル (0, 1, 0) */
    static readonly UP = new Vector3(0, 1, 0);
    /** 下方向ベクトル (0, -1, 0) */
    static readonly DOWN = new Vector3(0, -1, 0);
    /** 左方向ベクトル (-1, 0, 0) */
    static readonly LEFT = new Vector3(-1, 0, 0);
    /** 右方向ベクトル (1, 0, 0) */
    static readonly RIGHT = new Vector3(1, 0, 0);
    /** 前方向ベクトル (0, 0, -1) ※右手座標系 */
    static readonly FORWARD = new Vector3(0, 0, -1);
    /** 後方向ベクトル (0, 0, 1) ※右手座標系 */
    static readonly BACK = new Vector3(0, 0, 1);


    // --- 静的メソッド ---

    /**
     * 2つのベクトルの加算結果を新しいベクトルとして返します。
     * @param v1 最初のベクトル
     * @param v2 2番目のベクトル
     * @returns 加算結果の新しい Vector3 インスタンス
     */
    static add(v1: Vector3, v2: Vector3): Vector3 {
        return new Vector3(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    }

    /**
     * 2つのベクトルの減算結果 (v1 - v2) を新しいベクトルとして返します。
     * @param v1 最初のベクトル
     * @param v2 2番目のベクトル
     * @returns 減算結果の新しい Vector3 インスタンス
     */
    static subtract(v1: Vector3, v2: Vector3): Vector3 {
        return new Vector3(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    /**
    * ベクトルをスカラー倍した結果を新しいベクトルとして返します。
    * @param v ベクトル
    * @param s スカラー値
    * @returns スカラー倍された新しい Vector3 インスタンス
    */
    static multiplyScalar(v: Vector3, s: number): Vector3 {
        return new Vector3(v.x * s, v.y * s, v.z * s);
    }

    /**
     * 2つのベクトルの内積を計算します。
     * @param v1 最初のベクトル
     * @param v2 2番目のベクトル
     * @returns 内積の値
     */
    static dot(v1: Vector3, v2: Vector3): number {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    /**
     * 2つのベクトルの外積 (v1 x v2) を新しいベクトルとして返します。
     * @param v1 最初のベクトル
     * @param v2 2番目のベクトル
     * @returns 外積結果の新しい Vector3 インスタンス
     */
    static cross(v1: Vector3, v2: Vector3): Vector3 {
        return new Vector3(
            v1.y * v2.z - v1.z * v2.y,
            v1.z * v2.x - v1.x * v2.z,
            v1.x * v2.y - v1.y * v2.x
        );
    }

    /**
     * 2点間の距離を計算します。
     * @param v1 始点ベクトル
     * @param v2 終点ベクトル
     * @returns 距離
     */
    static distance(v1: Vector3, v2: Vector3): number {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        const dz = v1.z - v2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * 2点間の距離の2乗を計算します。平方根計算を避けるため高速です。
     * @param v1 始点ベクトル
     * @param v2 終点ベクトル
     * @returns 距離の2乗
     */
    static distanceSquared(v1: Vector3, v2: Vector3): number {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        const dz = v1.z - v2.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * 2つのベクトル間を線形補間します。
     * @param v1 開始ベクトル
     * @param v2 終了ベクトル
     * @param alpha 補間係数 (0.0 から 1.0 の範囲)。0.0でv1、1.0でv2を返す。
     * @returns 補間された新しい Vector3 インスタンス
     */
    static lerp(v1: Vector3, v2: Vector3, alpha: number): Vector3 {
        return new Vector3(
            v1.x + (v2.x - v1.x) * alpha,
            v1.y + (v2.y - v1.y) * alpha,
            v1.z + (v2.z - v1.z) * alpha
        );
    }

    // --- インスタンスメソッド (イミュータブル: 新しいインスタンスを返す) ---

    /**
     * このベクトルと指定されたベクトルの加算結果を新しいベクトルとして返します。
     * @param v 加算するベクトル
     * @returns 加算結果の新しい Vector3 インスタンス
     */
    add(v: Vector3): Vector3 {
        return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    /**
     * このベクトルから指定されたベクトルを減算した結果 (this - v) を新しいベクトルとして返します。
     * @param v 減算するベクトル
     * @returns 減算結果の新しい Vector3 インスタンス
     */
    subtract(v: Vector3): Vector3 {
        return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    /**
     * このベクトルをスカラー倍した結果を新しいベクトルとして返します。
     * @param s スカラー値
     * @returns スカラー倍された新しい Vector3 インスタンス
     */
    multiplyScalar(s: number): Vector3 {
        return new Vector3(this.x * s, this.y * s, this.z * s);
    }

    /**
     * このベクトルをスカラー値で除算した結果を新しいベクトルとして返します。
     * ゼロ除算の場合は Infinity または NaN になります。
     * @param s 除算するスカラー値
     * @returns 除算された新しい Vector3 インスタンス
     */
    divideScalar(s: number): Vector3 {
        return this.multiplyScalar(1 / s);
    }

    /**
     * このベクトルと指定されたベクトルの内積を計算します。
     * @param v 内積を計算する相手のベクトル
     * @returns 内積の値
     */
    dot(v: Vector3): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    /**
     * このベクトルと指定されたベクトルの外積 (this x v) を新しいベクトルとして返します。
     * @param v 外積を計算する相手のベクトル
     * @returns 外積結果の新しい Vector3 インスタンス
     */
    cross(v: Vector3): Vector3 {
        return new Vector3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    /**
     * ベクトルの長さ（大きさ）を計算します。
     * @returns ベクトルの長さ
     */
    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /**
     * ベクトルの長さの2乗を計算します。`length()`より高速です。
     * @returns ベクトルの長さの2乗
     */
    lengthSquared(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * このベクトルを正規化した新しいベクトル（単位ベクトル）を返します。
     * 長さが 0 の場合はゼロベクトルを返します。
     * @returns 正規化された新しい Vector3 インスタンス
     */
    normalize(): Vector3 {
        const lenSq = this.lengthSquared();
        if (lenSq > 1e-8) { // ゼロベクトルに近い場合は処理しない
            const invLen = 1 / Math.sqrt(lenSq);
            return new Vector3(this.x * invLen, this.y * invLen, this.z * invLen);
        } else {
            return new Vector3(0, 0, 0); // 長さがほぼゼロならゼロベクトルを返す
        }
    }

    /**
     * このベクトルと指定されたベクトルとの距離を計算します。
     * @param v 距離を計算する相手のベクトル
     * @returns 距離
     */
    distanceTo(v: Vector3): number {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * このベクトルと指定されたベクトルとの距離の2乗を計算します。
     * `distanceTo()` より高速です。
     * @param v 距離を計算する相手のベクトル
     * @returns 距離の2乗
     */
    distanceToSquared(v: Vector3): number {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * このベクトルから指定されたベクトルへ線形補間した結果を新しいベクトルとして返します。
     * @param v 補間の終点ベクトル
     * @param alpha 補間係数 (0.0 から 1.0)。0.0で自身、1.0でvを返す。
     * @returns 補間された新しい Vector3 インスタンス
     */
    lerp(v: Vector3, alpha: number): Vector3 {
        return new Vector3(
            this.x + (v.x - this.x) * alpha,
            this.y + (v.y - this.y) * alpha,
            this.z + (v.z - this.z) * alpha
        );
    }

    /**
     * このベクトルの向きを反転させた新しいベクトルを返します。
     * @returns 向きが反転した新しい Vector3 インスタンス
     */
    negate(): Vector3 {
        return new Vector3(-this.x, -this.y, -this.z);
    }


    // --- インスタンスメソッド (ミュータブル/インプレース: 自身を変更し this を返す) ---

    /**
     * このベクトルの成分を設定します。
     * @param x 新しいx成分
     * @param y 新しいy成分
     * @param z 新しいz成分
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    set(x: number, y: number, z: number): this {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    /**
    * 指定されたベクトルの成分をこのベクトルにコピーします。
    * @param v コピー元のベクトル
    * @returns この Vector3 インスタンス (メソッドチェーン用)
    */
    copy(v: Vector3): this {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    /**
     * このベクトルに指定されたベクトルを加算します (インプレース)。
     * @param v 加算するベクトル
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    addInPlace(v: Vector3): this {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    /**
     * このベクトルから指定されたベクトルを減算します (インプレース)。
     * @param v 減算するベクトル
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    subtractInPlace(v: Vector3): this {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    /**
     * このベクトルをスカラー倍します (インプレース)。
     * @param s スカラー値
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    multiplyScalarInPlace(s: number): this {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    /**
     * このベクトルをスカラー値で除算します (インプレース)。
     * ゼロ除算の場合は Infinity または NaN になります。
     * @param s 除算するスカラー値
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    divideScalarInPlace(s: number): this {
        return this.multiplyScalarInPlace(1 / s);
    }

    /**
     * このベクトルと指定されたベクトルの外積 (this x v) を計算し、結果をこのベクトルに設定します (インプレース)。
     * @param v 外積を計算する相手のベクトル
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    crossInPlace(v: Vector3): this {
        const x = this.x, y = this.y, z = this.z;
        this.x = y * v.z - z * v.y;
        this.y = z * v.x - x * v.z;
        this.z = x * v.y - y * v.x;
        return this;
    }

    /**
     * このベクトルを正規化します (インプレース)。
     * 長さが 0 に近い場合は変更されません。
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    normalizeInPlace(): this {
        const lenSq = this.lengthSquared();
        if (lenSq > 1e-8) {
            const invLen = 1 / Math.sqrt(lenSq);
            this.x *= invLen;
            this.y *= invLen;
            this.z *= invLen;
        }
        // 長さがゼロに近い場合は変更しない (ゼロベクトルのまま)
        return this;
    }

    /**
     * このベクトルから指定されたベクトルへ線形補間し、結果をこのベクトルに設定します (インプレース)。
     * @param v 補間の終点ベクトル
     * @param alpha 補間係数 (0.0 から 1.0)。
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    lerpInPlace(v: Vector3, alpha: number): this {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;
        return this;
    }

    /**
     * このベクトルの向きを反転させます (インプレース)。
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    negateInPlace(): this {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        return this;
    }


    // --- ユーティリティメソッド ---

    /**
     * このベクトルの複製（新しいインスタンス）を作成します。
     * @returns このベクトルと同じ成分を持つ新しい Vector3 インスタンス
     */
    clone(): Vector3 {
        return new Vector3(this.x, this.y, this.z);
    }

    /**
     * このベクトルが指定されたベクトルと（許容誤差の範囲内で）等しいか比較します。
     * @param v 比較対象のベクトル
     * @param tolerance 許容誤差 (デフォルトは 1e-6)
     * @returns 成分が等しい場合は true、そうでない場合は false
     */
    equals(v: Vector3, tolerance: number = 1e-6): boolean {
        return (
            Math.abs(this.x - v.x) <= tolerance &&
            Math.abs(this.y - v.y) <= tolerance &&
            Math.abs(this.z - v.z) <= tolerance
        );
    }

    /**
     * ベクトルの文字列表現を返します。
     * @param fractionDigits 小数点以下の桁数 (オプション)
     * @returns "(x, y, z)" 形式の文字列
     */
    toString(fractionDigits?: number): string {
        const x = fractionDigits === undefined ? this.x : this.x.toFixed(fractionDigits);
        const y = fractionDigits === undefined ? this.y : this.y.toFixed(fractionDigits);
        const z = fractionDigits === undefined ? this.z : this.z.toFixed(fractionDigits);
        return `(${x}, ${y}, ${z})`;
    }

    /**
     * ベクトル成分を配列として返します。
     * @returns [x, y, z]
     */
    toArray(): [number, number, number] {
        return [this.x, this.y, this.z];
    }

    /**
     * 配列からベクトル成分を設定します。
     * @param array [x, y, z] の形式の配列
     * @returns この Vector3 インスタンス (メソッドチェーン用)
     */
    fromArray(array: [number, number, number] | number[]): this {
        this.x = array[0];
        this.y = array[1];
        this.z = array[2];
        return this;
    }
}