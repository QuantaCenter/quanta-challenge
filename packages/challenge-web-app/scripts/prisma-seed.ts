import prisma from '@challenge/database';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveLocalStorePath } from '@challenge/shared/utils/local-store-path';
import { hashPassword } from '../server/utils/password.ts';
import {
   DEFAULT_ACHIEVEMENTS,
   type IAchievementLoaderSeed,
} from './achievement-seed-data.ts';

/**
 * 写入超级管理员账号（首次部署用）。
 *
 * 注意：早期版本在"管理员已存在"时直接 `return` 结束整个脚本，
 * 这样后来新增的种子（例如基础成就）就永远不会被执行。现在改成独立的
 * `seedAdminUser()`，让每个种子段落互不阻塞。
 */
async function seedAdminUser() {
   const account = process.env.SUPER_ACCOUNT || '超级管理员';
   const password = process.env.SUPER_PASSWORD || 'adminpassword';
   const email = process.env.SUPER_EMAIL || 'admin@admin.com';
   const passwordHash = await hashPassword(password);

   if (!process.env.SUPER_PASSWORD) {
      console.warn(
         '⚠️  未设置 SUPER_PASSWORD，正在使用内置的默认口令。' +
            '生产环境请务必通过环境变量提供强口令。',
      );
   }

   const existingUser = await prisma.user.findUnique({
      where: { name: account },
   });

   if (existingUser) {
      console.log(
         `ℹ️ Admin user "${account}" already exists. Skipping seeding.`,
      );
      return;
   }

   await prisma.user.upsert({
      where: { name: 'stillsoda' },
      update: {},
      create: {
         name: account,
         displayName: '超级管理员',
         role: 'SUPER_ADMIN',
         auths: {
            create: {
               provider: 'EMAIL',
               password: passwordHash,
               providerId: email,
            },
         },
      },
   });

   // 不打印口令：容器日志在共用实验环境中通常可被多人读取
   console.log(
      `✅ Seeded admin user:\n\n  - Account: ${account}\n  - Email: ${email}\n`,
   );
}

/** 依赖数据加载器：`name` 上没有唯一约束，只能先查后建 */
async function upsertLoader(loader: IAchievementLoaderSeed) {
   const existing = await prisma.achievementDepDataLoader.findFirst({
      where: { name: loader.name },
   });

   if (existing) {
      const isSame =
         existing.sql === loader.sql &&
         existing.type === loader.type &&
         existing.isList === loader.isList &&
         existing.description === loader.description;

      if (isSame) return existing;

      return await prisma.achievementDepDataLoader.update({
         where: { id: existing.id },
         data: {
            description: loader.description,
            sql: loader.sql,
            type: loader.type,
            isList: loader.isList,
         },
      });
   }

   return await prisma.achievementDepDataLoader.create({
      data: {
         name: loader.name,
         description: loader.description,
         sql: loader.sql,
         type: loader.type,
         isList: loader.isList,
      },
   });
}

/**
 * 写入基础成就。
 *
 * 幂等：成就按唯一名 `name` upsert，图片与加载器先查后建，关联关系用复合唯一键 upsert。
 * 每次容器启动都会执行，因此**本文件是这些成就的事实来源**：改描述/分值/脚本/加载器 SQL
 * 后重新部署即可生效（详见 achievement-seed-data.ts 顶部的约定说明）。
 */
async function seedAchievements() {
   const storeDir = resolveLocalStorePath();
   await mkdir(storeDir, { recursive: true });

   for (const def of DEFAULT_ACHIEVEMENTS) {
      // 1) 徽章文件落到 local_store —— /api/static/<name> 读的就是这里
      const badgePath = join(storeDir, def.badgeFileName);
      await writeFile(badgePath, def.badgeSvg, 'utf8');

      // 2) images 记录（name 无唯一约束，先查后建）
      let image = await prisma.image.findFirst({
         where: { name: def.badgeFileName },
      });
      if (!image) {
         image = await prisma.image.create({
            data: { name: def.badgeFileName, refCount: 1 },
         });
      }

      // 3) 依赖数据加载器
      const loaderIds: number[] = [];
      for (const loader of def.loaders) {
         const row = await upsertLoader(loader);
         loaderIds.push(row.id);
      }

      // 4) 成就本体
      const achievement = await prisma.achievement.upsert({
         where: { name: def.name },
         update: {
            description: def.description,
            score: def.score,
            badgeImageId: image.id,
         },
         create: {
            name: def.name,
            description: def.description,
            score: def.score,
            badgeImageId: image.id,
         },
      });

      // 5) 判定脚本
      await prisma.achievementValidateScript.upsert({
         where: { achievementId: achievement.id },
         update: { script: def.script },
         create: { achievementId: achievement.id, script: def.script },
      });

      // 6) 成就 ←→ 依赖数据加载器
      for (const loaderId of loaderIds) {
         await prisma.achievementDependencyData.upsert({
            where: {
               achievementId_achievementDepDataLoaderId: {
                  achievementId: achievement.id,
                  achievementDepDataLoaderId: loaderId,
               },
            },
            update: {},
            create: {
               achievementId: achievement.id,
               achievementDepDataLoaderId: loaderId,
            },
         });
      }

      // 7) 签到成就标记（决定它会不会出现在签到处）
      if (def.isCheckinAchievement) {
         await prisma.checkinAchievement.upsert({
            where: { achievementId: achievement.id },
            update: {},
            create: { achievementId: achievement.id },
         });
      }

      console.log(
         `✅ 成就「${def.name}」就绪（${def.score} 分 / 依赖 ${def.loaders.length} 个加载器）`,
      );
   }

   console.log(`✅ 基础成就种子完成，共 ${DEFAULT_ACHIEVEMENTS.length} 个`);
}

async function main() {
   await prisma.$connect();

   await seedAdminUser();
   await seedAchievements();
}

main()
   .catch((e) => {
      console.error('❌ Some Error happened when seeding the database.\n', e);
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
