import {
  Player,
  system,
  Vector3,
  EntityQueryOptions,
  world,
  Dimension,
  EntityDamageCause,
  GameMode,
  Entity,
  MolangVariableMap,
} from "@minecraft/server";
import { CustomItem, EventType } from "../../../../utils/CustomItem"; 
import { registerCustomItem } from "../../custom"; 
import { Vector } from "../../../../../../module/Vector"; 

const TURRET_RADIUS = 10;
const TURRET_DURATION = 10; // 秒
const TURRET_INTERVAL = 20; // ティック (1秒 = 20ティック)
const TURRET_DAMAGE = 1;
const TURRET_TAG = "active_turret_stand_pvp";
const MAX_SIMULTANEOUS_TARGETS = 2; // 同時攻撃可能数
const BEAM_PARTICLE_TYPE = "minecraft:endrod"; // ビーム用パーティクル
const BEAM_PARTICLE_STEP = 0.4; // ビームパーティクル間の距離

// --- チームタグ定義 ---
const TEAM_TAGS = ["team1", "team2", "team3", "team4", "team5"];

// --- ヘルパー関数: プレイヤーのチームタグを取得 ---
function getPlayerTeamTag(player: Player): string | undefined {
  if (!player || !player.isValid) return undefined;
  const tags = player.getTags();
  return tags.find(tag => TEAM_TAGS.includes(tag));
}

// --- ビームパーティクル生成関数 (ヘルパー関数使用版) ---
// (変更なし)
function spawnBeamParticles(
  dimension: Dimension,
  start: Vector3,
  end: Vector3,
  particleType: string,
  step: number
): void {
  const direction = Vector.subtract(end, start);
  const length = direction.magnitude();
  if (length < 0.1) return;

  const normalizedDirection = direction.normalized();
  const particleVars = new MolangVariableMap();
  const startVec = Vector.from(start);

  for (let d = 0; d < length; d += step) {
    const particlePosVec = startVec.add(normalizedDirection.multiply(d));
    const finalPos = { x: particlePosVec.x, y: particlePosVec.y + 0.5, z: particlePosVec.z };
    try {
      dimension.spawnParticle(particleType, finalPos, particleVars);
    } catch (e) {
      // console.warn(`[タレット PvP] ビームパーティクルのスポーンに失敗: ${e}`);
    }
  }
}


/**
 * 自動タレットを展開し、近くのプレイヤーを攻撃します。
 * @param player タレットを展開するプレイヤー
 * @param turretItem タレットアイテムのCustomItemインスタンス
 */
