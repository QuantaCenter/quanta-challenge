import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import prisma from '@challenge/database';

const SALT_ROUNDS = 10;

const ADMIN_NAME = process.env.E2E_ADMIN_NAME ?? 'e2e-admin';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@quanta.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password';

const TAGS = ['动态规划', 'WebContainer', 'HTTP 服务', '入门'];
const PROBLEMS = [
   {
      title: 'E2E - 两数之和',
      difficulty: 'easy' as const,
      totalScore: 100,
      detail:
         '给定一个整数数组与目标值，返回数组中两个数之和等于目标值的下标。\n\n这是端到端测试注入的示例题目。',
   },
   {
      title: 'E2E - 最长递增子序列',
      difficulty: 'medium' as const,
      totalScore: 150,
      detail: '求序列的最长严格递增子序列长度。\n\n这是端到端测试注入的示例题目。',
   },
   {
      title: 'E2E - 编辑距离',
      difficulty: 'hard' as const,
      totalScore: 200,
      detail: '计算两个字符串的最小编辑距离。\n\n这是端到端测试注入的示例题目。',
   },
   {
      title: 'E2E - Hello REST API',
      difficulty: 'easy' as const,
      totalScore: 80,
      detail: '实现一个返回 `{"message":"hello"}` 的 HTTP 接口。\n\n这是端到端测试注入的后端服务示例题目。',
      problemType: 'backend_service' as const,
   },
];

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
   for (const p of PROBLEMS) {
      const existing = await prisma.problems.findFirst({ where: { title: p.title } });
      if (existing) {
         if (!firstPid) firstPid = existing.pid;
         continue;
      }
      // Problems.baseId 外键指向 BaseProblems：先建基础题记录，再把版本题挂上去
      const base = await prisma.baseProblems.create({
         data: { authorId: adminId },
      });
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
            tags: { connect: tagNames.map((t) => ({ tid: t.tid })) },
         },
      });
      await prisma.baseProblems.update({
         where: { id: base.id },
         data: { currentPid: created.pid },
      });
      if (!firstPid) firstPid = created.pid;
   }
   console.log(`✅ 已发布题目就绪（首个 pid=${firstPid}）`);
   return firstPid;
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
   const problemPid = await ensureProblems(admin.id);
   const achievementId = await ensureAchievements(admin.id);
   await ensureNotifications(admin.id);
   await ensureJudgeRecords(admin.id, problemPid);
   await ensureCheckins([admin, ...users]);

   fs.writeFileSync(
      path.resolve(import.meta.dirname, '../.e2e-ids.json'),
      JSON.stringify({ problemPid, achievementId }, null, 2),
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
