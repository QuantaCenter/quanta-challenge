const random = (min, max) => Math.round(min + Math.random() * (max - min));

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1 + '月');
export const CATEGORIES = ['前端', '后端', '算法', '数据库', '运维'];
export const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust'];

export function createData() {
   return {
      visits: MONTHS.map(() => random(800, 3200)),
      submissions: MONTHS.map(() => random(300, 1800)),
      categories: CATEGORIES.map((name) => ({ name, value: random(120, 980) })),
      languages: LANGUAGES.map((name) => ({ name, value: random(80, 600) })),
      passRate: random(45, 96),
   };
}