function deployTurretAction(player: Player, turretItem: CustomItem) {
  if (!player || !player.isValid) {
    console.warn("[タレット PvP] 無効なプレイヤーによる展開試行。");
    return;
  }

  const deployLocation: Vector3 = player.location;
  const deployDimension: Dimension = player.dimension;
  const deployerName = player.name;
  const deployerId = player.id;
  // --- 設置者のチームタグを取得 ---
  const deployerTeamTag = getPlayerTeamTag(player);
  console.log(`[タレット PvP] 設置者 ${deployerName} のチームタグ: ${deployerTeamTag ?? 'なし'}`); // デバッグ用

  // ワールド境界チェック (変更なし)
  const MIN_WORLD_COORD = -30000000;
  const MAX_WORLD_COORD = 30000000;
  const MIN_Y = -64;
  const MAX_Y = 320;
  if (
    deployLocation.x < MIN_WORLD_COORD ||
    deployLocation.x > MAX_WORLD_COORD ||
    deployLocation.y < MIN_Y ||
    deployLocation.y > MAX_Y ||
    deployLocation.z < MIN_WORLD_COORD ||
    deployLocation.z > MAX_WORLD_COORD
  ) {
    player.sendMessage(
      "§c[警告] ワールド境界付近ではタレットを設置できません！"
    );
    return;
  }

  // --- アイテム削除 --- (変更なし)
  try {
    system.run(() => {
      turretItem.removeItem(player, turretItem.get());
    });
  } catch (e) {
    console.warn(
      `[タレット PvP] ${deployerName} からのタレットアイテム削除に失敗: ${e}`
    );
    player.sendMessage("§c対人タレットアイテムの除去に失敗しました。");
    return;
  }

  // --- タレットエンティティのスポーン --- (変更なし)
  let turretStand: Entity | undefined;
  try {
    system.run(() => {
      const stand = deployDimension.spawnEntity(
        "minecraft:armor_stand",
        deployLocation
      );
      turretStand = stand;
      stand.nameTag = "§c対人タレット";
      stand.addTag(TURRET_TAG);
      // 設置者のチームタグがあれば、タレット自体にも付与しておく (デバッグや将来的な識別に役立つかも)
      if (deployerTeamTag) {
        stand.addTag(deployerTeamTag);
      }
      stand.addEffect("resistance", TURRET_DURATION * 20 + 40, {
        amplifier: 255,
        showParticles: false,
      });

      try {
        stand.runCommand(`replaceitem entity @s slot.armor.head 1 player_head`)
      } catch (e) {
        console.error(`[タレット PvP] タレット ${stand.id} への頭装備設定中にエラー: ${e}`);
      }
    });

  } catch (e) {
    console.warn(
      `[タレット PvP] アーマースタンドのスポーンに失敗 (${JSON.stringify(deployLocation)}): ${e}`
    );
    player.sendMessage("§c対人タレットの設置に失敗しました。");
    deployDimension
      .getEntities({
        type: "minecraft:armor_stand",
        tags: [TURRET_TAG],
        location: deployLocation,
        maxDistance: 1,
      })
      .forEach((e) => e.isValid && e.remove());
    return;
  }

  // runTimeout を使用して、エンティティが完全に初期化されるのを待つ (変更なし)
  system.runTimeout(() => {
    if (!turretStand || !turretStand.isValid) {
      console.warn(
        `[タレット PvP] ${deployerName} のアーマースタンドが有効なエンティティになりませんでした。`
      );
      player.sendMessage("§c対人タレットの設置に失敗しました (内部エラー)。");
      deployDimension
        .getEntities({
          type: "minecraft:armor_stand",
          tags: [TURRET_TAG],
          location: deployLocation,
          maxDistance: 1,
        })
        .forEach((e) => e.isValid && e.remove());
      return;
    }

    const turretEntityId = turretStand.id;
    const initialStandLocation = turretStand.isValid ? turretStand.location : deployLocation;

    // --- 設置エフェクト --- (変更なし)
    deployDimension.spawnParticle(
      "minecraft:item_smoke_emitter",
      initialStandLocation
    );
    deployDimension.spawnParticle(
      "minecraft:critical_hit_emitter",
      initialStandLocation
    );
    deployDimension.playSound("block.piston.extend", initialStandLocation, {
      volume: 0.8,
      pitch: 1.2,
    });

    if (player && player.isValid) {
      player.sendMessage(
        `§c対人タレット§aを設置しました！ (§7${TURRET_DURATION}秒間有効§a)`
      );
    }

    // --- タレットロジック変数 --- (変更なし)
    let ticksPassed = 0;
    const totalTicks = TURRET_DURATION * 20;
    let turretIntervalId: number | undefined = undefined;

    // --- クリーンアップ関数 --- (変更なし)
    const cleanupTurret = () => {
      if (turretIntervalId !== undefined) {
        system.clearRun(turretIntervalId);
        turretIntervalId = undefined;
      }
      // ... (以降のクリーンアップロジックは変更なし) ...
      try {
        const turretEntity = world.getEntity(turretEntityId);

        if (turretEntity && turretEntity.isValid) {
          const currentLocation = turretEntity.location;
          deployDimension.spawnParticle(
            "minecraft:basic_smoke_particle",
            currentLocation
          );
          deployDimension.playSound("block.piston.contract", currentLocation, {
            volume: 0.7,
            pitch: 1.0,
          });
          turretEntity.remove();

          const deployer = world.getEntity(deployerId);
          if (
            deployer &&
            deployer.isValid &&
            deployer instanceof Player &&
            deployer.dimension.id === deployDimension.id
          ) {
            deployer.sendMessage(
              "§e設置した対人タレットの効果が終了しました。"
            );
          }
        } else {
          console.warn(
            `[タレット PvP] タレット ${turretEntityId} は直接クリーンアップ前に既に無効または削除されていました。`
          );
          const fallbacks = deployDimension.getEntities({
            type: "minecraft:armor_stand",
            tags: [TURRET_TAG],
            location: initialStandLocation,
            maxDistance: 2,
          });
          fallbacks.forEach((fallback) => {
            if (fallback.id === turretEntityId && fallback.isValid) {
              const fallbackLocation = fallback.location;
              deployDimension.spawnParticle("minecraft:basic_smoke_particle", fallbackLocation);
              deployDimension.playSound("block.piston.contract", fallbackLocation, { volume: 0.7, pitch: 1.0 });
              fallback.remove();
              console.log(`[タレット PvP] タレット ${turretEntityId} をフォールバックでクリーンアップしました。`);
              const deployer = world.getEntity(deployerId);
              if (deployer && deployer.isValid && deployer instanceof Player && deployer.dimension.id === deployDimension.id) {
                deployer.sendMessage("§e設置した対人タレットの効果が終了しました。");
              }
            } else if (fallback.isValid) {
              console.warn(`[タレット PvP] フォールバックで見つかった孤立した可能性のあるタレット ${fallback.id} をクリーンアップします。`);
              fallback.remove();
            }
          });
        }
      } catch (e) {
        console.error(
          `[タレット PvP] ID ${turretEntityId} のタレットクリーンアップ中にエラー: ${e}`
        );
      }
    };


    // --- タレット動作インターバル ---
    turretIntervalId = system.runInterval(() => {
      let currentTurretStand: Entity | undefined;
      try {
        currentTurretStand = world.getEntity(turretEntityId);

        if (!currentTurretStand || !currentTurretStand.isValid) {
          console.warn(
            `[タレット PvP] タレットスタンド ${turretEntityId} が無効または見つかりません。クリーンアップを開始します。`
          );
          cleanupTurret();
          return;
        }

        const currentStandLocation = currentTurretStand.location;

        if (ticksPassed >= totalTicks) {
          cleanupTurret();
          return;
        }

        // 設置者の有効性チェック (名前ではなくIDでチェックする方が確実)
        const deployerEntity = world.getEntity(deployerId);
        const isDeployerValid = !!(deployerEntity && deployerEntity.isValid && deployerEntity instanceof Player);

        // --- ターゲット検索 ---
        // 除外するタグリストを作成
        const excludeTagsList = [TURRET_TAG];
        if (deployerTeamTag) {
          excludeTagsList.push(deployerTeamTag); // 設置者のチームタグを除外リストに追加
        }

        const queryOptions: EntityQueryOptions = {
          location: currentStandLocation,
          maxDistance: TURRET_RADIUS,
          type: "minecraft:player",
          excludeGameModes: [GameMode.spectator, GameMode.creative],
          excludeTags: excludeTagsList, // 更新された除外タグリストを使用
          // 設置者自身も除外 (名前での除外は同名プレイヤーがいる場合に問題になる可能性があるため、
          // IDベースでのチェックも考慮するが、getEntitiesではID除外は直接できない。
          // excludeNamesはそのまま使うか、取得後にIDでフィルタリングする。)
          // 現状はexcludeNamesで問題ない場合が多い。
          excludeNames: isDeployerValid && deployerEntity ? [deployerEntity.name] : [],
        };

        const nearbyTargets = deployDimension.getEntities(queryOptions);
        let shotFired = false;
        let targetsAttackedThisTick = 0;

        for (const targetEntity of nearbyTargets) {
          // ここで再度ターゲットが設置者自身でないかIDで確認することも可能 (より堅牢)
          // if (targetEntity.id === deployerId) continue; // 必要であれば追加

          if (
            targetsAttackedThisTick < MAX_SIMULTANEOUS_TARGETS &&
            targetEntity &&
            targetEntity.isValid &&
            targetEntity instanceof Player
            // チームタグのチェックは getEntities の excludeTags で行われたので不要
          ) {
            const targetPlayer: Player = targetEntity;
            const targetLocation = targetPlayer.location;

            // --- ターゲットの方向を向く --- (変更なし)
            try {
              if (Vector.distance(currentStandLocation, targetLocation) > 0.1) {
                currentTurretStand.lookAt(targetLocation);
              }
            } catch (e) {
              console.warn(`[タレット PvP] タレット ${turretEntityId} がターゲット方向を向けませんでした: ${e}`);
            }

            // --- ビームエフェクト生成 --- (変更なし)
            const beamStartPos = { ...currentStandLocation, y: currentStandLocation.y + 0.5 };
            spawnBeamParticles(
              deployDimension,
              beamStartPos,
              targetLocation,
              BEAM_PARTICLE_TYPE,
              BEAM_PARTICLE_STEP
            );

            // ダメージを与えるエンティティを決定 (変更なし)
            let damagingEntity: Entity | undefined = undefined;
            if (isDeployerValid && deployerEntity) {
              damagingEntity = deployerEntity;
            } else {
              damagingEntity = currentTurretStand;
            }

            // ダメージ適用 (変更なし)
            if (damagingEntity && damagingEntity.isValid) {
              try {
                targetPlayer.applyDamage(TURRET_DAMAGE, {
                  damagingEntity: damagingEntity,
                  cause: EntityDamageCause.entityAttack,
                });
              } catch (damageError) {
                console.warn(`[タレット PvP] ${targetPlayer.name} へのダメージ適用中にエラー: ${damageError}`);
                // ダメージ適用失敗時の代替処理 (例: エフェクトのみ表示)
                deployDimension.spawnParticle("minecraft:critical_hit_emitter", targetLocation);
              }
            } else {
              try {
                targetPlayer.applyDamage(TURRET_DAMAGE, {
                  cause: EntityDamageCause.magic, // 代替原因
                });
              } catch (damageError) {
                console.warn(`[タレット PvP] ${targetPlayer.name} への代替ダメージ適用中にエラー: ${damageError}`);
              }
              console.warn(
                `[タレット PvP] タレット ${turretEntityId} が ${targetPlayer.name} を有効なダメージソースなしで攻撃しました。`
              );
            }


            // --- 攻撃エフェクト (ターゲット位置) --- (変更なし)
            // ダメージ適用が成功した場合のみエフェクトを出すように変更も可能
            deployDimension.spawnParticle(
              "minecraft:critical_hit_emitter",
              targetLocation
            );
            deployDimension.playSound("game.player.hurt", targetLocation, {
              volume: 0.6,
              pitch: 1.0,
            });

            shotFired = true;
            targetsAttackedThisTick++;
          }
        } // ターゲットループ終了

        // --- 発射音 (タレット位置) --- (変更なし)
        if (shotFired) {
          deployDimension.playSound("mob.guardian.attack", currentStandLocation, {
            volume: 0.4,
            pitch: 1.8,
          });
        }
      } catch (error: any) {
        console.error(
          `[タレット PvP] ID ${currentTurretStand?.id ?? turretEntityId
          } のタレットインターバルでエラー: ${error.message ?? error}`
        );
        if (error.stack) {
          console.error("スタックトレース:", error.stack);
        }
        cleanupTurret();
        const deployer = world.getEntity(deployerId);
        if (deployer && deployer.isValid && deployer instanceof Player) {
          deployer.sendMessage(
            "§c対人タレットの動作中にエラーが発生し、停止しました。"
          );
        }
      }

      ticksPassed += TURRET_INTERVAL;
    }, TURRET_INTERVAL);
  });
}

