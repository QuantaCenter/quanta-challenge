const parseHex = (hex: string): [number, number, number] => {
   // 去除 "#" 符号
   hex = hex.replace(/^#/, '');

   // 支持 #RGB 简写形式
   if (hex.length === 3) {
      hex = hex
         .split('')
         .map((char) => char + char)
         .join('');
   }

   // 颜色选择器输出的 #RRGGBBAA：忽略透明度
   if (hex.length === 8) {
      hex = hex.slice(0, 6);
   }

   if (hex.length !== 6) {
      throw new Error('Invalid HEX color');
   }

   return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
   ];
};

export function shouldUseBlackText(hex: string): boolean {
   const [r, g, b] = parseHex(hex);

   // 计算亮度（luminance）
   const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

   // 判断是否使用黑色字体
   return luminance > 186;
}

/** WCAG 2 相对亮度 */
const relativeLuminance = ([r, g, b]: [number, number, number]) => {
   const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
   };
   return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** 深色文字 accent-700（#111111）的相对亮度 */
const DARK_TEXT_LUMINANCE = relativeLuminance([17, 17, 17]);

/**
 * 按 WCAG 对比度选择文字颜色：深色文字（accent-700）与白色文字哪个对比度更高就用哪个。
 *
 * 与 `shouldUseBlackText` 的区别：后者阈值很高，只有接近白色的背景才会用深色文字，
 * 天蓝、浅绿、浅紫这类明亮的中间色仍会配白字，对比度不足 2.5:1。
 * 这里用于主题色较浅的场景（如工坊模板分类）；未直接替换 `shouldUseBlackText`，
 * 是因为全站的品牌橙色按钮 / 标签会因此全部改为深色文字。
 */
export function prefersDarkTextByContrast(hex: string): boolean {
   const luminance = relativeLuminance(parseHex(hex));
   const contrastWithWhite = 1.05 / (luminance + 0.05);
   const contrastWithDark = (luminance + 0.05) / (DARK_TEXT_LUMINANCE + 0.05);
   return contrastWithDark > contrastWithWhite;
}
