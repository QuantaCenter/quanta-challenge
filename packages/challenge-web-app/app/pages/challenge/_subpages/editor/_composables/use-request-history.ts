import { createKvRow, type IKeyValueRow } from './use-request-kv-lists';

/** 历史里存的键值对：只留内容，恢复时再生成新行 */
export interface IRequestHistoryRow {
   key: string;
   value: string;
   enabled: boolean;
}

export interface IRequestHistoryEntry {
   id: string;
   /** 发送时间（毫秒） */
   at: number;
   method: string;
   pathname: string;
   params: IRequestHistoryRow[];
   headers: IRequestHistoryRow[];
   bodyMode: string;
   bodyText: string;
   status?: number;
   statusText?: string;
   durationMs?: number;
   /** 请求失败（连不上 / 超时 / 脚本报错） */
   failed?: boolean;
}

const STORAGE_KEY = 'challenge:request-history';
const MAX_ENTRIES = 50;

/** 只保存有内容的行（末尾那个空格由列表自己维护） */
export const toHistoryRows = (rows: IKeyValueRow[]): IRequestHistoryRow[] =>
   rows
      .filter((row) => row.key.trim() || row.value.trim())
      .map((row) => ({
         key: row.key,
         value: row.value,
         enabled: row.enabled,
      }));

export const toKvRows = (rows: IRequestHistoryRow[]): IKeyValueRow[] =>
   rows.map((row) => {
      const created = createKvRow(row.key, row.value);
      created.enabled = row.enabled;
      return created;
   });

/**
 * 请求历史：每次发送成功（或失败）后记一条，点一条就能把当时的
 * 方法 / 路径 / 参数 / 请求头 / 请求体恢复回来。
 *
 * 放 localStorage：刷新页面（编辑器重启容器是常事）后历史还在。
 */
export const useRequestHistory = () => {
   const entries = ref<IRequestHistoryEntry[]>([]);

   const persist = () => {
      try {
         localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));
      } catch {
         // 隐私模式 / 配额满：历史只是便利功能，存不下就算了
      }
   };

   onMounted(() => {
      try {
         const raw = localStorage.getItem(STORAGE_KEY);
         if (raw) entries.value = JSON.parse(raw) as IRequestHistoryEntry[];
      } catch {
         entries.value = [];
      }
   });

   const record = (entry: Omit<IRequestHistoryEntry, 'id' | 'at'>) => {
      entries.value = [
         { ...entry, id: createUuid(), at: Date.now() },
         ...entries.value,
      ].slice(0, MAX_ENTRIES);
      persist();
   };

   const clear = () => {
      entries.value = [];
      persist();
   };

   return { entries, record, clear };
};
