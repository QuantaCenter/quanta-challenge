export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard';

export interface LearningProblemRef {
   baseId: number;
   pid: number;
   title: string;
   difficulty: Difficulty;
   totalScore: number;
   // 引用已被删除：界面标注不可用，并按已完成计入进度
   unavailable?: boolean;
}

export type ContentBlock =
   | { type: 'heading'; text: string }
   | { type: 'paragraph'; text: string }
   | { type: 'list'; items: string[] }
   | { type: 'code'; lang: string; text: string }
   | { type: 'callout'; text: string };

// 文章是一等实体：独立存在、不归属任何专题，专题只是引用它
export interface LearningArticle {
   id: number;
   slug: string;
   title: string;
   summary: string;
   content: ContentBlock[];
   problems: LearningProblemRef[];
}

export interface LearningTopic {
   id: number;
   courseId: number;
   slug: string;
   name: string;
   description: string;
   weight: number;
   // 只影响排列顺序，不做访问控制
   prerequisites: number[];
   // 引用，不是归属：同一篇文章可以出现在多个专题里，也可以一个都不出现
   articleIds: number[];
}

// 课程是专题的集合，允许 0 个专题（可以存草稿，不能发布）
export interface LearningCourse {
   id: number;
   slug: string;
   name: string;
   description: string;
   weight: number;
   status: 'draft' | 'pending' | 'published';
}

export interface ArticleProgress {
   total: number;
   done: number;
   progress: number;
   percent: number;
   completed: boolean;
   isReadingOnly: boolean;
   read: boolean;
   lastOpenedAt: string | null;
}

export interface TopicProgress {
   articleCount: number;
   finishedArticles: number;
   problemCount: number;
   doneProblems: number;
   percent: number;
   completed: boolean;
   lastOpenedAt: string | null;
}

export interface CourseProgress {
   topicCount: number;
   finishedTopics: number;
   problemCount: number;
   doneProblems: number;
   percent: number;
   // 单向：一旦完成就不再回退
   completed: boolean;
   completedAt: string | null;
}

// 「最近学习」卡片的一行 = 一个专题，连同它所属的课程名
export interface RecentLearningItem extends TopicProgress {
   courseId: number;
   courseName: string;
   topicId: number;
   topicName: string;
}

/* 事实（Facts）。其余全部现算。 */

// 已完成题目：某 base 的任意版本上拿过该版本的满分
const COMPLETED_BASE_IDS = new Set<number>([
   4001, // CSS / 布局
   4101, 4102, 4103, // CSS / 变量
   4201, 4202, // HTML / 标签
   4301, 4302, // JavaScript / 异步
   4701, // Git 提交规范
   4901, 4902, // 浏览器调试工具
]);

// 文章访问记录。格式固定为 'YYYY-MM-DD HH:mm'：可按字典序倒排，且不受时区影响
const ARTICLE_VISITS: Record<number, string> = {
   101: '2026-10-08 09:12',
   102: '2026-10-08 14:32',
   104: '2026-10-06 10:20',
   201: '2026-10-07 21:48',
   202: '2026-10-08 11:05',
   203: '2026-10-07 09:00',
   301: '2026-10-05 18:20',
   303: '2026-10-04 20:41',
   401: '2026-10-03 16:00',
};

// 课程完成记录。这是唯一落库的派生值——「一旦完成不再回退」没法从事实重放出来
const COURSE_COMPLETIONS: Record<number, string> = {
   // 课程 1 在 2026-10-06 完成；此后专题里补了新文章，进度掉到 100% 以下，完成状态保留
   1: '2026-10-06 20:15',
};

/* 内容（假数据） */

