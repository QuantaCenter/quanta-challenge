import prisma from '@challenge/database';
import { TRPCError } from '@trpc/server';
import pkg from 'node-sql-parser';
import { ValidPath } from '~~/lib/track-wrapper';
import { LRUMap } from '../../../utils/lru-map';
import { EventEmitter } from '../../../../app/utils/event-emitter';
import { VM } from 'vm2';
import { logger } from '~~/lib/logger';

const { Parser } = pkg;

export interface IObservable<T> {
   subscribe: (
      callback: (
         path: { path: string; method: string }[],
      ) => Promise<void> | void,
   ) => T;
}

export type AchivementObserverEvent = {
   dirty: [path: string];
   rebuild: [];
   check: [
      achievementId: number,
      result: {
         achieved: boolean;
         progress: number;
         score: number;
      },
      userId?: string,
      injectVars?: Record<string, any>,
   ];
   query: [
      id: string,
      sql: string,
      hitCache: boolean,
      injectVars?: Record<string, any>,
   ];
   error: [error: Error];
};

export type AchievementVarsInjector = () =>
   | Record<string, any>
   | Promise<Record<string, any>>;

export class AchievementObserver {
   constructor(
      private _useUserId: () => Promise<string | null> | string | null,
      private _maxCacheSize = process.env.ACHIEVEMENT_OBSERVER_MAX_CACHE_SIZE
         ? parseInt(process.env.ACHIEVEMENT_OBSERVER_MAX_CACHE_SIZE)
         : 1000,
      private _pathToQueries = new LRUMap<string, Set<string>>(
         this._maxCacheSize,
      ),
      private _dirtyQueries = new Set<string>(),
      private _queryCache = new LRUMap<string, any>(this._maxCacheSize),
      private _parser = new Parser(),
      // field path -> loader id -> achievement ids
      private _depTree = new Map<string, Map<number, Set<number>>>(),
      private _emitter = new EventEmitter<AchivementObserverEvent>(),
      private _injectors = new Set<AchievementVarsInjector>(),
   ) {
      this.rebuildDepTree();
   }

   private async _executeQuery(sql: string) {
      return await prisma.$queryRawUnsafe(sql);
   }

   useVarsInjector(injector: AchievementVarsInjector) {
      this._injectors.add(injector);
      return () => this._injectors.delete(injector);
   }

   addListener<Event extends keyof AchivementObserverEvent>(
      event: Event,
      listener: (...args: AchivementObserverEvent[Event]) => void,
   ) {
      return this._emitter.on(event, listener);
   }

   removeListener<Event extends keyof AchivementObserverEvent>(
      event: Event,
      listener: (...args: AchivementObserverEvent[Event]) => void,
   ) {
      return this._emitter.off(event, listener);
   }

   private _affectedAchIds: Set<number> = new Set();
   private _injectVarsMap: Map<number, Record<string, any>> = new Map();

   private async _checkAchievement(
      achievementId: number,
      injectVars?: Record<string, any>,
   ) {
      // 优先采用调用方显式传入的 userId。
      //
      // 判题完成这类**非用户请求**路径（Nitro webhook，没有 tRPC 中间件建立的
      // requestContext）里 `_useUserId()` 拿不到人，调用方会用
      // `manualMarkDirty(paths, { userId })` 把用户带进来。若这里不采用它：
      //   1) 加载器的 `__ctx.userId` 注入不到值，SQL 直接报
      //      `missing FROM-clause entry for table "__ctx"`；
      //   2) 发分监听器收到 userId 为空会立刻 return，成就永远不会落库。
      const userId = injectVars?.userId ?? (await this._useUserId());
      if (this._affectedAchIds.size === 0) {
         const flushJob = () => {
            const affectedAchIds = Array.from(this._affectedAchIds);
            const injectVarsMap = new Map(this._injectVarsMap);

            this._injectVarsMap.clear();
            this._affectedAchIds.clear();

            affectedAchIds.forEach((achId) => {
               this.triggerCheckAchievement(
                  achId,
                  userId ?? undefined,
                  injectVarsMap.get(achId),
               ).catch((err) => {
                  this._emitter.emit('error', err);
               });
            });
         };
         queueMicrotask(flushJob);
      }
      this._affectedAchIds.add(achievementId);
      if (injectVars) {
         const existingVars = this._injectVarsMap.get(achievementId) ?? {};
         this._injectVarsMap.set(achievementId, {
            ...existingVars,
            ...injectVars,
         });
      }
   }

