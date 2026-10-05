import {
   nestedModelMapping,
   schemaToRealMap,
   validRealNameFields,
   validRealNames,
} from '@challenge/database';

export type ValidPath =
   | (typeof validRealNames)[number]
   | (typeof validRealNameFields)[number];

export type ValidMethod =
   | 'create'
   | 'update'
   | 'delete'
   | 'upsert'
   | 'createMany'
   | 'deleteMany'
   | 'updateMany';

export type AffectedPath = { path: ValidPath; method: ValidMethod };

export class TrackWrapper {
   constructor(
      private _effectOperationRegex = [
         /^create.*/,
         /^update.*/,
         /^delete.*/,
         /^upsert.*/,
      ],
      private _operations = new Set([
         'create',
         'createMany',
         'delete',
         'deleteMany',
         'update',
         'updateMany',
         'upsert',
      ]),
      private _skipFields = new Set([
         'data',
         'where',
         'connect',
         'connectOrCreate',
         'disconnect',
      ]),
      private _observers = new Set<(paths: AffectedPath[]) => void>()
   ) {}

   private _notify(paths: AffectedPath[] | AffectedPath) {
      const pathArray = Array.isArray(paths) ? paths : [paths];
      this._observers.forEach((observer) => observer(pathArray));
   }

   manualTrack(paths: AffectedPath[] | AffectedPath) {
      this._notify(paths);
   }

   subscribe(observer: (paths: AffectedPath[]) => void) {
      this._observers.add(observer);
      return () => this._observers.delete(observer);
   }

   clearObservers() {
      this._observers.clear();
   }

   private _isEffectOperation = (methodName: string) => {
      return this._effectOperationRegex.some((r) => r.test(methodName));
   };

   private _isRecord = (obj: any) => {
      return Object.prototype.toString.call(obj) === '[object Object]';
   };

   mergeFieldPath(path: string, methodName: string): string {
      const unmergedPath = path;
      const segments = path.split('.');
      if (segments.length <= 2) {
         return path;
      }

      const targetModal: string = (nestedModelMapping as any)[segments[0]]?.[
         segments[1]
      ];
      if (!targetModal) {
         return path;
      }
      const [modal] = targetModal.split(':');

      const mergedPath = [modal, ...segments.slice(2)].join('.');

      if (unmergedPath && mergedPath !== unmergedPath) {
         return this.mergeFieldPath(mergedPath, methodName);
      }

      return mergedPath;
   }

   private _trackEntry(method: string, table: string, args: any) {
      let affectedPaths: AffectedPath[] = [];
      if (/^(update|create).*/.test(method)) {
         const data = Array.isArray(args[0]?.data)
            ? args[0].data[0]
            : args[0]?.data;
         // createMany({ data: [] }) 时 data[0] 是 undefined。
         // 这里不能直接传给 _trackAffectedPaths：Object.entries(undefined) 会抛
         // "Cannot convert undefined or null to object"（空排行榜的定时任务就死在这）。
         affectedPaths = data
            ? this._trackAffectedPaths(method, table, data)
            : [];
      } else if (/^upsert.*/.test(method)) {
         affectedPaths = this._trackAffectedPaths(method, table, args[0]);
      } else if (/^delete.*/.test(method)) {
         affectedPaths = [
            {
               path: table as ValidPath,
               method: method as ValidMethod,
            },
         ];
      }

      const formattedPaths = affectedPaths.map((item) => {
         const segments = item.path.split('.');
         segments[0] = (schemaToRealMap as any)[segments[0]] || segments[0];
         return {
            path: segments.join('.') as ValidPath,
            method: item.method,
         };
      });

      this._notify(formattedPaths);
   }

   private _trackAffectedPaths(
      method: string,
      table: string,
      args: any,
      affectedPaths: AffectedPath[] = []
   ) {
      // 兜底：对象为空/非对象时直接返回，避免 Object.entries 抛异常。
      // 触发场景：createMany / updateMany 传入空数组、或某些可选 data 缺省。
      if (args === null || args === undefined || typeof args !== 'object') {
         return affectedPaths;
      }

      Object.entries(args).forEach(([field, value]) => {
         if (this._operations.has(field)) {
            this._trackAffectedPaths(field, table, value, affectedPaths);
            return;
         }

         if (this._skipFields.has(field)) {
            if (field === 'data' && this._isRecord(value)) {
               this._trackAffectedPaths(method, table, value, affectedPaths);
            }
            return;
         }

         if (this._isRecord(value)) {
            const path = `${table}.${field}`;
            this._trackAffectedPaths(method, path, value, affectedPaths);
         }

         const path = `${table}.${field}`;
         const mergerdPath = this.mergeFieldPath(path, method);
         affectedPaths.push({
            path: mergerdPath as ValidPath,
            method: method as ValidMethod,
         });
      });

      return affectedPaths;
   }

   private _createOperationProxy<T extends object>(obj: T, table: string): T {
      const _this = this;
      const handler: ProxyHandler<T> = {
         get(target, prop, receiver) {
            const result = Reflect.get(target, prop, receiver);
            if (
               typeof result === 'function' &&
               _this._isEffectOperation(prop.toString())
            ) {
               return new Proxy(result, {
                  apply(target, thisArg, argArray) {
                     const result = Reflect.apply(target, thisArg, argArray);
                     _this._trackEntry(prop.toString(), table, argArray);
                     return result;
                  },
               });
            }
            return result;
         },
      };
      return new Proxy(obj, handler);
   }

   wrap<T extends object>(instance: T): T {
      const _this = this;
      const handler: ProxyHandler<T> = {
         get(target, prop, receiver) {
            const originalValue = Reflect.get(target, prop, receiver);

            if (typeof prop === 'symbol' || prop.startsWith('$')) {
               if (prop === '$transaction') {
                  return (...args: any[]) => {
                     if (typeof args[0] === 'function') {
                        const fn = args[0] as Function;
                        args[0] = (tx: any) => {
                           const proxiedTx = new Proxy(tx, handler);
                           return fn(proxiedTx);
                        };
                     }
                     return (originalValue as Function).apply(target, args);
                  };
               }
               return originalValue;
            }

            const upperCaseProp =
               prop.toString().charAt(0).toUpperCase() +
               prop.toString().slice(1);

            if (originalValue && typeof originalValue === 'object') {
               return _this._createOperationProxy(originalValue, upperCaseProp);
            }

            return originalValue;
         },
      };
      return new Proxy(instance, handler);
   }
}
