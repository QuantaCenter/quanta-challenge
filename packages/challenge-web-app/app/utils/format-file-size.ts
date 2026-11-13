/** 把字节数格式化为 B / KB / MB / GB（保留一位小数，整数时省略小数） */
export const formatFileSize = (bytes: number) => {
   const units = ['B', 'KB', 'MB', 'GB'];
   let value = Math.max(0, bytes);
   let index = 0;
   while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
   }
   const text = index === 0 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
   return `${text}${units[index]}`;
};
