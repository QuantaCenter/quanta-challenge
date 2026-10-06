#!/usr/bin/env node
/**
 * 判定「这次改动需要重建哪些镜像」。
 *
 * 为什么单独写成脚本而不是塞进 workflow 的 run 里：
 * 判定规则要和 4 个 Dockerfile 的 COPY 列表严格对应，属于容易写错、且错了很隐蔽
 * （少建一个镜像 → 线上跑着旧代码；多建 → 白烧十几分钟构建时间）的逻辑。
 * 放在仓库里可以用真实提交区间在本地反复验证：见文件末尾的「本地自测」。
 *
 * ## 判定口径：**功能相关**，不是镜像字节相关
 *
 * 每个镜像的依赖来自它自己 Dockerfile 的 COPY 指令（见各 watches 的注记）。
 * 特别地，judge-machine 是 `COPY . /app`（整仓上下文），若按字节算，改任何一个文件
 * 都该重建它；但它只 `pnpm install --filter @challenge/judge-machine-agent...`，
 * 实际只消费自己目录内的源码（package.json 里没有任何 @challenge/* 依赖），
 * 因此这里只按它真正读取的路径判定，避免"改一行前端代码就重建一个带 Chromium 的镜像"。
 *
 * ## 用法
 *
 *   node scripts/ci/detect-changed-images.mjs \
 *     --base <sha> --head <sha> --repo <owner/repo> \
 *     --github-output "$GITHUB_OUTPUT" --report detect-report.md
 *
 *   --only all                  # 手动派发：全量
 *   --only web-app,live-server  # 手动派发：只建指定镜像
 *   都不给                      # 按 base..head 的 diff 自动判定
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// 镜像定义
//
// watches 里的每一项要么是目录（匹配其下所有文件），要么是具体文件路径。
// 每一项都必须能在对应 Dockerfile 的 COPY 指令里找到出处，改 Dockerfile 的 COPY
// 时请同步改这里，否则会出现"改了代码但镜像没重建"。
// ---------------------------------------------------------------------------
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
];

/**
 * 影响所有镜像的路径：根依赖清单与构建上下文排除规则。
 * 所有镜像都先 COPY 根 package.json / lockfile / workspace 再 pnpm install --frozen-lockfile，
 * 所以这些文件一变，每个镜像的依赖层都会变。
 */
const GLOBAL_WATCHES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore'];

const USAGE = `用法: detect-changed-images.mjs --repo owner/repo [--base <sha> --head <sha>] [--only all|a,b]`;

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 取出改动文件列表
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 匹配
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
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
   // 镜像标签 sha-<短哈希>：build 阶段打标签、release 阶段回读，必须用同一个值，
   // 因此统一由这里算（head 传的是被构建的那个提交）。用 rev-parse 解析，
   // 这样本地传 HEAD 也能算出真实短哈希。
   write('tag', `sha-${resolveSha(args.head).slice(0, 7)}`);
}
