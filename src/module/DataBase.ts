// Database.ts (修正提案版)
import { world, ScoreboardObjective, Player, system } from "@minecraft/server";

export class Database {
    private objective: ScoreboardObjective | undefined; // undefined を許容
    private readonly objectiveName: string;
    private participantsBackup: Set<string> = new Set();
    private isRecreating = false;
    private initializationPromise: Promise<void>;


    constructor(objectiveName: string = "ws_Data") {
        this.objectiveName = objectiveName;
        this.initializationPromise = this.initialize(); // 初期化をPromiseで管理

    }
    private async initialize(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            system.run(() => {
                this.initializeObjective().then(() => {
                    this.setupObjectiveDeletionListener();
                    resolve();
                }).catch((e) => { reject(e); });

            });
        });
    }

    private async initializeObjective() {
        try {
            let objective = world.scoreboard.getObjective(this.objectiveName);
            if (!objective) {
                objective = world.scoreboard.addObjective(this.objectiveName, this.objectiveName);
                if (!objective) { // addObjective が失敗した場合
                    throw new Error(`Failed to create objective: ${this.objectiveName}`);
                }
            }
            this.objective = objective;
            this.loadParticipantsBackup();
        } catch (error) {
            console.error("initializeObjective Error:", error);
            throw error; // より具体的なエラーを上位に伝播
        }
    }


    private setupObjectiveDeletionListener() {
        system.runInterval(() => {
            if (!world.scoreboard.getObjective(this.objectiveName) && !this.isRecreating) {
                console.warn(`Scoreboard "${this.objectiveName}" was deleted. Recreating...`);
                this.isRecreating = true;
                this.recreateObjective().finally(() => { this.isRecreating = false; });
            }
        }, 100);
    }

    private async recreateObjective() {
        try {
            this.objective = world.scoreboard.addObjective(this.objectiveName, this.objectiveName);
            if (!this.objective) throw new Error("Failed to recreate objective");

            this.loadParticipantsBackup(); // リスナーは再設定不要
            console.log(`Recreated scoreboard "${this.objectiveName}" and restored participants.`);
        }
        catch (error) {
            console.error("recreateObjective error", error);
            throw error; // 再作成に失敗した場合はエラーを投げる
        }
    }


    private loadParticipantsBackup() {
        if (!this.objective) return; // objective がない場合は何もしない
        this.participantsBackup.clear(); // Clear existing backup
        const participants = this.objective.getParticipants();
        for (const participant of participants) {
            this.participantsBackup.add(participant.displayName);
        }
    }

    async set(key: string | Player, value: number): Promise<void> {
        await this.initializationPromise; // 初期化完了を待つ
        if (!this.objective) {
            await this.recreateObjective(); //存在しないなら作成
        }

        if (typeof value !== 'number') {
            console.warn(`Database.set: Invalid value type. Expected a number, got: ${typeof value}`);
            return;
        }
        const keyString = key instanceof Player ? key.name : key;

        try {
            if (this.objective) {
                if (key instanceof Player) {
                    this.objective.setScore(key, value);
                } else {
                    this.objective.setScore(keyString, value);
                }
                this.participantsBackup.add(keyString); // 参加者リストに追加/更新
            }
            else {
                throw new Error("Objective is undefined after initialization/recreation.");
            }
        } catch (error) {
            console.error(`Failed to set data for key "${keyString}":`, error); // より詳細なエラーメッセージ
            throw error; // 呼び出し元にエラーを伝播
        }
    }
    async get(key: string | Player): Promise<number | undefined> {
        await this.initializationPromise; // 初期化完了を待つ
        if (!this.objective) {
            await this.recreateObjective(); //存在しないなら作成
        }
        const keyString = key instanceof Player ? key.name : key;
        try {
            if (this.objective)
                return key instanceof Player ? this.objective.getScore(key) : this.objective.getScore(keyString);

            else
                throw new Error("Objective is undefined after initialization/recreation.");


        } catch (error) {
            console.error("Failed to get data:", error);
            throw error; // objectiveがないなど、根本的な問題
        }
    }

    async has(key: string | Player): Promise<boolean> {
        await this.initializationPromise; // 初期化を待つ
        if (!this.objective) {
            await this.recreateObjective(); //存在しないなら作成
        }
        const keyString = key instanceof Player ? key.name : key;
        try {
            if (this.objective) {
                // スコアの取得を試みる。例外が発生しなければ存在するとみなす
                this.objective.getScore(keyString);
                return true;
            }
            else
                throw new Error("Objective is undefined after initialization/recreation.");

        } catch (error) {
            //console.error("has method error", error)
            return false; // スコアボードまたはキーが存在しない
        }
    }


    async delete(key: string | Player): Promise<void> {
        await this.initializationPromise; // 初期化を待つ
        if (!this.objective) {
            return; // objectiveがないなら何もしない
        }
        const keyString = key instanceof Player ? key.name : key;
        try {
            if (this.objective) {
                if (key instanceof Player) {
                    this.objective.removeParticipant(key);
                } else {
                    this.objective.removeParticipant(keyString);
                }
                this.participantsBackup.delete(keyString); // 参加者リストから削除
            }

        } catch (error) {
            console.error("Failed to delete data:", error);
            throw error;
        }
    }

    async getAllKeys(): Promise<string[]> {
        await this.initializationPromise; // 初期化を待つ
        if (!this.objective) {
            return [];  // objectiveがない場合は空配列
        }
        try {
            return Array.from(this.participantsBackup); // バックアップから取得
        } catch (error) {
            console.error("Failed to get all keys:", error);
            throw error;
        }
    }


    async clear(): Promise<void> {
        await this.initializationPromise;
        const keys = await this.getAllKeys(); // バックアップからキーを取得
        for (const key of keys) {
            await this.delete(key); // バックアップされたキーを使用して削除
        }
        this.participantsBackup.clear(); // バックアップをクリア
    }


    static create(objectiveName: string): Database {
        if (!objectiveName.startsWith("ws_")) {
            console.warn("Objective name should start with 'ws_'.");
        }
        return new Database(objectiveName);
    }
}