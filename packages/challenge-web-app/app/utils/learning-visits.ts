/**
 * 「最近学习」访问记录的纯规则。
 *
 * 与 composable 分开的理由：composable 里要 `useState`（依赖 Nuxt 运行时，
 * 单测跑不起来），而这些排序 / 覆盖规则是纯粹的数据变换，应当能直接测。
 *
 * 背景（真实 bug）：访问记录以前是写死的常量、id 按「第 n 篇 = 100 + n」编；
 * 文章改成服务端内容后 id 是 cuid 的哈希，一条都匹配不上，
 * 「最近学习」永远是空的。现在按 **cuid**（服务端主键）记录。
 */
export interface VisitRecord {
   /** 服务端主键 */
   cuid: string;
   /** 'YYYY-MM-DD HH:mm'：可按字典序倒排，且不受时区影响 */
   at: string;
}

/** 'YYYY-MM-DD HH:mm'（本地时间；字典序即时间序） */
export const visitStamp = (date = new Date()) => {
   const pad = (value: number) => String(value).padStart(2, '0');
   return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
   );
};

/** 记一笔访问：同 cuid 覆盖时间，不新增条目 */
export const upsertVisit = (
   map: Record<string, VisitRecord>,
   cuid: string,
   at: string,
): Record<string, VisitRecord> => ({ ...map, [cuid]: { cuid, at } });

/** 按最后打开时间倒序取 cuid */
export const sortVisitCuids = (map: Record<string, VisitRecord>): string[] =>
   Object.values(map)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((item) => item.cuid);

/**
 * 做题记录（"我做过这道题"）。
 *
 * 键是**题号 baseId**（正文引用用的就是它），值是最后一次提交的时间。
 * 之所以要单独记：以前这里写死 `COMPLETED_BASE_IDS = {7}`（假装"主题切换做过了"），
 * 结果是所有人的进度都一样；现在按真实提交记录累计。
 *
 * 说明：这里只判断"提交过"，不判断满分——学习场景下把它当成"做过"更符合预期，
 * 而且判题结果的极性（满分/部分分）本来就该由题目卡片上的分值说明。
 */
export const upsertSolved = (
   map: Record<string, string>,
   baseId: number,
   at: string,
): Record<string, string> => ({ ...map, [String(baseId)]: at });

export const hasSolved = (
   map: Record<string, string>,
   baseId: number,
): boolean => Boolean(map[String(baseId)]);

/**
 * 「已完成」的**不可逆**标记。
 *
 * 产品口径：一旦某个专题 / 文章的完成状态达成，它就**永远**是完成——哪怕之后
 * 题目更新了版本、新增了题目、分母变大了。进度条与完成状态都按这条来，
 * 否则"完成过的内容退回去"会让用户觉得自己的努力被抹掉了。
 *
 * 键是 cuid（专题 / 文章的服务端主键），值是达成完成的时间。
 */
export const markDoneOnce = (
   map: Record<string, string>,
   cuid: string,
   at: string,
): Record<string, string> =>
   map[cuid] ? map : { ...map, [cuid]: at };

export const isDoneForever = (
   map: Record<string, string>,
   cuid: string | undefined,
): boolean => Boolean(cuid && map[cuid]);
