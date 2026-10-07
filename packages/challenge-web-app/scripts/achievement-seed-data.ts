/**
 * 基础成就的种子数据。
 *
 * 这些成就会由 `scripts/prisma-seed.ts` 在每次容器启动（`prisma migrate deploy` 之后、
 * 应用启动之前）写入，因此**同名成就以本文件为事实来源**：描述、分值、判定脚本、
 * 依赖数据加载器都会被刷新（幂等）。若在管理后台手工改过这些成就，下次部署会被覆盖。
 *
 * ⚠️ 新增/修改成就之后，**历史数据不会被追溯**：观察者是事件驱动的，只在相关写入
 * 发生时判定，所以老用户界面上会显示"所有进度都是 0"。必须再调一次回填接口：
 *
 *   curl -X POST http://<app>/api/admin/recalculate-achievements \
 *        -H "x-webhook-secret: $OPENAPI_WEBHOOK_SECRET"
 *
 * 该接口会遍历「所有用户 × 所有成就」重算一遍（对已达成者短路，幂等）。
 *
 * ## 编写成就时必须知道的约定（都由成就观察者强制）
 *
 * 1. **依赖数据加载器的 SQL 只能 SELECT，且每一列都必须限定表名**，
 *    例如 `judge_records.id` 而不是裸 `id`；聚合函数（`count(*)`）会被拒绝。
 *    需要"计数"时请让加载器返回**行列表**（`isList: true`），在脚本里取 `.length`。
 * 2. **结果列必须别名为 `value`**，加载器只取这一列；空结果的默认值按类型分别是
 *    `0 / false / ''`。
 * 3. 加载器 SQL 里可以用 `__ctx.userId`、`__ctx.continuesCheckinCount` 两个上下文变量
 *    （见 server/trpc/configs/index.ts 的 contextVariables），否则无法按用户区分。
 *    ⚠️ **`__ctx` 必须写进 FROM 子句**（`FROM judge_records, __ctx`）。
 *    观察者的做法是把上下文拼成 CTE 前缀（`WITH __ctx AS (SELECT ...)`），
 *    而 Postgres 里 CTE 的列只有出现在 FROM 中才能引用 —— 只写在 WHERE 里会报
 *    `missing FROM-clause entry for table "__ctx"`。静态校验（node-sql-parser 的
 *    columnList）**不会**发现这个问题，所以两种写法都能存进库，只有跑起来才炸。
 * 4. 校验脚本必须是 `export default defineCheckFunc((props) => ({ achieved, progress }))`
 *    形式，`props` 即依赖数据（`{ [loader.name]: 值或值数组 }`）；**必须 return 分数判定**，
 *    否则观察者会认为未达成。
 * 5. 成就的触发时机取决于它引用了哪张表：加载器选中 `judge_records.x` 会在
 *    `judge_records` 写入时被检查，选中 `user_statistics.x` 则在判题完成后的
 *    统计重算时被检查（见 server/api/webhooks/judge-complete.get.ts）。
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

/**
 * 徽章统一为 96x96 的 SVG：深色圆角底 + 主题色图形。
 * 用 SVG 内联在种子里（而不是放独立文件）是为了让脚本自包含：
 * 无论镜像怎么裁剪文件，徽章都能被写出来。
 */
/**
 * 徽章统一底板：96×96、深色圆角底 + **中性灰描边**。
 *
 * 配色只用 app/assets/css/tailwind.css 的 @theme 令牌，不引入调色板之外的颜色：
 *   accent-600 #272727（底板，与各面板同色）
 *   accent-500 #434343（描边，刻意不用彩色描边 —— 四张徽章排在一起会互相打架）
 *   primary    #fa7c0e（唯一的强调色，靠形状区分不同成就，而不是靠换颜色）
 *   accent-200 #cacaca / accent-300 #9d9d9d（次级线条）
 *   success    #14e87e（只在"达成"符号上小面积用一次）
 *
 * 底板保持"干净"：不要加浅色圆形衬底之类的装饰。
 */
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
