/**
 * 根据背景色亮度选择可读的文字颜色。
 * 标签颜色由用户自选，浅色底上用深色字、深色底上用白字，
 * 否则色块里的色值文本会看不清。
 */
export const textColorOn = (background: string) => {
   const hex = background.replace('#', '').trim();
   const normalized =
      hex.length === 3
         ? hex
              .split('')
              .map((char) => `${char}${char}`)
              .join('')
         : hex.padEnd(6, '0').slice(0, 6);

   const red = Number.parseInt(normalized.slice(0, 2), 16);
   const green = Number.parseInt(normalized.slice(2, 4), 16);
   const blue = Number.parseInt(normalized.slice(4, 6), 16);

   if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return '#FFFFFF';
   }

   // 感知亮度（ITU-R BT.601）
   const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
   return luminance > 0.6 ? '#111111' : '#FFFFFF';
};
