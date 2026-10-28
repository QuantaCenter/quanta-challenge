import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '@challenge/database';
import { createPng } from '../helpers/png';

const SALT_ROUNDS = 10;

const ADMIN_NAME = process.env.E2E_ADMIN_NAME ?? 'e2e-admin';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@quanta.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password';

const TAGS = ['动态规划', 'WebContainer', 'HTTP 服务', '入门'];
/** 封面图类型：real = 写入真实 PNG 文件（正常显示）；broken = 只有数据库记录、无文件（裂图）。 */
type CoverKind = 'real' | 'broken';
const PROBLEMS: {
   title: string;
   difficulty: 'easy' | 'medium' | 'hard';
   totalScore: number;
   detail: string;
   problemType?: 'frontend' | 'backend_service';
   cover: CoverKind;
   coverColor?: [number, number, number];
}[] = [
   {
      title: 'E2E - 两数之和',
      difficulty: 'easy',
      totalScore: 100,
      detail:
         '给定一个整数数组与目标值，返回数组中两个数之和等于目标值的下标。\n\n这是端到端测试注入的示例题目。',
      cover: 'real',
      coverColor: [91, 141, 239],
   },
   {
      title: 'E2E - 最长递增子序列',
      difficulty: 'medium',
      totalScore: 150,
      detail: '求序列的最长严格递增子序列长度。\n\n这是端到端测试注入的示例题目。',
      cover: 'real',
      coverColor: [245, 166, 35],
   },
   {
      title: 'E2E - 编辑距离',
      difficulty: 'hard',
      totalScore: 200,
      detail: '计算两个字符串的最小编辑距离。\n\n这是端到端测试注入的示例题目。',
      cover: 'broken',
   },
   {
      title: 'E2E - Hello REST API',
      difficulty: 'easy',
      totalScore: 80,
      detail: '实现一个返回 `{"message":"hello"}` 的 HTTP 接口。\n\n这是端到端测试注入的后端服务示例题目。',
      problemType: 'backend_service',
      cover: 'broken',
   },
];

/** Web 应用静态图片目录：/api/static/<文件名> 从这里读（见 resolveLocalStorePath）。 */
const LOCAL_STORE_DIR = path.resolve(
   import.meta.dirname,
   '../../packages/challenge-web-app/local_store',
);

/**
 * 创建封面图 Image 记录。
 * real：生成 PNG 写入 local_store，文件名与 Image.name 一致（<uuid>.png），可正常显示；
 * broken：只建记录不写文件，前端访问 /api/static/ 404，展示裂图效果。
 */
async function createCover(kind: CoverKind, label: string, color?: [number, number, number]) {
   if (kind === 'broken') {
      return prisma.image.create({
         data: { name: `e2e-cover-missing-${label}.png` },
      });
   }
   const fileId = crypto.randomUUID();
   const fileName = `${fileId}.png`;
   await fsp.mkdir(LOCAL_STORE_DIR, { recursive: true });
   await fsp.writeFile(
      path.join(LOCAL_STORE_DIR, fileName),
      createPng(640, 360, color ?? [120, 120, 120]),
   );
   return prisma.image.create({
      data: { id: fileId, name: fileName },
   });
}

