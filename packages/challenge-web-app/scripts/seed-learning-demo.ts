import prisma from '@challenge/database';

const ARTICLE_IDS = {
   markdown: '8e41bca2-f5ec-4a04-8c7c-f64c16c5a101',
   playground: '8e41bca2-f5ec-4a04-8c7c-f64c16c5a102',
   interaction: '8e41bca2-f5ec-4a04-8c7c-f64c16c5a103',
   practice: '8e41bca2-f5ec-4a04-8c7c-f64c16c5a104',
} as const;

const TOPIC_IDS = {
   complete: '9f52cdb3-a6fd-4b15-9d8d-a75d27d6b201',
   labs: '9f52cdb3-a6fd-4b15-9d8d-a75d27d6b202',
} as const;

const LEGACY_ARTICLE_IDS = [
   'cmlearndemoarticle00000001',
   'cmlearndemoarticle00000002',
   'cmlearndemoarticle00000003',
   'cmlearndemoarticle00000004',
];
const LEGACY_TOPIC_IDS = [
   'cmlearndemotopic000000001',
   'cmlearndemotopic000000002',
];

const PLAYGROUND_IDS = {
   card: '11111111-1111-4111-8111-111111111101',
   counter: '11111111-1111-4111-8111-111111111102',
   theme: '11111111-1111-4111-8111-111111111103',
} as const;

