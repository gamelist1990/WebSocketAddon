// Vector使える用にするためのモジュール
import { Vector3 } from "@minecraft/server";

/**
 * 3Dベクトルを表し、ベクトル演算のためのユーティリティメソッドを提供します。
 */
export class Vector {
    public x: number;
    public y: number;
    public z: number;

    /**
     * 新しい Vector インスタンスを作成します。
     * @param x x成分 (デフォルト: 0)
     * @param y y成分 (デフォルト: 0)
     * @param z z成分 (デフォルト: 0)
     */
    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Minecraft API の Vector3 オブジェクトから Vector インスタンスを作成します。
     * @param vec3 変換元の Vector3 オブジェクト
     * @returns 新しい Vector インスタンス
     */
    static from(vec3: Vector3): Vector {
        return new Vector(vec3.x, vec3.y, vec3.z);
    }

    /**
     * この Vector インスタンスを Minecraft API の Vector3 オブジェクトに変換します。
     * @returns Vector3 オブジェクト
     */
    toVector3(): Vector3 {
        return { x: this.x, y: this.y, z: this.z };
    }

    /**
     * このベクトルの大きさ（長さ）を計算します。
     * @returns ベクトルの大きさ
     */
    magnitude(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /**
     * 指定されたベクトルの大きさ（長さ）を計算します。
     * @param vec 大きさを計算するベクトル (Vector または Vector3)
     * @returns ベクトルの大きさ
     */
    static magnitude(vec: Vector | Vector3): number {
        return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
    }

    /**
     * このベクトルの正規化されたコピー（単位ベクトル）を返します。
     * 大きさが0の場合はゼロベクトルを返します。
     * @returns 新しい正規化された Vector インスタンス
     */
    normalized(): Vector {
        const mag = this.magnitude();
        // 浮動小数点数の比較における潜在的な問題を避けるため、非常に小さい値でチェックする方が安全な場合がある
        if (mag < Number.EPSILON) {
            return Vector.zero; // ゼロベクトルを返す
        }
        return new Vector(this.x / mag, this.y / mag, this.z / mag);
    }

    /**
     * 指定されたベクトルを正規化します。
     * @param vec 正規化するベクトル (Vector または Vector3)
     * @returns 新しい正規化された Vector インスタンス
     */
    static normalize(vec: Vector | Vector3): Vector {
        const mag = Vector.magnitude(vec);
        if (mag < Number.EPSILON) {
            return Vector.zero;
        }
        return new Vector(vec.x / mag, vec.y / mag, vec.z / mag);
    }

    /**
     * このベクトルに別のベクトルを加算します。
     * @param other 加算するベクトル (Vector または Vector3)
     * @returns 加算結果を表す新しい Vector インスタンス
     */
    add(other: Vector | Vector3): Vector {
        return new Vector(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    /**
     * 2つのベクトルを加算します。
     * @param a 最初のベクトル (Vector または Vector3)
     * @param b 2番目のベクトル (Vector または Vector3)
     * @returns 加算結果を表す新しい Vector インスタンス
     */
    static add(a: Vector | Vector3, b: Vector | Vector3): Vector {
        return new Vector(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    /**
     * このベクトルから別のベクトルを減算します。
     * @param other 減算するベクトル (Vector または Vector3)
     * @returns 減算結果を表す新しい Vector インスタンス
     */
    subtract(other: Vector | Vector3): Vector {
        return new Vector(this.x - other.x, this.y - other.y, this.z - other.z);
    }

    /**
     * ベクトル a から ベクトル b を減算します。
     * @param a 最初のベクトル (Vector または Vector3)
     * @param b 減算するベクトル (Vector または Vector3)
     * @returns 減算結果 (a - b) を表す新しい Vector インスタンス
     */
    static subtract(a: Vector | Vector3, b: Vector | Vector3): Vector {
        return new Vector(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    /**
     * このベクトルをスカラー値で乗算します。
     * @param scalar 乗算するスカラー値
     * @returns 乗算結果を表す新しい Vector インスタンス
     */
    multiply(scalar: number): Vector {
        return new Vector(this.x * scalar, this.y * scalar, this.z * scalar);
    }

    /**
     * 指定されたベクトルをスカラー値で乗算します。
     * @param vec 乗算するベクトル (Vector または Vector3)
     * @param scalar 乗算するスカラー値
     * @returns 乗算結果を表す新しい Vector インスタンス
     */
    static multiply(vec: Vector | Vector3, scalar: number): Vector {
        return new Vector(vec.x * scalar, vec.y * scalar, vec.z * scalar);
    }

    /**
     * このベクトル（点）と別のベクトル（点）の間の距離を計算します。
     * @param other もう一方のベクトル (Vector または Vector3)
     * @returns 2点間の距離
     */
    distance(other: Vector | Vector3): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * 2つのベクトル（点）間の距離を計算します。
     * @param a 最初のベクトル (Vector または Vector3)
     * @param b 2番目のベクトル (Vector または Vector3)
     * @returns 2点間の距離
     */
    static distance(a: Vector | Vector3, b: Vector | Vector3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * このベクトルが指定されたベクトルと等しいかどうかを比較します。
     * @param other 比較対象のベクトル (Vector または Vector3)
     * @param tolerance 許容誤差 (デフォルト: Number.EPSILON)。成分ごとの差がこの値以下であれば等しいとみなします。
     * @returns 2つのベクトルが等しい場合は true、そうでない場合は false
     */
    equals(other: Vector | Vector3, tolerance: number = Number.EPSILON): boolean {
        return (
            Math.abs(this.x - other.x) <= tolerance &&
            Math.abs(this.y - other.y) <= tolerance &&
            Math.abs(this.z - other.z) <= tolerance
        );
    }

    /**
     * 2つのベクトルが等しいかどうかを比較します。
     * @param a 最初のベクトル (Vector または Vector3)
     * @param b 2番目のベクトル (Vector または Vector3)
     * @param tolerance 許容誤差 (デフォルト: Number.EPSILON)。成分ごとの差がこの値以下であれば等しいとみなします。
     * @returns 2つのベクトルが等しい場合は true、そうでない場合は false
     */
    static equals(a: Vector | Vector3, b: Vector | Vector3, tolerance: number = Number.EPSILON): boolean {
        return (
            Math.abs(a.x - b.x) <= tolerance &&
            Math.abs(a.y - b.y) <= tolerance &&
            Math.abs(a.z - b.z) <= tolerance
        );
    }

    /**
     * ゼロベクトル (0, 0, 0) を表す静的プロパティ。
     */
    static readonly zero: Vector = new Vector(0, 0, 0);
}