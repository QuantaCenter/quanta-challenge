<script setup lang="ts" generic="T extends Record<string, any>">
import type { ITableColumn } from './type';

const props = withDefaults(
   defineProps<{
      columns: ITableColumn[];
      rows: T[];
      loading?: boolean;
      /** 行 key 取哪个字段，不传则用下标 */
      rowKey?: keyof T & string;
      /** 加载态占位行数 */
      skeletonCount?: number;
      /** 空态文案，也可用 `#empty` 插槽替换 */
      emptyText?: string;
      /** 开启后整行可点击（加 hover/cursor 样式），配合 @row-click 使用 */
      clickableRows?: boolean;
   }>(),
   {
      loading: false,
      skeletonCount: 8,
      emptyText: '暂无数据',
      clickableRows: false,
   }
);

const emits = defineEmits<{
   rowClick: [row: T];
}>();

const isFirstColumn = (index: number) => index === 0;
const isLastColumn = (index: number) => index === props.columns.length - 1;

const alignClass = (align?: ITableColumn['align']) => {
   if (align === 'center') return 'text-center';
   if (align === 'right') return 'text-right';
   return 'text-left';
};

const headerClass = (column: ITableColumn, index: number) => [
   'bg-secondary py-[0.625rem] pr-3',
   isFirstColumn(index) ? 'pl-6 rounded-l-lg' : '',
   isLastColumn(index) ? 'pr-6 rounded-r-lg' : '',
   alignClass(column.align),
   column.class,
];

const cellClass = (column: ITableColumn, index: number) => [
   'py-4 pr-3',
   isFirstColumn(index) ? 'pl-6 rounded-l-lg' : '',
   isLastColumn(index) ? 'pr-6 rounded-r-lg' : '',
   alignClass(column.cellAlign ?? column.align),
   column.class,
];

const rowIdentifier = (row: T, index: number) => {
   return props.rowKey ? row[props.rowKey] : index;
};
</script>

<template>
   <table class="!border-separate border-spacing-0 w-full table-fixed">
      <colgroup>
         <col
            v-for="column in columns"
            :key="column.key"
            :class="column.class"
            :style="column.width ? { width: column.width } : undefined" />
      </colgroup>

      <thead class="sticky top-[5.75rem] max-md:top-14 z-10">
         <tr class="text-accent-700 text-nowrap whitespace-nowrap">
            <th
               v-for="(column, index) in columns"
               :key="column.key"
               :class="headerClass(column, index)">
               <slot :name="`header-${column.key}`" :column="column">
                  {{ column.title }}
               </slot>
            </th>
         </tr>
      </thead>

      <tbody v-if="loading">
         <tr
            v-for="i in skeletonCount"
            :key="i"
            class="even:bg-accent-600">
            <td
               v-for="(column, index) in columns"
               :key="column.key"
               :class="cellClass(column, index)">
               <slot
                  :name="`skeleton-${column.key}`"
                  :index="i"
                  :item-class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'">
                  <StSkeletonItem
                     :class="[
                        column.skeletonClass ?? 'h-5 w-[6rem] rounded-md',
                        i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500',
                     ]" />
               </slot>
            </td>
         </tr>
      </tbody>

      <tbody v-else-if="rows.length > 0">
         <tr
            v-for="(row, index) in rows"
            :key="rowIdentifier(row, index)"
            :class="[
               'even:bg-accent-600',
               props.clickableRows
                  ? 'cursor-pointer hover:bg-accent-500 transition-colors'
                  : '',
            ]"
            @click="emits('rowClick', row)">
            <td
               v-for="(column, columnIndex) in columns"
               :key="column.key"
               :class="cellClass(column, columnIndex)">
               <slot
                  :name="`cell-${column.key}`"
                  :row="row"
                  :value="row[column.key]"
                  :index="index">
                  {{ row[column.key] }}
               </slot>
            </td>
         </tr>
      </tbody>

      <tbody v-else>
         <tr>
            <td :colspan="columns.length">
               <slot name="empty">
                  <StSpace
                     center
                     class="text-accent-400 my-[20vh] st-font-body-normal">
                     {{ emptyText }}
                  </StSpace>
               </slot>
            </td>
         </tr>
      </tbody>
   </table>
</template>
