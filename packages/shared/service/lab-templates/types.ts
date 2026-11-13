/**
 * 模板分类 id，对应数据库 lab_categories.id。
 * 分类的名称、颜色、图标与排序由管理员在「标签管理 → 模板分类」中维护，不再写死在代码里；
 * 内置分类 framework / chart / basic / backend 由迁移预置。
 */
export type LabTemplateCategory = string;

/** 模板分类 id 的格式（小写字母、数字与连字符），内置模板 template.json 的 category 也遵循它 */
export const LAB_CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** 分类页签可选的预置图标（IconPark 图标名，kebab-case）；前端在 utils/lab-category-icons.ts 中映射为组件 */
export const LAB_CATEGORY_ICON_NAMES = [
   'components',
   'chart-histogram',
   'code-brackets',
   'server',
   'code',
   'terminal',
   'api',
   'data-screen',
   'iphone',
   'game-handle',
   'robot',
   'experiment',
   'lightning',
   'paint',
   'book-open',
   'cube',
   'puzzle',
   'earth',
   'lock',
   'brain',
   'platte',
   'layers',
   'application-two',
   'browser',
   'cpu',
   'rocket',
   'tool',
] as const;

export type LabCategoryIconName = (typeof LAB_CATEGORY_ICON_NAMES)[number];

export const isLabCategoryIconName = (value: unknown): value is LabCategoryIconName =>
   typeof value === 'string' &&
   (LAB_CATEGORY_ICON_NAMES as readonly string[]).includes(value);

/** 分类不存在（例如被删除）时的展示兜底 */
export const LAB_CATEGORY_FALLBACK = { name: '未分类', color: '#6D6D6D' };

export interface LabTemplate {
   /** 稳定 id：实验室项目的 templateId 字段引用它，不要随意改动 */
   id: string;
   name: string;
   description: string;
   category: LabTemplateCategory;
   tags: string[];
   /** 技术栈图标（public 目录下的地址，与资源管理器文件图标同源：/icons/*.png|svg） */
   icon: string;
   /** 首次打开的文件（相对项目根）；空白项目留空 */
   entry: string;
   /** 依赖安装命令（在项目目录内执行），留空则跳过安装 */
   installCommand?: string;
   /** 启动命令：写入交互式 shell，便于 Ctrl+C 后在终端里继续操作；留空则只进入项目目录、不启动任何服务 */
   startCommand: string;
   /** 说明文档（Markdown），在「说明」浮窗与移动端说明板块展示 */
   readme: string;
   /** 项目文件：相对项目根的路径 -> 文本内容 */
   files: Record<string, string>;
}

/**
 * 内置标签对应的技术栈图标；未收录的标签由前端用 IconPark 图标补齐。
 * 管理员发布的同名实验室标签（tags.scope = lab）上传了图标时，优先使用上传的图标。
 * 品牌 SVG 已按 PNG 图标的留白比例（约 84%）缩放，保证与 PNG 在同一尺寸下视觉大小一致。
 */
export const LAB_TAG_ICON: Record<string, string> = {
   Vue: '/icons/vue.png',
   React: '/icons/react.png',
   JSX: '/icons/react.png',
   Vite: '/icons/vite.png',
   TypeScript: '/icons/typescript.png',
   JavaScript: '/icons/javascript.png',
   HTML: '/icons/html.png',
   CSS: '/icons/css.png',
   'Node.js': '/icons/nodejs.png',
   Express: '/icons/express.svg',
   ECharts: '/icons/echarts.svg',
   'Chart.js': '/icons/chartjs.svg',
   D3: '/icons/d3.svg',
};

/** 发布模板时可选的模板图标，均为站内 public/icons 下的资源 */
export const LAB_ICON_PRESETS: { label: string; value: string }[] = [
   { label: 'Vue', value: '/icons/vue.png' },
   { label: 'React', value: '/icons/react.png' },
   { label: 'Nuxt', value: '/icons/nuxt.png' },
   { label: 'Svelte', value: '/icons/svelte.png' },
   { label: 'Vite', value: '/icons/vite.png' },
   { label: 'Webpack', value: '/icons/webpack.png' },
   { label: 'Babel', value: '/icons/babel.png' },
   { label: 'TypeScript', value: '/icons/typescript.png' },
   { label: 'JavaScript', value: '/icons/javascript.png' },
   { label: 'HTML', value: '/icons/html.png' },
   { label: 'CSS', value: '/icons/css.png' },
   { label: 'Sass', value: '/icons/sass.png' },
   { label: 'Less', value: '/icons/less.png' },
   { label: 'Stylus', value: '/icons/stylus.png' },
   { label: 'PostCSS', value: '/icons/postcss.png' },
   { label: 'Tailwind CSS', value: '/icons/tailwindcss.png' },
   { label: 'SVG', value: '/icons/svg.png' },
   { label: 'Node.js', value: '/icons/nodejs.png' },
   { label: 'Express', value: '/icons/express.svg' },
   { label: 'npm', value: '/icons/npm.png' },
   { label: 'pnpm', value: '/icons/pnpm.png' },
   { label: 'Yarn', value: '/icons/yarn.png' },
   { label: 'ECharts', value: '/icons/echarts.svg' },
   { label: 'Chart.js', value: '/icons/chartjs.svg' },
   { label: 'D3', value: '/icons/d3.svg' },
   { label: 'WebAssembly', value: '/icons/webassembly.png' },
   { label: 'ESLint', value: '/icons/eslint.png' },
   { label: 'Git', value: '/icons/git.png' },
   { label: 'JSON', value: '/icons/json.png' },
   { label: 'YAML', value: '/icons/yaml.png' },
   { label: 'Markdown', value: '/icons/markdown.png' },
   { label: '终端', value: '/icons/console.png' },
   { label: '图片', value: '/icons/image.png' },
   { label: '字体', value: '/icons/font.png' },
   { label: '路由', value: '/icons/routing.png' },
   { label: '机器人', value: '/icons/robot.png' },
   { label: '文档', value: '/icons/document.png' },
];
