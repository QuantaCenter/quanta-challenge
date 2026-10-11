import type { ISelectOption } from '~/components/st/Select/type';
import {
   createKvRow,
   filledKvRows,
   type KvRowsRef,
} from './use-request-kv-lists';

export type HttpMethod =
   | 'GET'
   | 'POST'
   | 'PUT'
   | 'PATCH'
   | 'DELETE'
   | 'HEAD'
   | 'OPTIONS';

export const HTTP_METHODS: HttpMethod[] = [
   'GET',
   'POST',
   'PUT',
   'PATCH',
   'DELETE',
   'HEAD',
   'OPTIONS',
];

/** 方法配色沿用主题色板（Postman 也是按方法上色，方便一眼扫出改的是哪个请求）。
 *  HEAD / OPTIONS 在色板里没剩下可用颜色，用两个固定色补上（否则它俩都是灰的，看着像禁用）。 */
export const METHOD_COLOR: Record<HttpMethod, string> = {
   GET: 'text-success',
   POST: 'text-warning',
   PUT: 'text-primary',
   PATCH: 'text-secondary',
   DELETE: 'text-error',
   HEAD: 'text-[#6cb6ff]',
   OPTIONS: 'text-[#c084fc]',
};

export const methodOptions: ISelectOption[] = HTTP_METHODS.map((item) => ({
   label: item,
   value: item,
}));

export const normalizePathname = (value: string) => {
   const trimmed = value.trim();
   if (!trimmed) return '/';
   return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/** 请求目标：方法 + 路径 + 查询参数 → 最终 URL */
export const useRequestTarget = (options: {
   getPort: () => number;
   params: KvRowsRef;
}) => {
   // 用 computed 而不是直接 ref：StSelect 点已选中项会 emit 空串，这里忽略掉，
   // 否则方法会被清成空白。
   const rawMethod = ref<HttpMethod>('GET');
   const method = computed<HttpMethod>({
      get: () => rawMethod.value,
      set: (value) => {
         if (value) rawMethod.value = value;
      },
   });

   const pathname = ref('/');

   const queryString = computed(() =>
      filledKvRows(options.params.value)
         .map(
            (row) =>
               `${encodeURIComponent(row.key.trim())}=${encodeURIComponent(row.value)}`,
         )
         .join('&'),
   );

   const requestUrl = computed(() => {
      const base = `http://127.0.0.1:${options.getPort()}`;
      const suffix = queryString.value ? `?${queryString.value}` : '';
      return `${base}${normalizePathname(pathname.value)}${suffix}`;
   });

   /** 路径输入：粘贴带查询串的地址时，把 `?` 之后拆成参数行 */
   const handlePathUpdate = (value: string | number | undefined) => {
      const text = String(value ?? '');
      const queryIndex = text.indexOf('?');
      if (queryIndex === -1) {
         pathname.value = text;
         return;
      }
      pathname.value = text.slice(0, queryIndex);

      const parsed = new URLSearchParams(text.slice(queryIndex + 1));
      const merged = [...parsed.entries()].map(([key, item]) =>
         createKvRow(key, item),
      );
      if (!merged.length) return;
      options.params.value = [
         ...merged,
         ...options.params.value.filter((row) => row.key.trim()),
      ];
   };

   const reset = () => {
      rawMethod.value = 'GET';
      pathname.value = '/';
   };

   return {
      method,
      methodOptions,
      METHOD_COLOR,
      pathname,
      queryString,
      requestUrl,
      handlePathUpdate,
      reset,
   };
};