const ARTICLES: LearningArticle[] = [
   {
      id: 101,
      slug: 'document-structure',
      title: '文档结构',
      summary: '纯阅读文章：没有引用任何题目',
      content: [
         {
            type: 'paragraph',
            text: '浏览器拿到 HTML 文本之后，第一件事不是"画出来"，而是把它解析成一棵 DOM 树。这篇只讲这棵树是怎么长出来的。',
         },
         {
            type: 'heading',
            text: '解析是容错的',
         },
         {
            type: 'paragraph',
            text: '与 XML 不同，HTML 的解析器不会因为一个没闭合的标签就罢工。它会按照规范里写死的规则猜测你的意图，然后把树补完。',
         },
         {
            type: 'list',
            items: [
               '<p> 里嵌 <div> 会被自动拆开——因为 <p> 不允许包含块级元素',
               '表格外的 <tr> 会被默默丢弃',
               '缺失的 <html> / <head> / <body> 会被自动补齐',
            ],
         },
         {
            type: 'callout',
            text: '这篇没有引用任何题目，所以它不显示进度条，只用「未读 / 已读」表达状态。',
         },
      ],
      problems: [],
   },
   {
      id: 102,
      slug: 'html-tags',
      title: '标签',
      summary: '语义化标签与它们的默认行为',
      content: [
         {
            type: 'paragraph',
            text: '同一个视觉效果可以用很多种标签实现，但只有一种是对的。这篇讨论怎么选。',
         },
         {
            type: 'code',
            lang: 'html',
            text: '<button onclick="location.href=\'/a\'">去 A 页</button>\n<a href="/a">去 A 页</a>',
         },
         {
            type: 'paragraph',
            text: '上面两行的视觉结果几乎一样，但只有第二行能被键盘聚焦、能被右键"在新标签页打开"、能被屏幕阅读器识别为链接。',
         },
      ],
      problems: [
         {
            baseId: 4201,
            pid: 7201,
            title: '语义化一个产品卡片',
            difficulty: 'easy',
            totalScore: 100,
         },
         {
            baseId: 4202,
            pid: 7202,
            title: '表单标签与可访问性',
            difficulty: 'medium',
            totalScore: 120,
         },
         {
            baseId: 4203,
            pid: 7203,
            title: '表格结构的正确写法',
            difficulty: 'medium',
            totalScore: 100,
            unavailable: true,
         },
      ],
   },
   {
      id: 104,
      slug: 'browser-devtools',
      title: '浏览器调试工具',
      summary: '在 Elements 面板里定位样式来源',
      content: [
         {
            type: 'paragraph',
            text: '写完一个页面的第一件事不是问别人"为什么不生效"，而是打开开发者工具自己找答案。',
         },
         {
            type: 'list',
            items: [
               'Elements 面板右侧的 Styles 会告诉你每条规则来自哪个文件、有没有被划掉',
               'Computed 面板给出的是最终生效值，排除掉层叠与继承的干扰',
               'Sources 面板的断点比 console.log 更早看到问题现场',
            ],
         },
      ],
      problems: [
         {
            baseId: 4901,
            pid: 7901,
            title: '用 DevTools 定位一条被覆盖的样式',
            difficulty: 'easy',
            totalScore: 80,
         },
         {
            baseId: 4902,
            pid: 7902,
            title: '在循环里下一个条件断点',
            difficulty: 'medium',
            totalScore: 100,
         },
      ],
   },
   {
      id: 201,
      slug: 'css-layout',
      title: '布局',
      summary: 'flex 与 grid 都在这一篇里',
      content: [
         {
            type: 'paragraph',
            text: 'flex 与 grid 不是二选一的关系：flex 管一维排布，grid 管二维。判断标准是"我需不需要同时控制行和列"。',
         },
         {
            type: 'heading',
            text: 'flex 的两个轴',
         },
         {
            type: 'list',
            items: [
               '主轴由 flex-direction 决定，justify-content 作用在主轴上',
               '交叉轴垂直于主轴，align-items 作用在交叉轴上',
               'flex: 1 是 flex-grow:1 / flex-shrink:1 / flex-basis:0% 的简写',
            ],
         },
         {
            type: 'code',
            lang: 'css',
            text: '.bar {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}',
         },
         {
            type: 'callout',
            text: 'flex 与 grid 是这一篇内部的内容，不是两篇独立的文章。',
         },
      ],
      problems: [
         {
            baseId: 4001,
            pid: 7001,
            title: '用 flex 实现等高三栏',
            difficulty: 'easy',
            totalScore: 100,
         },
         {
            baseId: 4002,
            pid: 7002,
            title: 'grid 实现瀑布流卡片',
            difficulty: 'hard',
            totalScore: 150,
         },
         {
            baseId: 4003,
            pid: 7003,
            title: '响应式导航栏',
            difficulty: 'medium',
            totalScore: 120,
         },
      ],
   },
   {
      id: 202,
      slug: 'css-variables',
      title: '变量',
      summary: '自定义属性、作用域与回退',
      content: [
         {
            type: 'paragraph',
            text: 'CSS 自定义属性（--x）和预处理器变量最大的区别是：它是**运行时可读写的**，能被 JS 修改、能参与继承。',
         },
         {
            type: 'code',
            lang: 'css',
            text: ':root { --brand: #fa7c0e; }\n.card { color: var(--brand, #333); }',
         },
      ],
      problems: [
         {
            baseId: 4101,
            pid: 7101,
            title: '用变量实现主题切换',
            difficulty: 'medium',
            totalScore: 100,
         },
         {
            baseId: 4102,
            pid: 7102,
            title: '变量的作用域与继承',
            difficulty: 'easy',
            totalScore: 80,
         },
         {
            baseId: 4103,
            pid: 7103,
            title: '用 JS 读写自定义属性',
            difficulty: 'medium',
            totalScore: 100,
         },
      ],
   },
   {
      id: 203,
      slug: 'css-selectors',
      title: '选择器',
      summary: '优先级、层叠与 :is() / :where()',
      content: [
         {
            type: 'paragraph',
            text: '优先级不是"谁写得靠后谁赢"，而是先比权重、权重相同才比顺序。',
         },
      ],
      problems: [
         {
            baseId: 4401,
            pid: 7401,
            title: '计算一组选择器的优先级',
            difficulty: 'easy',
            totalScore: 80,
         },
         {
            baseId: 4402,
            pid: 7402,
            title: '用 :where() 降低权重',
            difficulty: 'hard',
            totalScore: 120,
         },
         {
            baseId: 4403,
            pid: 7403,
            title: '层叠上下文与 z-index',
            difficulty: 'hard',
            totalScore: 150,
         },
         {
            baseId: 4404,
            pid: 7404,
            title: '属性选择器实战',
            difficulty: 'medium',
            totalScore: 100,
         },
      ],
   },
   {
      id: 301,
      slug: 'dom',
      title: 'DOM',
      summary: '节点操作与事件模型',
      content: [
         {
            type: 'paragraph',
            text: 'DOM 是文档在 JS 里的投影。它既是数据结构，也是一套事件系统。',
         },
         {
            type: 'heading',
            text: '事件委托',
         },
         {
            type: 'paragraph',
            text: '把监听器挂在父节点上、靠事件冒泡统一处理，比给每个子节点都挂一个监听器更省内存 —— 而且动态插入的子节点自动生效。',
         },
      ],
      problems: [
         {
            baseId: 4501,
            pid: 7501,
            title: '实现一个事件委托列表',
            difficulty: 'medium',
            totalScore: 100,
         },
         {
            baseId: 4502,
            pid: 7502,
            title: '手写一个简版 querySelectorAll',
            difficulty: 'hard',
            totalScore: 150,
         },
         {
            baseId: 4503,
            pid: 7503,
            title: '阻止默认行为与冒泡',
            difficulty: 'easy',
            totalScore: 80,
         },
         {
            baseId: 4504,
            pid: 7504,
            title: '节点的创建、插入与移除',
            difficulty: 'easy',
            totalScore: 80,
         },
      ],
   },
   {
      id: 302,
      slug: 'bom',
      title: 'BOM',
      summary: '浏览器对象模型：location、history、storage',
      content: [
         {
            type: 'paragraph',
            text: 'BOM 没有正式规范，各浏览器实现有差异。这篇只讲稳定可用的那一部分。',
         },
      ],
      problems: [
         {
            baseId: 4601,
            pid: 7601,
            title: '用 history 实现无刷新筛选',
            difficulty: 'medium',
            totalScore: 100,
         },
         {
            baseId: 4602,
            pid: 7602,
            title: 'localStorage 的容量与序列化',
            difficulty: 'easy',
            totalScore: 80,
         },
      ],
   },
   {
      id: 303,
      slug: 'async',
      title: '异步',
      summary: '事件循环、Promise 与并发控制',
      content: [
         {
            type: 'paragraph',
            text: '理解事件循环的关键是分清宏任务与微任务的插入位置。',
         },
         {
            type: 'code',
            lang: 'js',
            text: 'console.log(1);\nsetTimeout(() => console.log(2));\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n// 1 4 3 2',
         },
      ],
      problems: [
         {
            baseId: 4301,
            pid: 7301,
            title: '手写 Promise.all',
            difficulty: 'hard',
            totalScore: 150,
         },
         {
            baseId: 4302,
            pid: 7302,
            title: '限制并发数的任务队列',
            difficulty: 'hard',
            totalScore: 150,
         },
         {
            baseId: 4303,
            pid: 7303,
            title: '判断一段代码的输出顺序',
            difficulty: 'medium',
            totalScore: 100,
         },
         {
            baseId: 4304,
            pid: 7304,
            title: 'async / await 的错误处理',
            difficulty: 'medium',
            totalScore: 100,
         },
         {
            baseId: 4305,
            pid: 7305,
            title: '取消一个进行中的请求',
            difficulty: 'hard',
            totalScore: 120,
         },
      ],
   },
   {
      id: 401,
      slug: 'git-commit',
      title: 'Git 提交规范',
      summary: '一个提交只做一件事',
      content: [
         {
            type: 'paragraph',
            text: '提交信息是写给半年后的自己看的。标题写清"做了什么"，正文写清"为什么"。',
         },
      ],
      problems: [
         {
            baseId: 4701,
            pid: 7701,
            title: '重写一条描述不清的提交信息',
            difficulty: 'easy',
            totalScore: 80,
         },
      ],
   },
];

