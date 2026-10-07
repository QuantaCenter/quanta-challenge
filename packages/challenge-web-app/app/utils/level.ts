/**
 * 通过分数获取成就等级
 * 成就等级计算公式：level = floor(sqrt(score / 50)) + 1
 * 其中 score 是成就分数，50 是每个等级的基准分数
 * @param score 成就分数
 * @returns 成就等级
 */
export function getLevel(score: number): number {
   if (score < 0) {
      return 1;
   }
   return Math.floor(Math.sqrt(score / 50)) + 1;
}

/**
 * 通过成就等级获取对应的分数
 * 成就等级计算公式：score = 50 * (level - 1) ^ 2
 * @param level 成就等级
 * @returns 成就分数
 */
export function getLevelScore(level: number): number {
   return Math.floor(50 * (level - 1) ** 2);
}

/**
 * 根据成就分数计算等级与当前等级的经验进度。
 *
 * 注意：`expInCurrentLevel` 是「在当前等级内已积累的经验值」
 * （= 总分 - 当前等级门槛分），而不是等级门槛分本身；`expToNextLevel`
 * 是「升到下一级所需的经验跨度」（= 下一级门槛分 - 当前等级门槛分），
 * 两者相除即当前等级内的进度（0 ~ 1）。
 * @param score 成就分数
 */
export function getLevelProgress(score: number): {
   level: number;
   expInCurrentLevel: number;
   expToNextLevel: number;
   expProgress: number;
} {
   const level = getLevel(score);
   const currentLevelScore = getLevelScore(level);
   const nextLevelScore = getLevelScore(level + 1);
   const expInCurrentLevel = Math.max(0, score - currentLevelScore);
   const expToNextLevel = nextLevelScore - currentLevelScore;
   const expProgress =
      expToNextLevel > 0 ? expInCurrentLevel / expToNextLevel : 0;

   return { level, expInCurrentLevel, expToNextLevel, expProgress };
}