   async observe<T>(target: IObservable<T>) {
      return target.subscribe(async (paths) => {
         for (const { path, method } of paths) {
            const pathToCheck = /^(create|delete).*/.test(method)
               ? path.split('.')[0]
               : path;

            const loaderMap = this._depTree.get(pathToCheck);
            if (loaderMap) {
               loaderMap.forEach((achIds) => {
                  achIds.forEach((achId) => {
                     this._checkAchievement(achId);
                  });
               });
            }

            this._markDirtyByPath(pathToCheck as ValidPath);
         }
      });
   }

   manualMarkDirty(
      path: ValidPath | ValidPath[],
      injectVars?: Record<string, any>,
   ) {
      const paths = Array.isArray(path) ? path : [path];
      paths.forEach((path) => {
         this._markDirtyByPath(path);

         const loaderMap = this._depTree.get(path);
         if (loaderMap) {
            loaderMap.forEach((achIds) => {
               achIds.forEach((achId) => {
                  this._checkAchievement(achId, injectVars);
               });
            });
         }
      });
   }

   private _markDirtyByPath(path: ValidPath) {
      const queries = this._pathToQueries.get(path);
      if (queries) {
         queries.forEach((q) => this._dirtyQueries.add(q));
      }
      this._emitter.emit('dirty', path);
   }

   private _matchedUsedContextVars(sql: string) {
      const pattern = /__ctx\.([a-zA-Z_]\w*)/g;
      const result = sql.matchAll(pattern);
      return Array.from(result).map((m) => m[1]);
   }

   private _injectCtxIntoSql(context: string, sql: string) {
      if (!context || context === '') return sql;

      const ctxCte = `__ctx AS (${context.trim()})`;

      const original = sql.trim();

      if (/^\s*WITH\s+RECURSIVE\b/i.test(original)) {
         const rest = original.replace(/^\s*WITH\s+RECURSIVE\b/i, '').trim();
         return `WITH RECURSIVE ${ctxCte}, ${rest}`;
      }

      if (/^\s*WITH\b/i.test(original)) {
         const rest = original.replace(/^\s*WITH\b/i, '').trim();
         return `WITH ${ctxCte}, ${rest}`;
      }

      return `WITH ${ctxCte}\n${original}`;
   }

   async runQuery(id: string, sql: string, injectVars?: Record<string, any>) {
      let queryId: string | null = id;
      let context = '';

      const injectPromises = Array.from(this._injectors).map(
         async (injector) => {
            const vars = await injector();
            injectVars ??= {};
            if (vars && typeof vars === 'object') {
               // 只合并**有值**的键。
               //
               // 注入器在无请求上下文时会返回 `{ userId: undefined, ... }`，
               // 直接 `Object.assign` 会把调用方显式传入的 userId 覆盖掉，
               // 于是 `__ctx.userId` 又变回缺失 —— 判题完成路径就是这么被绕过去的。
               for (const [key, value] of Object.entries(vars)) {
                  if (value !== undefined) injectVars[key] = value;
               }
            }
         },
      );
      await Promise.all(injectPromises);

      if (injectVars) {
         const matchedVars = this._matchedUsedContextVars(sql).filter(
            (v) => v in injectVars!,
         );
         if (matchedVars.length > 0) {
            queryId = null;
         }

         const entries = Object.entries(injectVars);
         if (entries.length > 0) {
            context = `SELECT ${Object.entries(injectVars)
               .filter(([, v]) => {
                  return ['string', 'number', 'boolean'].includes(typeof v);
               })
               .map(([k, v]) => {
                  v = typeof v === 'string' ? `'${v}'` : v;
                  return `${v} AS ${k}`;
               })
               .join(', ')}`;
         }
      }

      const columnList = this._parser.columnList(sql);
      const columnListSegments = columnList.map((col) => col.split('::'));

      if (columnListSegments.some(([o, t]) => o !== 'select' || t === 'null')) {
         const err = new TRPCError({
            code: 'BAD_REQUEST',
            message:
               'SQL 语句中只能包含 SELECT 操作，且列引用必须限定表名或表别名',
         });
         this._emitter.emit('error', err);
         throw err;
      }

      if (queryId) {
         columnListSegments.forEach(([, table, field]) => {
            const tableSet =
               this._pathToQueries.get(table) ??
               this._pathToQueries.set(table, new Set()).get(table)!;
            tableSet.add(queryId);

            const path = `${table}.${field}`;
            const queries =
               this._pathToQueries.get(path) ??
               this._pathToQueries.set(path, new Set()).get(path)!;
            queries.add(queryId);
         });
      }

      let result: any;
      const hitCache =
         !!queryId &&
         !this._dirtyQueries.has(queryId) &&
         this._queryCache.has(queryId);

      if (hitCache) {
         result = this._queryCache.get(queryId!);
      } else {
         const sqlWithCtx = this._injectCtxIntoSql(context, sql);
         // 直接使用 $queryRawUnsafe 返回的行对象。
         //
         // 历史注意：6c8abd5 曾把这里改成 `temp.map((item) => item.__data)`，但
         // _executeQuery 就是原生 prisma.$queryRawUnsafe（@challenge/database 导出的
         // 是 PrismaClient，全仓库没有任何地方产生 __data 字段），于是每个查询结果都
         // 变成 [undefined]，成就依赖数据全线失效。这里恢复「原样返回行」的契约。
         result = await this._executeQuery(sqlWithCtx);
         if (queryId) {
            this._queryCache.set(queryId, result);
            this._dirtyQueries.delete(queryId);
         }
      }
      this._emitter.emit('query', id, sql, hitCache, injectVars);
      return result as any[];
   }

