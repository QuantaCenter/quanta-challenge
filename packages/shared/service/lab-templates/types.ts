export type LabTemplateCategory = 'basic' | 'framework' | 'chart' | 'backend';

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

export const LAB_CATEGORY_LABEL: Record<LabTemplateCategory, string> = {
   basic: '基础',
   framework: '前端框架',
   chart: '数据可视化',
   backend: '后端服务',
};

/** 分类主题色：分类页签（选中态 / 悬停边框）与卡片分类标签共用 */
export const LAB_CATEGORY_COLOR: Record<LabTemplateCategory, string> = {
   framework: '#38BDF8',
   chart: '#FA7C0E',
   basic: '#4ADE80',
   backend: '#A78BFA',
};

/**
 * 模板标签对应的技术栈图标；未收录的标签由前端用 IconPark 图标补齐。
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

export const LAB_CATEGORY_ORDER: LabTemplateCategory[] = [
   'framework',
   'chart',
   'basic',
   'backend',
];
