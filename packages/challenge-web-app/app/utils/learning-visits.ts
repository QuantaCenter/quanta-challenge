/**
 * 「最近学习」访问记录的纯规则，按 cuid 记录。
 */
export interface VisitRecord {
   /** 服务端主键 */
   cuid: string;
   /** 'YYYY-MM-DD HH:mm'，可按字典序倒排 */
   at: string;
}

/** 'YYYY-MM-DD HH:mm' 本地时间 */
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
 * 做题记录，键是题号 baseId。
 *
 * 只判断"提交过"，不判断满分。
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

/** 完成的不可逆标记，键是 cuid，值是达成时间 */
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
