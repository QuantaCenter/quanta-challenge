import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 解析本包实际安装的 @prisma/client 目录。
 *
 * 这里刻意不拼接 node_modules/.pnpm 下的目录名：pnpm 会在目录名里写入依赖组合的短哈希
 * （例如 @prisma+client@6.12.0_prism_852c2f508fa5d5c04099a9cee124d4df），该哈希由 pnpm 版本
 * 与 peer 依赖组合共同决定，换机器、换 pnpm 版本或升级依赖都会变化，硬编码必然失效。
 */
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

/**
 * 把 Windows 路径统一成正斜杠形式：Node 的 require 与 import 都接受正斜杠，
 * 而反斜杠在被写进 JS 源码时会被当作转义序列。
 */
const toPosix = (p: string) => p.replace(/\\/g, '/');

const replacePrismaClientPath = async (
   filePath: string,
   replacement: string,
) => {
   const original = await fs.readFile(filePath, 'utf-8');

   // 只有当路径已经指向当前安装位置时，才是真正的「无需处理」。
   // 不能简单地以「是否已含绝对路径」来跳过：仓库目录被移动/改名后，文件里留着的是
   // **旧的**绝对路径，若跳过则构建产物会带上失效路径，运行期报：
   //   Cannot find module '<旧路径>/.prisma/client/default'
   // （实测症状：页面能打开，但任何走数据库的接口都 500）
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

   // @prisma/client 内部 require('.prisma/client/...')，而生成的客户端位于
   // <pnpm 包目录>/node_modules/.prisma/client，与 @prisma/client 同级（不在 @prisma/ 下），
   // 因此需要从 `.../node_modules/@prisma/client` 再上跳一级到 `.../node_modules`。
   //
   // 注意：必须使用「正斜杠」形式。被改写的是 JS 源码，替换进去的字符串会被 JS 解析器
   // 再处理一次；Windows 反斜杠会被当成转义序列（\n、\p、\c ...）而破坏路径。
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

/**
 * Nuxt 会忽略 .nuxtignore 中以 # 开头的行。
 * 仓库中该文件以注释形式保存，构建时需要取消注释才能生效；这里做成幂等的，
 * 重复构建不会二次改写文件内容（原实现每次构建都会再跑一遍 replace，导致文件持续漂移）。
 */
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
