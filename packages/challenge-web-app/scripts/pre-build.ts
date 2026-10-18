import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 解析本包实际安装的 @prisma/client 目录：pnpm 目录名含依赖组合短哈希，硬编码必然失效，须运行时探测。 */
const resolvePrismaClientDir = () => {
   const requireFromWebApp = createRequire(
      path.join(__dirname, '../package.json'),
   );

   const packageJsonPath = requireFromWebApp.resolve(
      '@prisma/client/package.json',
   );

   const clientDir = path.dirname(packageJsonPath);

   if (!clientDir.includes(`${path.sep}.pnpm${path.sep}`)) {
      // 非 pnpm 布局（npm/yarn 提升）下本补丁的前提不成立，直接跳过而不是让构建失败。
      console.warn(
         `⚠️  @prisma/client 不在 pnpm 布局中（${clientDir}），跳过 prisma client 补丁。`,
      );
      return null;
   }

   return clientDir;
};

/** 把 Windows 路径统一成正斜杠（写进 JS 源码时反斜杠会被当转义序列）。 */
const toPosix = (p: string) => p.replace(/\\/g, '/');

const replacePrismaClientPath = async (
   filePath: string,
   replacement: string,
) => {
   const original = await fs.readFile(filePath, 'utf-8');

   // 只有路径指向当前安装位置才是真正的"无需处理"（旧绝对路径须重打补丁自愈，否则运行期 Cannot find module）。
   if (original.includes(`'${replacement}`)) {
      console.log(`ℹ️  Already patched, skip: ${filePath}`);
      return;
   }

   // 第一次 replace 处理「尚未打过补丁」的形态；
   // 第二次 replace 处理「已打过补丁但指向旧绝对路径」的形态，使其自愈。
   const patched = original
      .replace(/'\.prisma\/client/g, `'${replacement}`)
      .replace(/'[^']*\/\.prisma\/client/g, `'${replacement}`);

   // 保留原文件权限位
   const { mode } = await fs.stat(filePath);
   await fs.writeFile(filePath, patched, { encoding: 'utf-8', mode });

   console.log(`✅ Patched: ${filePath}`);
};

const patchPrismaClient = async () => {
   const prismaClientDir = resolvePrismaClientDir();
   if (!prismaClientDir) return;

   // 生成的客户端位于 <pnpm 包目录>/node_modules/.prisma/client（与 @prisma/client 同级），故须上跳一级；必须用正斜杠（写入 JS 源码会被再解析，反斜杠成转义序列）。
   const replaceToPath = path.posix.join(
      toPosix(path.dirname(path.dirname(prismaClientDir))),
      '.prisma',
      'client',
   );

   const realPrismaClientDir = path.join(
      path.dirname(path.dirname(prismaClientDir)),
      '.prisma',
      'client',
   );

   if (!existsSync(realPrismaClientDir)) {
      console.warn(
         `⚠️  未找到已生成的 Prisma 客户端（${realPrismaClientDir}）。` +
            '请先执行 `pnpm --filter @challenge/database prisma:generate`，跳过补丁。',
      );
      return;
   }

   const targets = ['default.js', 'index-browser.js'].map((file) =>
      path.join(prismaClientDir, file),
   );

   for (const filePath of targets) {
      try {
         await fs.access(filePath);
      } catch {
         console.warn(`⚠️  Prisma client 文件不存在，跳过: ${filePath}`);
         continue;
      }
      await replacePrismaClientPath(filePath, replaceToPath);
   }
};

/** 幂等地取消 .nuxtignore 中的注释（Nuxt 忽略 # 行），重复构建不二次改写。 */
const patchNuxtIgnore = async () => {
   const nuxtIgnorePath = path.join(__dirname, '../.nuxtignore');

   let content: string;
   try {
      content = await fs.readFile(nuxtIgnorePath, 'utf-8');
   } catch {
      console.warn(`⚠️  .nuxtignore 不存在，跳过: ${nuxtIgnorePath}`);
      return;
   }

   const patched = content.replace(/^(\s*)#(?=\s*\S)/gm, '$1');

   if (patched === content) {
      console.log('ℹ️  .nuxtignore already enabled, skip.');
      return;
   }

   const { mode } = await fs.stat(nuxtIgnorePath);
   await fs.writeFile(nuxtIgnorePath, patched, { encoding: 'utf-8', mode });

   console.log(`✅ Patched: ${nuxtIgnorePath}`);
};

await patchPrismaClient();
await patchNuxtIgnore();
