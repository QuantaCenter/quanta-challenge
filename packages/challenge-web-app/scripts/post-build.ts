import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve('.output/server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 产物断言：server 产物（.mjs）中不得存在「会同时出现两条 fileURLToPath 声明」的形态。
//
// 背景（sha-7003a89 / sha-6480a10 发布失败、web-app 反复回滚的根因）：
// CJS 依赖（pino / ioredis / standard-as-callback 等）被内联进 bundle 后，代码里的
// `__dirname` 会触发两套注入机制并存——
//   1. Nitro 注入前导 `import { fileURLToPath } from 'url'` + `const __dirname = ...`；
//   2. rollup 在 ESM 化时从依赖图提升 `import { fileURLToPath } from 'node:url'`；
// 两条同名导入在同一作用域即抛
//   SyntaxError: Identifier 'fileURLToPath' has already been declared
// 容器启动第一毫秒就退出，健康检查永远 fetch failed。
//
// 本脚本旧版的做法是"发现 __dirname 就再注入一份 shim"，恰好制造了重复声明的另一半，
// 属于把崩溃往后挪而不是修复。现改为 fail fast：命中任一危险形态直接让构建失败，
// 把包加进 nuxt.config.ts 的 nitro.externals.external（与 pino 同处理）后重跑。
// Docker 镜像构建（Dockerfile RUN pnpm build）与本地构建共用本脚本，发布前必然经过。

/** 同名导入双声明：'url' 与 'node:url' 两种说明符都导入 fileURLToPath，必然 SyntaxError */
const DUP_FILE_URL_TO_PATH = [
   /import\s*\{[^}]*\bfileURLToPath\b[^}]*\}\s*from\s*['"]url['"]/,
   /import\s*\{[^}]*\bfileURLToPath\b[^}]*\}\s*from\s*['"]node:url['"]/,
];

const scan = async (dir) => {
   const offenders = [];
   const entries = await fs.readdir(dir, { withFileTypes: true });
   for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
         // node_modules 是 Nitro 外部化依赖的原样拷贝，不经 rollup 打包，不存在 shim
         // 冲突；且其中可能存在字符串形态的 "__dirname"（如 @shikijs/langs 的语法
         // 示例文本），扫描它们只会误报，故跳过。
         if (entry.name === 'node_modules') continue;
         offenders.push(...(await scan(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
         const content = await fs.readFile(fullPath, 'utf-8');
         if (!content.includes('__dirname') && !content.includes('fileURLToPath')) continue;

         const hasShim = /const\s+__dirname\s*=/.test(content);
         const hasBareDirname = /\b__dirname\b/.test(content) && !hasShim;
         const hasDupImport = DUP_FILE_URL_TO_PATH.every((re) => re.test(content));

         if (hasBareDirname || hasDupImport) {
            offenders.push({ file: fullPath, hasBareDirname, hasDupImport });
         }
      }
   }
   return offenders;
};

const offenders = await scan(root);
if (offenders.length) {
   console.error('');
   console.error('❌ 产物断言失败：server bundle 中存在会导致启动即崩的 __dirname / fileURLToPath 形态：');
   for (const { file, hasBareDirname, hasDupImport } of offenders) {
      console.error(`   ${path.relative(process.cwd(), file)}`);
      if (hasBareDirname) console.error('      - 残留未处理的 __dirname（CJS 依赖被内联，运行时 ReferenceError / shim 注入冲突）');
      if (hasDupImport) console.error('      - 同时存在 from \'url\' 与 from \'node:url\' 的 fileURLToPath 导入（重复声明 SyntaxError）');
   }
   console.error('');
   console.error('修复：把触发内联的 CJS 包加入 nuxt.config.ts 的 nitro.externals.external（参考 ioredis / pino 条目的注释）。');
   console.error('');
   process.exit(1);
}

console.log('✅ 产物断言通过：server bundle 无残留 __dirname / 重复 fileURLToPath 声明');

const patchNuxtIgnore = async () => {
   const nuxtConfigPath = path.join(__dirname, '../.nuxtignore');
   let content = await fs.readFile(nuxtConfigPath, 'utf-8');
   const lines = content.split('\n');
   const transformedLines = lines.map((line) => `#${line}`);
   content = transformedLines.join('\n');
   await fs.writeFile(nuxtConfigPath, content, 'utf-8');
   console.log(`✅ Patched: ${nuxtConfigPath}`);
};

await patchNuxtIgnore();
