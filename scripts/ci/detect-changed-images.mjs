#!/usr/bin/env node
/**
 * 判定「这次改动需要重建哪些镜像」；判定口径按功能相关而非镜像字节相关
 * （各镜像依赖来自自己 Dockerfile 的 COPY，judge-machine 虽 COPY 整仓但只消费自身源码）。
 * 用法：node scripts/ci/detect-changed-images.mjs --base <sha> --head <sha> --repo <owner/repo>
 *       [--github-output "$GITHUB_OUTPUT"] [--report detect-report.md] [--only all|a,b]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

// 镜像定义：watches 里每一项是目录或具体文件路径，必须能在对应 Dockerfile 的 COPY 里找到出处；改 COPY 时须同步改这里。
const IMAGES = [
   {
      short: 'web-app',
      title: 'Web 应用',
      dockerfile: 'packages/challenge-web-app/Dockerfile',
      watches: [
         'packages/challenge-web-app', // COPY packages/challenge-web-app
         'packages/challenge-agents/judge-machine', // COPY packages/challenge-agents/judge-machine
         'packages/database', // COPY packages/database
         'packages/shared', // COPY packages/shared
         'packages/challenge-agents/live-server/package.json', // COPY 该 package.json
      ],
   },
   {
      short: 'judge-scheduler',
      title: '判题调度器',
      dockerfile: 'packages/challenge-judge-scheduler/Dockerfile',
      watches: [
         'packages/challenge-judge-scheduler', // COPY packages/challenge-judge-scheduler
         'packages/challenge-agents/judge-machine', // COPY packages/challenge-agents/judge-machine
         'packages/database', // COPY packages/database
         'packages/shared', // COPY packages/shared
         'packages/challenge-agents/live-server/package.json', // COPY 该 package.json
      ],
   },
   {
      short: 'judge-machine',
      title: '判题机',
      dockerfile: 'packages/challenge-agents/judge-machine/Dockerfile',
      watches: [
         'packages/challenge-agents/judge-machine', // COPY . /app，实际只消费本目录源码
         'tsconfig.json', // 同上，整仓上下文里的构建配置
      ],
   },
   {
      short: 'live-server',
      title: 'Live Server（Playwright 预览）',
      dockerfile: 'packages/challenge-agents/live-server/Dockerfile',
      // 该 Dockerfile 只有 `npm install -g live-server` + CMD，**不 COPY 任何仓库文件**。
      // 因此只有它自己的 Dockerfile 变化才需要重建；改仓库代码永远不必重建它。
      watches: ['packages/challenge-agents/live-server/Dockerfile'],
   },
   {
      short: 'backend-service',
      title: '后端服务题目容器',
      dockerfile: 'packages/challenge-agents/backend-service/Dockerfile',
      // 只 COPY 自己的 entrypoint.sh；pnpm 从 npm 装，不消费 workspace 源码。
      watches: ['packages/challenge-agents/backend-service'],
   },
   {
      short: 'backend-judge-machine',
      title: '后端服务判题机',
      dockerfile: 'packages/challenge-agents/backend-judge-machine/Dockerfile',
      watches: [
         'packages/challenge-agents/backend-judge-machine', // COPY . /app，实际只消费本目录源码
         'tsconfig.json', // 整仓上下文里的构建配置
      ],
   },
   {
      short: 'cloud-function',
      title: '云函数服务',
      dockerfile: 'packages/challenge-cloud-function/Dockerfile',
      // 除自身源码外还 COPY 了 database（`RUN pnpm prisma:generate`）与 shared
      // （签名实现 service/cloud-function/sign.ts 两侧共用）。
      watches: [
         'packages/challenge-cloud-function', // COPY packages/challenge-cloud-function
         'packages/database', // COPY packages/database
         'packages/shared', // COPY packages/shared
      ],
   },
];

/** 影响所有镜像的路径：这些文件一变，每个镜像的依赖层都会变。 */
const GLOBAL_WATCHES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore'];

const USAGE = `用法: detect-changed-images.mjs --repo owner/repo [--base <sha> --head <sha>] [--only all|a,b]`;

// ---- 参数解析 ----
const parseArgs = (argv) => {
   const args = { registry: 'ghcr.io', base: '', head: '', repo: process.env.GITHUB_REPOSITORY || '', only: '' };
   for (let i = 0; i < argv.length; i += 1) {
      const key = argv[i];
      const value = argv[i + 1];
      switch (key) {
         case '--base':
            args.base = value ?? '';
            i += 1;
            break;
         case '--head':
            args.head = value ?? '';
            i += 1;
            break;
         case '--repo':
            args.repo = value ?? '';
            i += 1;
            break;
         case '--registry':
            args.registry = value ?? 'ghcr.io';
            i += 1;
            break;
         case '--only':
            args.only = value ?? '';
            i += 1;
            break;
         case '--github-output':
            args.githubOutput = value;
            i += 1;
            break;
         case '--report':
            args.report = value;
            i += 1;
            break;
         case '--help':
            console.log(USAGE);
            process.exit(0);
            break;
         default:
            console.error(`未知参数: ${key}\n${USAGE}`);
            process.exit(2);
      }
   }
   if (!args.repo) {
      console.error(`缺少 --repo（或环境变量 GITHUB_REPOSITORY）\n${USAGE}`);
      process.exit(2);
   }
   return args;
};

