/**
 * 基础成就的种子数据，由 prisma-seed.ts 每次启动幂等写入（同名成就以本文件为准，手工修改会被覆盖）。
 * 新增/修改成就后历史数据不追溯，需再调 POST /api/admin/recalculate-achievements 回填（幂等）。
 * 约定：加载器 SQL 只能 SELECT 且列须限定表名，结果列别名为 value，__ctx 必须写进 FROM 子句；
 * 判定脚本须 defineCheckForm 且必须 return 分数判定；触发时机取决于加载器引用了哪张表。
 */

export interface IAchievementLoaderSeed {
   /** 注入到判定脚本里的名字，脚本里用 props[<name>] 取值 */
   name: string;
   description: string;
   type: 'NUMERIC' | 'BOOLEAN' | 'TEXT';
   isList: boolean;
   sql: string;
}

export interface IAchievementSeed {
   name: string;
   description: string;
   score: number;
   /** 徽章文件名（同时写入 local_store 与 images.name） */
   badgeFileName: string;
   badgeSvg: string;
   loaders: IAchievementLoaderSeed[];
   script: string;
   isCheckinAchievement?: boolean;
}

/** 徽章统一底板：96×96 SVG（内联使脚本自包含）、深色圆角底 + 中性灰描边；配色只用 @theme 令牌，primary #fa7c0e 为唯一强调色，靠形状而非颜色区分成就。 */
const badge = (glyph: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img">
  <rect x="2" y="2" width="92" height="92" rx="24" fill="#272727" stroke="#434343" stroke-width="2"/>
  ${glyph}
</svg>
`;

/** 首次提交：向上的箭头 + 基线 */
const BADGE_FIRST_SUBMISSION = badge(
   `<path d="M48 30 L60 44 H52 V58 H44 V44 H36 Z" fill="#fa7c0e" opacity="0.9"/>
   <rect x="34" y="64" width="28" height="4" rx="2" fill="#9d9d9d" opacity="0.6"/>`
);

/** 首战告捷：五角星 */
const BADGE_FIRST_SUCCESS = badge(
   `<path d="M48 28 L55 42 L70.5 44.2 L59.2 55.1 L61.9 70.5 L48 63.2 L34.1 70.5 L36.8 55.1 L25.5 44.2 L41 42 Z" fill="#fa7c0e" opacity="0.9"/>`
);

/** 小有所成：递增的三根柱（用透明度递进表达"累计"，不额外引入颜色） */
const BADGE_RISING_STAR = badge(
   `<rect x="28" y="56" width="11" height="18" rx="3" fill="#fa7c0e" opacity="0.4"/>
   <rect x="42.5" y="46" width="11" height="28" rx="3" fill="#fa7c0e" opacity="0.65"/>
   <rect x="57" y="34" width="11" height="40" rx="3" fill="#fa7c0e" opacity="0.9"/>`
);

/** 签到三日：日历 + 勾（勾是唯一的 success 色，面积很小） */
const BADGE_CHECKIN_THREE = badge(
   `<rect x="28" y="32" width="40" height="36" rx="7" fill="none" stroke="#cacaca" stroke-width="2.5" opacity="0.85"/>
   <path d="M28 43 H68" stroke="#cacaca" stroke-width="2.5" opacity="0.85"/>
   <path d="M38 26 V35 M58 26 V35" stroke="#9d9d9d" stroke-width="2.5" stroke-linecap="round"/>
   <path d="M39 53 L46 60 L59 47" fill="none" stroke="#14e87e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
);

/** 判定脚本模板：统一成发布页模板的写法 */
const checkScript = (body: string) =>
   `export default defineCheckFunc((props) => {\n${body}\n});\n`;

/** 复用：某个用户产生过的判题记录（用于"提交过/通过过"这类成就） */
const loaderSubmissionIds: IAchievementLoaderSeed = {
   name: 'submissionIds',
   description: '该用户产生过的全部判题记录 ID',
   type: 'NUMERIC',
   isList: true,
   sql: 'SELECT judge_records.id AS value FROM judge_records, __ctx WHERE judge_records."userId" = __ctx.userId',
};

/** 复用：某个用户**判题通过**的记录 ID */
const loaderSuccessfulSubmissionIds: IAchievementLoaderSeed = {
   name: 'successfulSubmissionIds',
   description: '该用户判题结果为 success 的判题记录 ID',
   type: 'NUMERIC',
   isList: true,
   sql: 'SELECT judge_records.id AS value FROM judge_records, __ctx WHERE judge_records."userId" = __ctx.userId AND judge_records.result = \'success\'',
};

/** 签到天数 */
const loaderCheckinIds: IAchievementLoaderSeed = {
   name: 'checkinIds',
   description: '该用户的签到记录 ID（一天一条）',
   type: 'NUMERIC',
   isList: true,
   sql: 'SELECT daily_checkins.id AS value FROM daily_checkins, __ctx WHERE daily_checkins."userId" = __ctx.userId',
};

export const DEFAULT_ACHIEVEMENTS: IAchievementSeed[] = [
   {
      name: '初次提交',
      description: '完成第一次代码提交。',
      score: 20,
      badgeFileName: 'seed-achievement-first-submission-v3.svg',
      badgeSvg: BADGE_FIRST_SUBMISSION,
      loaders: [loaderSubmissionIds],
      script: checkScript(
         `   const count = props.submissionIds?.length ?? 0;\n   return { achieved: count >= 1, progress: Math.min(count, 1) };`
      ),
   },
   {
      name: '首战告捷',
      description: '第一次判题通过。',
      score: 50,
      badgeFileName: 'seed-achievement-first-success-v3.svg',
      badgeSvg: BADGE_FIRST_SUCCESS,
      loaders: [loaderSuccessfulSubmissionIds],
      script: checkScript(
         `   const count = props.successfulSubmissionIds?.length ?? 0;\n   return { achieved: count >= 1, progress: Math.min(count, 1) };`
      ),
   },
   {
      name: '小有所成',
      description: '累计通过三道题目。',
      score: 80,
      badgeFileName: 'seed-achievement-rising-star-v3.svg',
      badgeSvg: BADGE_RISING_STAR,
      loaders: [loaderSuccessfulSubmissionIds],
      script: checkScript(
         `   const count = props.successfulSubmissionIds?.length ?? 0;\n   return { achieved: count >= 3, progress: Math.min(count / 3, 1) };`
      ),
   },
   {
      name: '签到三日',
      description: '累计签到三天。',
      score: 30,
      badgeFileName: 'seed-achievement-checkin-three-v3.svg',
      badgeSvg: BADGE_CHECKIN_THREE,
      loaders: [loaderCheckinIds],
      script: checkScript(
         `   const days = props.checkinIds?.length ?? 0;\n   return { achieved: days >= 3, progress: Math.min(days / 3, 1) };`
      ),
      isCheckinAchievement: true,
   },
];
