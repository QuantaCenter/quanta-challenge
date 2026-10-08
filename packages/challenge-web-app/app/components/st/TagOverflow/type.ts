export interface ITagOverflowItem {
   /** 唯一 key，用于 v-for */
   key: string | number;
   label: string;
   /** 标签自身的样式类（底色 / 字号 / 圆角等） */
   class?: string;
}
