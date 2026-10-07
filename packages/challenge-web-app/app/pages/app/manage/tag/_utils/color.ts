import { shouldUseBlackText } from '~/utils/should-use-black-text';

/**
 * 标签颜色由用户自选，色块里的色值文本要按背景亮度换色才看得清。
 * 复用 `shouldUseBlackText` 的亮度判断，非法色值（它会对长度不等于 3/6 的
 * hex 抛错）兜底为白字，避免一个脏数据把整页渲染打挂。
 */
export const textColorOn = (background: string) => {
   try {
      return shouldUseBlackText(background) ? '#111111' : '#FFFFFF';
   } catch {
      return '#FFFFFF';
   }
};
