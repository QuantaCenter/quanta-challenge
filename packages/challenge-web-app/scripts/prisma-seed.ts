import prisma from '@challenge/database';
import { hashPassword } from '../server/utils/password.ts';
import { seedLearningContent } from './learning-seed.ts';

/** 写入超级管理员账号（首次部署用）；独立函数避免"已存在时 return"阻塞后续种子。 */
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

async function main() {
   await prisma.$connect();

   await seedAdminUser();
   // 学习内容（课程 / 专题 / 文章）也落库；依赖管理员账号已存在
   await seedLearningContent();
}

main()
   .catch((e) => {
      console.error('❌ Some Error happened when seeding the database.\n', e);
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