   async rebuildDepTree() {
      const achievements = await prisma.achievement.findMany({
         select: {
            id: true,
            AchievementDependencyData: {
               select: {
                  achievementDepDataLoader: {
                     select: {
                        id: true,
                        sql: true,
                     },
                  },
               },
            },
         },
      });
      this._depTree.clear();

      achievements.forEach((ach) => {
         ach.AchievementDependencyData.forEach((dep) => {
            const loader = dep.achievementDepDataLoader;
            const columnList = this._parser.columnList(loader.sql);
            const columnListSegments = columnList.map((col) => col.split('::'));

            const invalid = columnListSegments.some(([o, t]) => {
               return o !== 'select' || t === 'null';
            });
            if (invalid) {
               const err = new TRPCError({
                  code: 'BAD_REQUEST',
                  message: `成就依赖的数据加载器（ID: ${loader.id}）的 SQL 语句中只能包含 SELECT 操作，且列引用必须限定表名或表别名`,
               });
               this._emitter.emit('error', err);
               throw err;
            }

            columnListSegments.forEach(([, table, field]) => {
               const path = `${table}.${field}`;

               // Add to full path (table.field)
               const loaderMapFullPath =
                  this._depTree.get(path) ??
                  this._depTree.set(path, new Map()).get(path)!;
               const achIdsFullPath =
                  loaderMapFullPath.get(loader.id) ??
                  loaderMapFullPath.set(loader.id, new Set()).get(loader.id)!;
               achIdsFullPath.add(ach.id);

               // Add to table only
               const loaderMapTable =
                  this._depTree.get(table) ??
                  this._depTree.set(table, new Map()).get(table)!;
               const achIdsTable =
                  loaderMapTable.get(loader.id) ??
                  loaderMapTable.set(loader.id, new Set()).get(loader.id)!;
               achIdsTable.add(ach.id);
            });
         });
      });

      logger.info(Object.fromEntries(this._depTree), 'Rebuild dep tree');

      this._emitter.emit('rebuild');
   }