async function ensureAdmin() {
   const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
   const admin = await prisma.user.upsert({
      where: { name: ADMIN_NAME },
      update: { role: 'SUPER_ADMIN' },
      create: {
         name: ADMIN_NAME,
         displayName: 'E2E 管理员',
         role: 'SUPER_ADMIN',
         score: 1200,
         auths: {
            create: {
               provider: 'EMAIL',
               providerId: ADMIN_EMAIL,
               password: passwordHash,
            },
         },
      },
   });
   console.log(`✅ 管理员就绪: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);
   return admin;
}

async function ensureNormalUsers() {
   const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
   const users = [];
   for (let i = 1; i <= 5; i++) {
      const name = `e2e-user-${i}`;
      const email = `e2e-user-${i}@quanta.test`;
      const score = 600 - i * 90;
      const user = await prisma.user.upsert({
         where: { name },
         update: { score },
         create: {
            name,
            displayName: `E2E 测试用户 ${i}`,
            score,
            auths: {
               create: {
                  provider: 'EMAIL',
                  providerId: email,
                  password: passwordHash,
               },
            },
         },
      });
      await prisma.userStatistic.upsert({
         where: { userId: user.id },
         update: { score, passCount: 6 - i, correctRate: 1 - i * 0.15 },
         create: {
            userId: user.id,
            score,
            passCount: 6 - i,
            correctRate: 1 - i * 0.15,
         },
      });
      users.push(user);
   }
   console.log(`✅ 普通用户就绪: e2e-user-1 ~ e2e-user-5（含排行榜统计）`);
   return users;
}

async function ensureTags(adminId: string) {
   const colors = ['#5b8def', '#f5a623', '#7ed321', '#9b59b6'];
   for (let i = 0; i < TAGS.length; i++) {
      const existing = await prisma.tags.findFirst({ where: { name: TAGS[i] } });
      if (existing) continue;
      await prisma.tags.create({
         data: {
            name: TAGS[i],
            description: `E2E 测试标签：${TAGS[i]}`,
            color: colors[i % colors.length],
            creatorId: adminId,
         },
      });
   }
   console.log(`✅ 标签就绪: ${TAGS.join(' / ')}`);
}

async function ensureProblems(adminId: string) {
   const tagNames = await prisma.tags.findMany({ where: { name: { in: TAGS } } });
   let firstPid = 0;
   let firstBaseId = 0;
   for (const [i, p] of PROBLEMS.entries()) {
      const existing = await prisma.problems.findFirst({ where: { title: p.title } });
      if (existing) {
         if (!firstPid) {
            firstPid = existing.pid;
            firstBaseId = existing.baseId;
         }
         continue;
      }
      // Problems.baseId 外键指向 BaseProblems：先建基础题记录，再把版本题挂上去
      const base = await prisma.baseProblems.create({
         data: { authorId: adminId },
      });
      // 封面图：real 写真实 PNG 文件正常显示，broken 只建记录制造裂图
      const cover = await createCover(p.cover, `problem-${i}`, p.coverColor);
      const created = await prisma.problems.create({
         data: {
            baseId: base.id,
            title: p.title,
            detail: p.detail,
            difficulty: p.difficulty,
            totalScore: p.totalScore,
            status: 'published',
            problemType: p.problemType ?? 'frontend',
            judgeUploadPath: 'e2e/placeholder',
            coverImageId: cover.id,
            tags: { connect: tagNames.map((t) => ({ tid: t.tid })) },
         },
      });
      await prisma.baseProblems.update({
         where: { id: base.id },
         data: { currentPid: created.pid },
      });
      if (!firstPid) {
         firstPid = created.pid;
         firstBaseId = base.id;
      }
   }
   console.log(`✅ 已发布题目就绪（首个 pid=${firstPid}）`);
   return { problemPid: firstPid, problemBaseId: firstBaseId };
}

async function ensureLearning(adminId: string, problemBaseId: number) {
   let article = await prisma.learningArticle.findFirst({
      where: { title: 'E2E - HTML 入门文章' },
   });
   if (!article) {
      article = await prisma.learningArticle.create({
         data: {
            authorId: adminId,
            title: 'E2E - HTML 入门文章',
            summary: '用于验证阅读、练习与实时 Playground 的学习文章。',
            source: `# HTML 入门

阅读正文后完成练习，并修改下面的示例。

<Problem baseId={${problemBaseId}} />

<Playground id="11111111-1111-4111-8111-111111111111" />`,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            problems: {
               create: { baseId: problemBaseId, sort: 0 },
            },
            playgrounds: {
               create: {
                  id: '11111111-1111-4111-8111-111111111111',
                  title: '修改问候语',
                  html: '<h1>Hello, Quanta!</h1>',
                  css: 'h1 { color: rebeccapurple; }',
                  js: 'document.querySelector(\"h1\").addEventListener(\"click\", e => e.target.textContent = \"你好！\")',
               },
            },
         },
      });
   }

   let topic = await prisma.learningTopic.findFirst({
      where: { title: 'E2E - 前端基础专题' },
   });
   if (!topic) {
      topic = await prisma.learningTopic.create({
         data: {
            authorId: adminId,
            title: 'E2E - 前端基础专题',
            description: '用于端到端测试的学习专题。',
            status: 'PUBLISHED',
            publishedAt: new Date(),
            articles: {
               create: { articleId: article.id, sort: 0 },
            },
         },
      });
   }

   await prisma.learningArticleRead.deleteMany({
      where: { userId: adminId, articleId: article.id },
   });
   await prisma.learningTopicVisit.deleteMany({
      where: { userId: adminId, topicId: topic.id },
   });
   console.log('✅ 学习专题、文章与 Playground 就绪');
   return { learningTopicId: topic.id, learningArticleId: article.id };
}

async function ensureAchievements(adminId: string) {
   const defs = [
      { name: 'E2E - 初出茅庐', description: '完成第一道题目', score: 50 },
      { name: 'E2E - 百炼成钢', description: '通过十道题目', score: 100 },
   ];
   let firstId = 0;
   for (const def of defs) {
      let achievement = await prisma.achievement.findUnique({ where: { name: def.name } });
      if (!achievement) {
         const badge = await prisma.image.create({
            data: { name: `e2e-badge-${def.name}` },
         });
         achievement = await prisma.achievement.create({
            data: {
               name: def.name,
               description: def.description,
               score: def.score,
               authorId: adminId,
               badgeImageId: badge.id,
            },
         });
      }
      if (!firstId) firstId = achievement.id;
      await prisma.userAchievement.upsert({
         where: { userId_achievementId: { userId: adminId, achievementId: achievement.id } },
         update: {},
         create: {
            userId: adminId,
            achievementId: achievement.id,
            progress: 1,
         },
      });
   }
   console.log(`✅ 成就就绪（首个 id=${firstId}，管理员已解锁）`);
   return firstId;
}

async function ensureNotifications(adminId: string) {
   const items = [
      { type: 'ANNOUNCEMENT' as const, title: 'E2E 平台公告', content: '这是一条端到端测试注入的系统公告。' },
      { type: 'JUDGE' as const, title: 'E2E 判题完成', content: '你提交的「两数之和」已通过全部测试点。' },
      { type: 'ACHIEVEMENT' as const, title: 'E2E 成就解锁', content: '恭喜解锁成就「初出茅庐」。' },
   ];
   for (const item of items) {
      const existing = await prisma.notification.findFirst({
         where: { userId: adminId, title: item.title },
      });
      if (existing) continue;
      await prisma.notification.create({
         data: { userId: adminId, ...item },
      });
   }
   console.log('✅ 通知就绪（公告 / 判题 / 成就 各一条）');
}

async function ensureJudgeRecords(adminId: string, problemPid: number) {
   const results = ['success', 'success', 'failed'] as const;
   for (let i = 0; i < results.length; i++) {
      const existing = await prisma.judgeRecords.findFirst({
         where: { userId: adminId, problemId: problemPid, type: 'judge', score: 100 - i * 100 },
      });
      if (existing) continue;
      await prisma.judgeRecords.create({
         data: {
            problemId: problemPid,
            userId: adminId,
            info: {
               message: results[i] === 'success' ? '全部测试点通过' : '测试点 3 运行超时',
               e2e: true,
            },
            result: results[i],
            type: 'judge',
            score: 100 - i * 100,
         },
      });
   }
   console.log('✅ 判题记录就绪（通过 / 通过 / 失败）');
}

async function ensureCheckins(users: { id: string }[]) {
   const today = new Date();
   today.setHours(0, 0, 0, 0);
   for (const user of users) {
      await prisma.dailyCheckin.upsert({
         where: { userId_date: { userId: user.id, date: today } },
         update: {},
         create: { userId: user.id, date: today },
      });
   }
   console.log('✅ 每日签到就绪');
}

async function main() {
   await prisma.$connect();

   const admin = await ensureAdmin();
   const users = await ensureNormalUsers();
   await ensureTags(admin.id);
   const { problemPid, problemBaseId } = await ensureProblems(admin.id);
   const learningIds = await ensureLearning(admin.id, problemBaseId);
   const achievementId = await ensureAchievements(admin.id);
   await ensureNotifications(admin.id);
   await ensureJudgeRecords(admin.id, problemPid);
   await ensureCheckins([admin, ...users]);

   fs.writeFileSync(
      path.resolve(import.meta.dirname, '../.e2e-ids.json'),
      JSON.stringify({ problemPid, achievementId, ...learningIds }, null, 2),
   );
   console.log('✅ 动态 id 已写入 .e2e-ids.json');
}

main()
   .catch((e) => {
      console.error('❌ E2E 数据注入失败：\n', e);
      process.exitCode = 1;
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
