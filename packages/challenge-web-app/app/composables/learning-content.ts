import type {
   ArticleCoverPreset,
   Difficulty,
   LearningProblemRef,
} from './use-learning';

/**
 * 学习内容的**真源**：课程 / 专题 / 文章的初始内容。
 *
 * 文章正文在 `learning-articles.ts`，本文件保留题库注册表、专题与课程。
 * 专题靠 `articleSlugs` 引用文章，两边用的是同一份 `slug`，不会出现对不上的情况。
 */

/* ---------- 题库：两道已发布的题（本仓库 problems/ 下的目录） ---------- */

export interface ProblemMeta extends Omit<LearningProblemRef, 'baseId'> {
   baseId: number;
}

export const PROBLEM_REGISTRY: ProblemMeta[] = [
   {
      baseId: 6,
      // pid = 这道题当前发布的版本（改了配置重新上传会 +1，题号不变）
      pid: 8,
      title: '购物车合计',
      difficulty: 'easy' satisfies Difficulty,
      totalScore: 40,
   },
   {
      baseId: 7,
      pid: 9,
      title: '主题切换',
      difficulty: 'medium' satisfies Difficulty,
      totalScore: 40,
   },
];

export const seedProblems = (): LearningProblemRef[] =>
   PROBLEM_REGISTRY.map((problem) => ({ ...problem }));

/* ---------- 专题（引用文章，归属课程） ---------- */

export interface SeedTopic {
   slug: string;
   courseSlug: string;
   name: string;
   description: string;
   weight: number;
   prerequisites: string[];
   articleSlugs: string[];
   coverPreset: ArticleCoverPreset;
}

export const SEED_TOPICS: SeedTopic[] = [
   {
      slug: 'document-structure',
      courseSlug: 'html',
      name: '文档结构',
      description: '先弄清文档是怎么被解析成一棵树的，再谈标签怎么写。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['document-tree', 'parsing-is-forgiving'],
      coverPreset: 'ember',
   },
   {
      slug: 'tags',
      courseSlug: 'html',
      name: '标签',
      description: '语义化标签与可访问性：同一个视觉结果，只有一种写法是对的。',
      weight: 20,
      prerequisites: ['document-structure'],
      articleSlugs: ['semantic-tags', 'forms-and-a11y'],
      coverPreset: 'slate',
   },
   {
      slug: 'layout',
      courseSlug: 'css',
      name: '布局',
      description: 'flex 与 grid 是两篇独立的文章，不是同一篇里的两节。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['flex-layout', 'grid-layout'],
      coverPreset: 'aurora',
   },
   {
      slug: 'variables',
      courseSlug: 'css',
      name: '变量',
      description: '自定义属性是运行时可读写的，主题切换靠的就是它。',
      weight: 20,
      prerequisites: ['layout'],
      articleSlugs: ['custom-properties', 'dark-mode'],
      coverPreset: 'violet',
   },
   {
      slug: 'selectors',
      courseSlug: 'css',
      name: '选择器',
      description: '优先级、层叠，以及用 :where() 主动降低权重。',
      weight: 30,
      prerequisites: ['layout'],
      articleSlugs: ['specificity', 'attribute-selectors'],
      coverPreset: 'mint',
   },
   {
      slug: 'dom',
      courseSlug: 'javascript',
      name: 'DOM',
      description: '节点操作与事件模型，浏览器里最基础的一套 API。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['node-operations', 'event-delegation'],
      coverPreset: 'mint',
   },
   {
      slug: 'bom',
      courseSlug: 'javascript',
      name: 'BOM',
      description: 'localStorage 与它之外的选择，浏览器给的那几个全局对象。',
      weight: 20,
      prerequisites: ['dom'],
      articleSlugs: ['local-storage'],
      coverPreset: 'slate',
   },
   {
      slug: 'async',
      courseSlug: 'javascript',
      name: '异步',
      description: 'Promise、并发控制，卡人的地方都在这。',
      weight: 30,
      prerequisites: ['dom'],
      articleSlugs: ['async-basics', 'promise-concurrency'],
      coverPreset: 'violet',
   },
   {
      slug: 'devtools',
      courseSlug: 'devtools',
      name: '调试面板',
      description: '不改代码就能看清页面到底发生了什么。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['devtools-panels', 'breakpoints'],
      coverPreset: 'mint',
   },
   {
      slug: 'commit',
      courseSlug: 'git',
      name: '提交规范',
      description: '提交信息是写给半年后的自己看的。',
      weight: 10,
      prerequisites: [],
      articleSlugs: ['commit-message'],
      coverPreset: 'slate',
   },
   {
      slug: 'branch',
      courseSlug: 'git',
      name: '分支与合并',
      description: '让主干随时可发布，冲突来了也别慌。',
      weight: 20,
      prerequisites: ['commit'],
      articleSlugs: ['branch-model', 'merge-conflicts'],
      coverPreset: 'ember',
   },
];

/* ---------- 课程（集合专题） ---------- */

export interface SeedCourse {
   slug: string;
   name: string;
   description: string;
   weight: number;
   coverPreset: ArticleCoverPreset;
}

export const SEED_COURSES: SeedCourse[] = [
   {
      slug: 'html',
      name: 'HTML',
      description:
         '网页的结构层。从文档树讲到标签与可访问性，学完能独立写出一份语义正确的页面骨架。',
      weight: 10,
      coverPreset: 'ember',
   },
   {
      slug: 'css',
      name: 'CSS',
      description:
         '网页的表现层。布局、变量与选择器三条线并行，变量是主题化的地基。',
      weight: 20,
      coverPreset: 'aurora',
   },
   {
      slug: 'javascript',
      name: 'JavaScript',
      description: '网页的行为层。DOM、BOM 与异步三块，异步是分水岭。',
      weight: 30,
      coverPreset: 'violet',
   },
   {
      slug: 'devtools',
      name: '浏览器调试',
      description: '定位样式、下断点、读调用栈——不改代码也能看清发生了什么。',
      weight: 40,
      coverPreset: 'mint',
   },
   {
      slug: 'git',
      name: 'Git 与协作',
      description: '提交信息、分支模型与冲突处理。一个人写也要按能协作的方式写。',
      weight: 50,
      coverPreset: 'slate',
   },
];

/* ---------- id 分配：初始内容按数组顺序取号，运行时新增的往后排 ---------- */

export const SEED_ID_BASE = 100;
export const SEED_TOPIC_ID_BASE = 1000;
export const SEED_COURSE_ID_BASE = 5000;

export const seedArticleId = (index: number) => SEED_ID_BASE + index + 1;
export const seedTopicId = (index: number) => SEED_TOPIC_ID_BASE + index + 1;
export const seedCourseId = (index: number) => SEED_COURSE_ID_BASE + index + 1;