   async triggerCheckAchievement(
      achievementId: number,
      userId?: string,
      injectVars?: Record<string, any>,
   ) {
      if (userId) {
         const userAchievement = await prisma.userAchievement.findUnique({
            where: {
               userId_achievementId: {
                  userId,
                  achievementId: achievementId,
               },
            },
         });
         if (userAchievement && userAchievement.progress >= 1) {
            // 已达成的成就不再重复检测
            return false;
         }

         // 当成就未开始或进度为0时，检查前置成就是否达成
         if (!userAchievement || userAchievement.progress === 0) {
            const preAchievements =
               await prisma.achievementPreAchievement.findMany({
                  where: { achievementId },
                  select: {
                     preAchievement: {
                        select: {
                           UserAchievement: {
                              where: { userId },
                              select: { progress: true },
                           },
                        },
                     },
                  },
               });

            for (const preAch of preAchievements) {
               const ua = preAch.preAchievement.UserAchievement[0];
               if (!ua || ua.progress < 1) {
                  // 前置成就未达成，跳过检测
                  return false;
               }
            }
         }
      }

      const achievement = await prisma.achievement.findUnique({
         where: { id: achievementId },
         select: {
            AchievementValidateScript: {
               select: {
                  script: true,
               },
            },
            AchievementDependencyData: {
               select: {
                  achievementDepDataLoader: {
                     select: {
                        id: true,
                        name: true,
                        type: true,
                        sql: true,
                        isList: true,
                     },
                  },
               },
            },
            score: true,
         },
      });

      const script = achievement?.AchievementValidateScript?.script;
      const loaders =
         achievement?.AchievementDependencyData.map(
            (d) => d.achievementDepDataLoader,
         ) ?? [];

      if (!script) {
         const err = new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `成就（ID: ${achievementId}）的达成检测脚本未设置`,
         });
         this._emitter.emit('error', err);
         throw err;
      }

      const depDataPromises = loaders.map(async (loader) => {
         const result = await this.runQuery(
            `loader_${loader.id}`,
            loader.sql,
            injectVars,
         );

         /**
          * 依赖数据加载器的 SQL 约定：结果列必须别名为 `value`，且每个加载器只取这一列
          * （既有加载器、发布页模板与本文件的全部测试都遵循该约定）。
          *
          * 空结果的默认值同样是契约的一部分：
          *   NUMERIC -> 0，BOOLEAN -> false，TEXT -> ''
          *
          * 注意不能把整行对象直接交给类型转换函数：Number({ value: 15 }) 是 NaN，
          * 这正是 6c8abd5 重构后所有成就判定读到 NaN / undefined、进度恒为 0 的原因。
          */
         const normalize = (raw: unknown) => {
            switch (loader.type) {
               case 'NUMERIC':
                  return Number(raw ?? 0);
               case 'BOOLEAN':
                  return Boolean(raw ?? false);
               case 'TEXT':
                  return String(raw ?? '');
               default:
                  return raw;
            }
         };

         const pickValue = (row: any) =>
            row && typeof row === 'object' ? row.value : row;

         const values = result.map((row) => normalize(pickValue(row)));
         const transformedResult = loader.isList
            ? values
            : (values[0] ?? normalize(undefined));

         return {
            name: loader.name,
            data: transformedResult as number | boolean | string,
         };
      });
      const depData = await Promise.all(depDataPromises);
      const depDataMap = depData.reduce(
         (acc, cur) => {
            acc[cur.name] = cur.data;
            return acc;
         },
         {} as Record<string, number | boolean | string>,
      );

      const defineCheckFunc = (fn: Function) => fn;
      const scriptBody = script.replace(
         /^(?:.*\n)*?\s*export\s+default\s+/,
         ''
      );
      const checkScript = `const check = ${scriptBody}; check(depData);`;
      try {
         const vm = new VM({
            timeout: 1000,
            sandbox: { depData: depDataMap, defineCheckFunc },
            allowAsync: false,
            eval: false,
            wasm: false,
         });
         const returned = vm.run(checkScript);
         const result: {
            achieved: boolean;
            progress: number;
            score: number;
         } = returned
            ? {
                 achieved: Boolean(returned.achieved),
                 progress: Number(returned.progress) || 0,
                 score: Number(achievement.score || 0),
              }
            : {
                 achieved: false,
                 progress: 0,
                 score: Number(achievement.score || 0),
              };

         logger.info(
            { achievementId, result, userId, injectVars },
            'Achievement update',
         );
         this._emitter.emit('check', achievementId, result, userId, injectVars);
         return result;
      } catch (error) {
         const err =
            error instanceof TRPCError
               ? error
               : new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message:
                       '成就判定条件脚本执行失败: ' + (error as Error).message,
                 });
         this._emitter.emit('error', err);
         throw err;
      }
   }
}
