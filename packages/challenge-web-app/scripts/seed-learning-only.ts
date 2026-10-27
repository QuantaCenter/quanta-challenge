import prisma from '@challenge/database';
import { seedLearningContent } from './learning-seed.ts';

/**
 * 单独跑学习内容种子（课程 / 专题 / 文章）。
 *
 * 平时的入口是 `scripts/prisma-seed.ts`（容器启动时会跑），
 * 这个文件只是让「只补一次学习内容」不用跑全套种子：
 *   node --experimental-strip-types scripts/seed-learning-only.ts
 */
async function main() {
   await prisma.$connect();
   await seedLearningContent();
}

main()
   .catch((error) => {
      console.error('❌ 学习内容种子失败\n', error);
      process.exitCode = 1;
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