const args = parseArgs(process.argv.slice(2));

/** GHCR 路径必须全小写（github.repository 保留原始大小写） */
const imageName = (short) => `${args.registry}/${args.repo.split('/')[0].toLowerCase()}/quanta-challenge-${short}`;

const git = (gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' }).trim();

/** 把任意 rev（含 HEAD、短 sha）解析成完整 sha，用于生成标签 */
const resolveSha = (rev) => git(['rev-parse', rev || 'HEAD']);

const commitExists = (rev) => {
   if (!rev || /^0+$/.test(rev)) return false; // push 事件的 before 在首次推送/强推后是全 0
   try {
      git(['cat-file', '-e', `${rev}^{commit}`]);
      return true;
   } catch {
      return false;
   }
};

// ---- 取出改动文件列表 ----
/**
 * @returns {{ files: string[], reason: string }}
 */
const collectChangedFiles = () => {
   if (args.only) {
      // 手动派发：显式指定，不做 diff
      if (args.only.trim() === 'all') return { files: null, reason: '手动派发：指定全量重建' };
      const picked = args.only.split(',').map((s) => s.trim()).filter(Boolean);
      const unknown = picked.filter((s) => !IMAGES.some((i) => i.short === s));
      if (unknown.length) {
         console.error(`未知镜像: ${unknown.join(', ')}（可选: ${IMAGES.map((i) => i.short).join(', ')}）`);
         process.exit(2);
      }
      return { files: null, picked, reason: `手动派发：指定 ${picked.join(', ')}` };
   }

   if (!commitExists(args.base)) {
      // 首次推送、强推、或 base 已不可达：无从 diff，按全量处理（宁可多建，不可漏建）
      return { files: null, reason: `无法定位基线提交 ${args.base || '(空)'}，按全量处理` };
   }

   const head = args.head || 'HEAD';
   const files = git(['diff', '--name-only', '--no-renames', `${args.base}..${head}`])
      .split('\n')
      .filter(Boolean);
   return { files, reason: `diff ${args.base.slice(0, 8)}..${head.slice(0, 8)}` };
};

const { files, reason, picked } = collectChangedFiles();

// ---- 匹配 ----
const isUnder = (file, watch) => file === watch || file.startsWith(`${watch}/`);

/** @returns {{ short: string, hits: string[] }[]} */
const decide = () => {
   if (!files) {
      const chosen = picked ? IMAGES.filter((i) => picked.includes(i.short)) : IMAGES;
      return chosen.map((i) => ({ short: i.short, hits: ['(显式指定)'] }));
   }

   const globals = files.filter((f) => GLOBAL_WATCHES.includes(f));
   return IMAGES.map((image) => {
      const hits = files.filter((f) => image.watches.some((w) => isUnder(f, w)));
      // 根依赖清单变化影响所有镜像
      return { short: image.short, hits: [...globals.map((f) => `${f}（根依赖清单，影响所有镜像）`), ...hits] };
   }).filter((r) => r.hits.length > 0);
};

const selected = decide();
const meta = selected.map(({ short, hits }) => {
   const image = IMAGES.find((i) => i.short === short);
   return { ...image, image: imageName(short), hits };
});

// ---- 输出 ----
const byShort = new Map(meta.map((m) => [m.short, m]));
console.log(`判定依据: ${reason}`);
if (files) {
   console.log(`改动文件 ${files.length} 个`);
   const orphans = files.filter(
      (f) =>
         !GLOBAL_WATCHES.includes(f) &&
         !IMAGES.some((i) => i.watches.some((w) => isUnder(f, w))),
   );
   if (orphans.length) console.log(`与镜像无关的改动 ${orphans.length} 个（仅文档/CI 等）`);
}
console.log(
   selected.length
      ? `需要重建: ${meta.map((m) => `${m.short}(${m.hits.length})`).join(', ')}`
      : '需要重建: 无（本次改动不影响任何镜像）',
);

const report = [
   '### 镜像重建判定',
   '',
   `判定依据：${reason}`,
   '',
   ...(selected.length
      ? [
           '| 镜像 | 产物 | 触发文件 |',
           '| --- | --- | --- |',
           ...meta.map((m) => {
              const listed = m.hits.slice(0, 3).join('<br>');
              const more = m.hits.length > 3 ? `<br>…共 ${m.hits.length} 个` : '';
              return `| ${m.title} \`${m.short}\` | \`${m.image}\` | ${listed}${more} |`;
           }),
        ]
      : ['本次改动不影响任何镜像，不进行构建。']),
   '',
];

if (args.report) writeFileSync(args.report, `${report.join('\n')}\n`);

if (args.githubOutput) {
   const matrix = { include: meta.map((m) => ({ short: m.short, image: m.image, dockerfile: m.dockerfile, title: m.title })) };
   const write = (key, value) => appendFileSync(args.githubOutput, `${key}<<__EOF__\n${value}\n__EOF__\n`);
   write('matrix', JSON.stringify(matrix));
   write('any', String(selected.length > 0));
   write('images', meta.map((m) => m.image).join('\n'));
   write('list', meta.map((m) => m.short).join(', '));
   // 镜像标签 sha-<短哈希>：build 打标签、release 回读须同一值，统一由这里用 rev-parse 计算。
   write('tag', `sha-${resolveSha(args.head).slice(0, 7)}`);
}
