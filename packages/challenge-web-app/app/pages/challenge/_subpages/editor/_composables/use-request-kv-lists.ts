import type { Ref } from 'vue';

/** 键值对列表里的一行 */
export interface IKeyValueRow {
   id: number;
   key: string;
   value: string;
   enabled: boolean;
}

/** KvTextEditor 暴露出来的句柄（内容以编辑器为准，不依赖 v-model 同步链） */
export interface IKvEditorHandle {
   getValue: () => string;
   setValue: (value: string) => void;
}

export type KvListMode = 'table' | 'text';

/** 方格表格里的输入框：去掉组件库默认的大内边距与圆角，撑满单元格 */
export const CELL_INPUT_CLASS =
   '!py-[0.4rem] !px-2 !gap-0 !rounded-none w-full transition-colors focus-within:bg-accent-600';

let rowSeed = 0;

export const createKvRow = (key = '', value = ''): IKeyValueRow => ({
   id: ++rowSeed,
   key,
   value,
   enabled: true,
});

/** 一行是不是“空格”（键和值都没填）：空格不参与请求，等同于不存在 */
export const isBlankKvRow = (row: IKeyValueRow) =>
   !row.key.trim() && !row.value.trim();

/** 只取会真的发出去的行 */
export const filledKvRows = (rows: IKeyValueRow[]) =>
   rows.filter((row) => row.enabled && row.key.trim());

/** 一行一条 `键: 值`（`=` 也认），`//` 开头表示停用 */
export const toKvText = (rows: IKeyValueRow[]) =>
   rows
      .filter((row) => row.key.trim() || row.value.trim())
      .map((row) => `${row.enabled ? '' : '// '}${row.key.trim()}: ${row.value}`)
      .join('\n');

export const fromKvText = (text: string): IKeyValueRow[] =>
   text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line)
      .map((line) => {
         const enabled = !line.startsWith('//');
         const body = enabled ? line : line.slice(2).trim();
         // 冒号与等号都认：请求头习惯写 `Accept: ...`，查询参数习惯写 `page=1`
         const index = body.search(/[:=]/);
         const row = createKvRow(
            (index === -1 ? body : body.slice(0, index)).trim(),
            index === -1 ? '' : body.slice(index + 1).trim(),
         );
         row.enabled = enabled;
         return row;
      });

/**
 * 参数 / 请求头两张键值对列表：行状态 + 「表格 / 文本」两种编辑方式。
 *
 * 文本方式锁定的是进入时的那张列表（`textTarget`），所以中途切页签也不会把
 * 参数写到请求头里去。
 */
export const useRequestKvLists = () => {
   const params = ref<IKeyValueRow[]>([createKvRow()]);
   const headers = ref<IKeyValueRow[]>([createKvRow()]);

   /** 末尾永远留一个空格：填完一行自动补下一行，空格不参与请求 */
   const keepOneTrailingBlankRow = (rows: IKeyValueRow[]) => {
      while (
         rows.length > 1 &&
         isBlankKvRow(rows[rows.length - 1]!) &&
         isBlankKvRow(rows[rows.length - 2]!)
      ) {
         rows.pop();
      }
      const last = rows[rows.length - 1];
      if (!last || !isBlankKvRow(last)) rows.push(createKvRow());
   };

   // deep：改单元格的键/值也要触发；补完就停，不会无限递归。
   watch(params, () => keepOneTrailingBlankRow(params.value), { deep: true });
   watch(headers, () => keepOneTrailingBlankRow(headers.value), { deep: true });

   const removeRow = (rows: IKeyValueRow[], id: number) => {
      rows.splice(
         rows.findIndex((row) => row.id === id),
         1,
      );
   };

   // ————————————————— 表格 / 文本 —————————————————
   const mode = ref<KvListMode>('table');
   const isTextMode = computed(() => mode.value === 'text');
   const text = ref('');
   let textTarget: IKeyValueRow[] | null = null;
   const editor = useTemplateRef<IKvEditorHandle>('list-editor');

   const enterTextMode = (rows: IKeyValueRow[]) => {
      textTarget = rows;
      text.value = toKvText(rows);
   };

   /** 落盘：原地 splice，而不是给 params / headers 重新赋值，中途切过页签也对得上 */
   const applyTextMode = () => {
      if (!textTarget) return;
      const value = editor.value?.getValue() ?? text.value;
      const rows = fromKvText(value);
      textTarget.splice(
         0,
         textTarget.length,
         ...(rows.length ? rows : [createKvRow()]),
      );
      textTarget = null;
   };

   const switchMode = (next: KvListMode, rows: IKeyValueRow[]) => {
      if (next === mode.value) return;
      // 离开文本方式先把编辑内容落盘，回表格时看到的就是刚改的
      if (isTextMode.value) applyTextMode();
      mode.value = next;
      if (next === 'text') enterTextMode(rows);
   };

   const exitTextMode = () => {
      applyTextMode();
      text.value = '';
      mode.value = 'table';
   };

   const reset = () => {
      textTarget = null;
      text.value = '';
      mode.value = 'table';
      params.value = [createKvRow()];
      headers.value = [createKvRow()];
   };

   return {
      params,
      headers,
      removeRow,
      mode,
      isTextMode,
      text,
      editor,
      enterTextMode,
      applyTextMode,
      switchMode,
      exitTextMode,
      reset,
   };
};

/** 供 clearAll / 其它地方复用：列表是否处于文本方式 */
export type RequestKvLists = ReturnType<typeof useRequestKvLists>;
export type KvRowsRef = Ref<IKeyValueRow[]>;