const TOPICS: LearningTopic[] = [
   {
      id: 1,
      courseId: 1,
      slug: 'html',
      name: 'HTML',
      description:
         '网页的结构层。先弄清文档是怎么被解析成一棵树的，再谈标签怎么写。',
      weight: 10,
      prerequisites: [],
      articleIds: [101, 102, 104],
   },
   {
      id: 2,
      courseId: 1,
      slug: 'css',
      name: 'CSS',
      description:
         '网页的表现层。布局是这里最容易卡住的地方，所以单独拆成一篇。',
      weight: 20,
      prerequisites: [1],
      articleIds: [201, 202, 203],
   },
   {
      id: 3,
      courseId: 1,
      slug: 'javascript',
      name: 'JavaScript',
      description:
         '网页的行为层。DOM 与 BOM 是这个专题下的两篇文章，不是两个独立专题。',
      weight: 30,
      prerequisites: [1, 2],
      // 104「浏览器调试工具」同时被 HTML 专题引用：它不属于任何一个专题
      articleIds: [301, 302, 303, 104],
   },
];

const COURSES: LearningCourse[] = [
   {
      id: 1,
      slug: 'frontend-basics',
      name: '前端基础',
      description: '从文档结构讲到事件循环，把浏览器这一侧的基础补齐。',
      weight: 10,
      status: 'published',
   },
   {
      id: 2,
      slug: 'frontend-engineering',
      name: '前端工程化',
      description: '构建、包管理与发布流程。还没有编排专题。',
      weight: 20,
      status: 'draft',
   },
];