// --- カスタムアイテム定義 --- (変更なし)
const pvpTurretItem = new CustomItem({
  name: "§c対人設置型タレット",
  lore: [
    "§7使用すると設置され、",
    `§7周囲 ${TURRET_RADIUS}m 以内の§c敵プレイヤー§7を`, // 説明文を修正
    `§7${TURRET_DURATION}秒間、自動で攻撃する。`,
    `§7(§c設置者§7、§c同じチーム§7、§cｸﾘｴｲﾃｨﾌﾞ§7、§cｽﾍﾟｸﾃｲﾀｰ§7を除く)`, // 説明文を修正
    `§7ダメージ: §c${TURRET_DAMAGE}`,
    `§7同時攻撃数: §c${MAX_SIMULTANEOUS_TARGETS}`,
  ],
  placeableOn: ["minecraft:allow"],
  item: "minecraft:observer",
  amount: 1,
});

// --- イベント処理 --- (変更なし)
pvpTurretItem.then((player: Player, eventData: any) => {
  const user = eventData?.source instanceof Player ? eventData.source : player;
  if (eventData.eventType === EventType.ItemUse && user && user.isValid) {
    deployTurretAction(user, pvpTurretItem);
  }
});

// --- 登録 --- (変更なし)
try {
  registerCustomItem(18, pvpTurretItem);
  // console.log("[タレット PvP] カスタムアイテム 'pvpTurretItem' をID 18で登録しました。");
} catch (e) {
  console.error(`[タレット PvP] ID 18でのカスタムアイテム登録に失敗: ${e}`);
}