async function main() {
   const author = await prisma.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
   });
   if (!author) throw new Error('本地数据库中没有管理员账号');

   const problems = await prisma.baseProblems.findMany({
      where: { CurrentProblem: { status: 'published' } },
      orderBy: { id: 'asc' },
      take: 3,
      select: {
         id: true,
         CurrentProblem: { select: { title: true } },
      },
   });
   if (problems.length < 3) {
      throw new Error('至少需要 3 道已发布题目才能生成完整演示数据');
   }
   const [problemOne, problemTwo, problemThree] = problems;

   await prisma.$transaction(async (tx) => {
      const articleIds = [...Object.values(ARTICLE_IDS), ...LEGACY_ARTICLE_IDS];
      const topicIds = [...Object.values(TOPIC_IDS), ...LEGACY_TOPIC_IDS];
      await tx.learningTopicVisit.deleteMany({
         where: { topicId: { in: topicIds } },
      });
      await tx.learningTopic.deleteMany({
         where: { id: { in: topicIds } },
      });
      await tx.learningArticleRead.deleteMany({
         where: { articleId: { in: articleIds } },
      });
      await tx.learningArticle.deleteMany({
         where: { id: { in: articleIds } },
      });

      const publishedAt = new Date();
      await tx.learningArticle.create({
         data: {
            id: ARTICLE_IDS.markdown,
            authorId: author.id,
            title: '示例：Markdown 排版能力',
            summary: '展示标题、列表、引用、行内代码、代码块和安全的原生 HTML 处理。',
            status: 'PUBLISHED',
            publishedAt,
            source: `# 一篇完整的 Markdown 文章

这段正文包含 **粗体**、*斜体*、\`行内代码\` 和 [外部链接](https://example.com)。

## 学习目标

- 理解语义化结构
- 掌握常见 Markdown 排版
- 查看代码高亮与复制按钮

> 提示：文章中的原生 HTML 会被安全地显示为代码，不会直接执行。

\`\`\`html
<main class="card">
  <h1>Hello Quanta</h1>
  <p>保持结构清晰。</p>
</main>
\`\`\`

\`\`\`css
.card {
  display: grid;
  gap: 1rem;
  padding: 2rem;
}
\`\`\`

### 阅读完成

滚动到这里后，页面底部的“标记为已读”按钮会解锁。`,
         },
      });

      await tx.learningArticle.create({
         data: {
            id: ARTICLE_IDS.playground,
            authorId: author.id,
            title: '示例：CSS 卡片实时 Playground',
            summary: '文章中间穿插题目与 HTML/CSS/JS 实时编辑器。',
            status: 'PUBLISHED',
            publishedAt,
            source: `# 动手制作一张卡片

先完成下面这道题，随后直接修改示例中的 HTML、CSS 与 JavaScript。

<Problem baseId={${problemTwo!.id}} />

## 实时实验

<Playground id="${PLAYGROUND_IDS.card}" />

修改按钮颜色或卡片圆角，预览会在短暂防抖后自动刷新。`,
            problems: {
               create: { baseId: problemTwo!.id, sort: 0 },
            },
            playgrounds: {
               create: {
                  id: PLAYGROUND_IDS.card,
                  title: '可交互的个人卡片',
                  html: `<article class="profile">
  <span class="avatar">Q</span>
  <div><h2>Quanta 学员</h2><p>正在学习前端开发</p></div>
  <button>关注</button>
</article>`,
                  css: `body { background: #f4f4f5; }
.profile {
  display: flex; align-items: center; gap: 16px;
  max-width: 520px; padding: 24px; border-radius: 18px;
  background: white; box-shadow: 0 14px 40px #18181b22;
}
.avatar { display: grid; place-items: center; width: 56px; height: 56px;
  border-radius: 50%; background: #c1ef3f; font-size: 24px; font-weight: 800; }
.profile div { flex: 1; } h2, p { margin: 0; } p { color: #71717a; margin-top: 5px; }
button { border: 0; border-radius: 999px; padding: 10px 18px; cursor: pointer; }`,
                  js: `document.querySelector('button').addEventListener('click', event => {
  event.currentTarget.textContent =
    event.currentTarget.textContent === '已关注' ? '关注' : '已关注';
});`,
               },
            },
         },
      });

      await tx.learningArticle.create({
         data: {
            id: ARTICLE_IDS.interaction,
            authorId: author.id,
            title: '示例：多个 Playground 与 JavaScript 交互',
            summary: '同一篇文章放置多个独立实验，验证状态隔离、重置和 CSP 沙箱。',
            status: 'PUBLISHED',
            publishedAt,
            source: `# 两个相互独立的实验

## 计数器

<Playground id="${PLAYGROUND_IDS.counter}" />

## 主题切换

<Playground id="${PLAYGROUND_IDS.theme}" />

两个实验运行在独立的 sandbox iframe 中，无法访问本站页面和登录信息。`,
            playgrounds: {
               create: [
                  {
                     id: PLAYGROUND_IDS.counter,
                     title: '点击计数器',
                     html: '<button id="count">点击次数：0</button>',
                     css: `button { font-size: 20px; padding: 16px 24px; border: 0;
  border-radius: 12px; color: #111; background: #c1ef3f; cursor: pointer; }`,
                     js: `let count = 0;
document.querySelector('#count').addEventListener('click', event => {
  event.currentTarget.textContent = '点击次数：' + (++count);
});`,
                  },
                  {
                     id: PLAYGROUND_IDS.theme,
                     title: '明暗主题切换',
                     html: '<main><h2>主题预览</h2><button>切换主题</button></main>',
                     css: `body { transition: .25s; } main { text-align: center; padding: 40px; }
body.dark { color: white; background: #18181b; }
button { padding: 10px 18px; border-radius: 8px; cursor: pointer; }`,
                     js: `document.querySelector('button').addEventListener('click', () => {
  document.body.classList.toggle('dark');
});`,
                  },
               ],
            },
         },
      });

      await tx.learningArticle.create({
         data: {
            id: ARTICLE_IDS.practice,
            authorId: author.id,
            title: '示例：综合练习清单',
            summary: '一篇文章引用多道现有题目，用于验证去重、完成状态和百分比。',
            status: 'PUBLISHED',
            publishedAt,
            source: `# 综合练习

以下练习按文章中的教学顺序排列。

## 第一阶段

<Problem baseId={${problemOne!.id}} />

## 第二阶段

<Problem baseId={${problemThree!.id}} />

只有文章确认已读且两道题都满分通过，这篇文章才会达到 100%。`,
            problems: {
               create: [
                  { baseId: problemOne!.id, sort: 0 },
                  { baseId: problemThree!.id, sort: 1 },
               ],
            },
         },
      });

      await tx.learningTopic.create({
         data: {
            id: TOPIC_IDS.complete,
            authorId: author.id,
            title: '示例专题：完整学习模块体验',
            description: '覆盖文章阅读、题目作答、单/多 Playground、专题混排与 Dashboard 进度。',
            status: 'PUBLISHED',
            publishedAt,
            articles: {
               create: [
                  { articleId: ARTICLE_IDS.markdown, sort: 0 },
                  { articleId: ARTICLE_IDS.playground, sort: 1 },
                  { articleId: ARTICLE_IDS.interaction, sort: 3 },
                  { articleId: ARTICLE_IDS.practice, sort: 4 },
               ],
            },
            problems: {
               create: { baseId: problemThree!.id, sort: 2 },
            },
         },
      });

      await tx.learningTopic.create({
         data: {
            id: TOPIC_IDS.labs,
            authorId: author.id,
            title: '示例专题：互动实验精选',
            description: '只包含 Playground 文章，适合快速验证实时编辑、沙箱和重置。',
            status: 'PUBLISHED',
            publishedAt,
            articles: {
               create: [
                  { articleId: ARTICLE_IDS.playground, sort: 0 },
                  { articleId: ARTICLE_IDS.interaction, sort: 1 },
               ],
            },
         },
      });
   });

   console.log(`学习演示数据已写入（作者：${author.name}）`);
   console.log(`- 文章：4 篇`);
   console.log(`- 专题：2 个`);
   console.log(`- 引用题目：${problems.map((item) => `#${item.id} ${item.CurrentProblem?.title}`).join('、')}`);
}

main()
   .catch((error) => {
      console.error(error);
      process.exitCode = 1;
   })
   .finally(() => prisma.$disconnect());