/* 规则 */

export function articleProgress(article: LearningArticle): ArticleProgress {
   const total = article.problems.length;
   const done = article.problems.filter(
      (p) => p.unavailable || COMPLETED_BASE_IDS.has(p.baseId),
   ).length;
   const isReadingOnly = total === 0;
   const progress = isReadingOnly ? 0 : done / total;
   const lastOpenedAt = ARTICLE_VISITS[article.id] ?? null;

   return {
      total,
      done,
      progress,
      // 向下取整：99.5% 显示 99%，避免「显示 100% 却拿不到对勾」
      percent: Math.floor(progress * 100),
      completed: !isReadingOnly && progress === 1,
      isReadingOnly,
      read: lastOpenedAt !== null,
      lastOpenedAt,
   };
}

export function isProblemCompleted(baseId: number): boolean {
   return COMPLETED_BASE_IDS.has(baseId);
}

export function topicProgress(topic: LearningTopic): TopicProgress {
   const articles = articlesOfTopic(topic);
   const states = articles.map(articleProgress);
   const problemCount = states.reduce((sum, s) => sum + s.total, 0);
   const doneProblems = states.reduce((sum, s) => sum + s.done, 0);
   const finishedArticles = states.filter(
      (s) => s.completed || (s.isReadingOnly && s.read),
   ).length;
   const lastOpenedAt = states.reduce<string | null>(
      (latest, s) =>
         s.lastOpenedAt && (!latest || s.lastOpenedAt > latest)
            ? s.lastOpenedAt
            : latest,
      null,
   );

   return {
      articleCount: articles.length,
      finishedArticles,
      problemCount,
      doneProblems,
      percent:
         problemCount === 0
            ? 0
            : Math.floor((doneProblems / problemCount) * 100),
      completed: articles.length > 0 && finishedArticles === articles.length,
      lastOpenedAt,
   };
}

