export interface ITableColumn {
   /** 列标识，同时是具名插槽 `#cell-<key>` / `#header-<key>` 的名字；不写插槽时直接渲染 `row[key]` */
   key: string;
   title: string;
   /** colgroup 列宽，如 '6rem'；不写则该列按剩余空间自适应 */
   width?: string;
   /** 表头对齐，默认左对齐 */
   align?: 'left' | 'center' | 'right';
   /** 单元格对齐，默认与表头一致 */
   cellAlign?: 'left' | 'center' | 'right';
   /** 骨架条形状，默认 'h-5 w-[6rem] rounded-md'；横向是「内容宽度」而非列宽 */
   skeletonClass?: string;
}