export function courseProgress(course: LearningCourse): CourseProgress {
   const topics = courseTopics(course.id);
   const states = topics.map(topicProgress);
   const problemCount = states.reduce((sum, s) => sum + s.problemCount, 0);
   const doneProblems = states.reduce((sum, s) => sum + s.doneProblems, 0);
   const completedAt = COURSE_COMPLETIONS[course.id] ?? null;

   return {
      topicCount: topics.length,
      finishedTopics: states.filter((s) => s.completed).length,
      problemCount,
      doneProblems,
      percent:
         problemCount === 0
            ? 0
            : Math.floor((doneProblems / problemCount) * 100),
      // 单向：有完成记录就永远算完成，不因为专题新增文章而回退
      completed:
         completedAt !== null ||
         (topics.length > 0 && states.every((s) => s.completed)),
      completedAt,
   };
}

// 发布校验：0 专题的课程可以存草稿，但不能发布
export function canPublishCourse(course: LearningCourse): boolean {
   return courseTopics(course.id).length > 0;
}

export function sortTopicsByPrecedence(
   topics: LearningTopic[],
): LearningTopic[] {
   const byId = new Map(topics.map((t) => [t.id, t]));
   const indegree = new Map<number, number>(topics.map((t) => [t.id, 0]));

   for (const topic of topics) {
      for (const pre of topic.prerequisites) {
         if (byId.has(pre)) {
            indegree.set(topic.id, (indegree.get(topic.id) ?? 0) + 1);
         }
      }
   }

   const compare = (a: LearningTopic, b: LearningTopic) =>
      a.weight - b.weight || a.id - b.id;

   const ready = topics
      .filter((t) => (indegree.get(t.id) ?? 0) === 0)
      .sort(compare);
   const sorted: LearningTopic[] = [];

   while (ready.length > 0) {
      const current = ready.shift()!;
      sorted.push(current);

      for (const topic of topics) {
         if (!topic.prerequisites.includes(current.id)) continue;
         const left = (indegree.get(topic.id) ?? 0) - 1;
         indegree.set(topic.id, left);
         if (left === 0) {
            ready.push(topic);
            ready.sort(compare);
         }
      }
   }

   if (sorted.length !== topics.length) {
      throw new Error('[learning] 专题先后关系里存在环，拓扑排序失败');
   }

   return sorted;
}

/* 对外的读取接口 */

export function useLearningCourses(): LearningCourse[] {
   return COURSES;
}

export function useLearningCourse(
   courseId: number | string,
): LearningCourse | undefined {
   const id = Number(courseId);
   return COURSES.find((c) => c.id === id);
}

export function courseTopics(courseId: number | string): LearningTopic[] {
   const id = Number(courseId);
   return sortTopicsByPrecedence(TOPICS.filter((t) => t.courseId === id));
}

export function useLearningTopics(): LearningTopic[] {
   return sortTopicsByPrecedence(TOPICS);
}

export function useLearningTopic(
   topicId: number | string,
): LearningTopic | undefined {
   const id = Number(topicId);
   return TOPICS.find((t) => t.id === id);
}

export function useLearningArticles(): LearningArticle[] {
   return ARTICLES;
}

export function useLearningArticle(
   articleId: number | string,
): LearningArticle | undefined {
   const id = Number(articleId);
   return ARTICLES.find((a) => a.id === id);
}

export function articlesOfTopic(topic: LearningTopic): LearningArticle[] {
   return topic.articleIds
      .map((id) => ARTICLES.find((a) => a.id === id))
      .filter((a): a is LearningArticle => a !== undefined);
}

// 一篇文章被哪些专题引用：可能 0 个，也可能多个
export function topicsOfArticle(articleId: number | string): LearningTopic[] {
   const id = Number(articleId);
   return TOPICS.filter((t) => t.articleIds.includes(id));
}

export function useLearningTopicArticle(
   topicId: number | string,
   articleId: number | string,
):
   | { topic: LearningTopic; course?: LearningCourse; article: LearningArticle }
   | undefined {
   const topic = useLearningTopic(topicId);
   if (!topic) return undefined;
   const article = articlesOfTopic(topic).find(
      (a) => a.id === Number(articleId),
   );
   if (!article) return undefined;
   return { topic, course: useLearningCourse(topic.courseId), article };
}

export function useRecentLearning(limit = 3): RecentLearningItem[] {
   return TOPICS.map((topic) => {
      const course = useLearningCourse(topic.courseId);
      return {
         ...topicProgress(topic),
         courseId: topic.courseId,
         courseName: course?.name ?? '',
         topicId: topic.id,
         topicName: topic.name,
      };
   })
      .filter((item) => item.lastOpenedAt !== null)
      .sort((a, b) => (b.lastOpenedAt! < a.lastOpenedAt! ? -1 : 1))
      .slice(0, limit);
}
