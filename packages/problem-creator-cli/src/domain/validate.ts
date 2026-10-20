import { pathExists, readText } from '../utils/fs';
import { displayPath, formatBytes } from '../utils/paths';
import { detailBaseDir, findLocalImageRefs } from './detail-images';
import { analyzeJudgeScript, type JudgeScriptAnalysis } from './judge-script';
import type { ResolvedProblemConfig } from './problem-config';
import { collectSnapshot, type SnapshotResult } from './snapshot';

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
   /** 规则编号，可与 docs/RULES.md 对照；CI 里可以按编号豁免 */
   rule: string;
   severity: Severity;
   message: string;
   /** 相对题目目录的路径 */
   file?: string;
   line?: number;
   hint?: string;
}

export interface ValidationReport {
   findings: Finding[];
   errors: number;
   warnings: number;
   /** 无 error 即视为通过（warning 默认不阻塞，--strict 时才阻塞） */
   ok: boolean;
   totalScore: number;
   stats: {
      checkpointCount: number;
      judgeLines: number;
      template: ArtifactStats;
      answer: ArtifactStats;
   };
   analysis: JudgeScriptAnalysis;
   templateSnapshot: Record<string, string>;
   answerSnapshot: Record<string, string>;
}

export interface ArtifactStats {
   fileCount: number;
   totalBytes: number;
   ignored: string[];
}

export interface ValidateOptions {
   /** 快照体积上限（字节），对齐 Web 端提交链路的实际承受能力 */
   maxUploadBytes?: number;
   maxFileCount?: number;
}

/** 出题预检（离线）：覆盖 PROBLEM_AUTHORING 检查清单中可静态判定的部分；审不了的部分由 `qpc upload --wait` 拉回线上审计结果。 */
export const validateProblem = async (
   config: ResolvedProblemConfig,
   options: ValidateOptions = {},
): Promise<ValidationReport> => {
   const findings: Finding[] = [];
   const push = (finding: Finding): void => {
      findings.push(finding);
   };

   const rel = (path: string): string => displayPath(config.rootDir, path);

   // ── 判题脚本 ────────────────────────────────────────────────
   const judgeExists = await pathExists(config.paths.judge);
   if (!judgeExists) {
      push({
         rule: 'JUD001',
         severity: 'error',
         message: `判题脚本不存在：${rel(config.paths.judge)}`,
         file: rel(config.paths.judge),
         hint: '在题目目录下创建 judge.js，参考 examples/hello-total/judge.js。',
      });
   }
   const judgeCode = judgeExists ? await readText(config.paths.judge) : '';
   const analysis = analyzeJudgeScript(judgeCode);

   if (judgeExists && !analysis.hasDefaultExport) {
      push({
         rule: 'JUD002',
         severity: 'error',
         message: '判题脚本缺少 `export default defineTestHandler(...)`',
         file: rel(config.paths.judge),
         hint: '判题机把文本 `export default ` 替换成 `const run = `；写成裸函数声明不会生效。',
      });
   }
   if (judgeExists && !analysis.hasDefineTestHandler) {
      push({
         rule: 'JUD003',
         severity: 'error',
         message: '判题脚本没有调用 defineTestHandler',
         file: rel(config.paths.judge),
      });
   }

   for (const checkpoint of analysis.checkpoints) {
      if (!checkpoint.returnsValue) {
         push({
            rule: 'JUD004',
            severity: 'error',
            message: `检查点「${checkpoint.name}」的 handler 没有 return 分数`,
            file: rel(config.paths.judge),
            line: checkpoint.line,
            hint: 'handler 末尾补 `return ${checkpoint.score};`。不 return 时即使断言全过也记 0 分。',
         });
      }
      if (checkpoint.score <= 0) {
         push({
            rule: 'JUD005',
            severity: 'warn',
            message: `检查点「${checkpoint.name}」分值为 ${checkpoint.score}`,
            file: rel(config.paths.judge),
            line: checkpoint.line,
         });
      }
   }

   for (const unparsed of analysis.unparsedCheckpoints) {
      push({
         rule: 'JUD006',
         severity: 'warn',
         message: `检查点分值不是字面量，无法在本地累加：${unparsed.value}`,
         file: rel(config.paths.judge),
         line: unparsed.line,
         hint: '请用数字字面量写分值，本地校验与线上审计才能对上。',
      });
   }

   const duplicated = duplicateNames(analysis.checkpoints.map((c) => c.name));
   for (const name of duplicated) {
      push({
         rule: 'JUD007',
         severity: 'warn',
         message: `检查点名称重复：${name}`,
         file: rel(config.paths.judge),
         hint: '同名检查点在判题详情里无法区分，建议改成唯一的描述。',
      });
   }

   for (const click of analysis.clickWithoutTimeout) {
      push({
         rule: 'JUD008',
         severity: 'warn',
         message: `click 未设置 timeout：${click.value}`,
         file: rel(config.paths.judge),
         line: click.line,
         hint: '目标可能是 disabled 按钮，Playwright 会重试到 30 秒超时；改派发合成事件或加 `{ timeout: 3000 }`。',
      });
   }

   for (const vague of analysis.vagueExpectations) {
      push({
         rule: 'JUD009',
         severity: 'info',
         message: `断言消息没有说明"期望 vs 实际"：${vague.value}`,
         file: rel(config.paths.judge),
         line: vague.line,
         hint: '消息会原样展示给学生，建议拼接实际值，例如 `合计应为 10.50，实际为 "${actual}"`。',
      });
   }

   if (judgeExists && analysis.expectationCount === 0) {
      push({
         rule: 'JUD010',
         severity: 'warn',
         message: '判题脚本里没有任何 $.expect 断言',
         file: rel(config.paths.judge),
      });
   }

   for (const name of analysis.namedExports) {
      push({
         rule: 'JUD011',
         severity: 'warn',
         message: `存在 default 之外的导出：${name}`,
         file: rel(config.paths.judge),
         hint: '模块被替换后这些导出仍会残留，可能导致沙箱里出现意料之外的绑定。',
      });
   }

   // ── 分值 ───────────────────────────────────────────────────
   const totalScore = config.totalScore ?? analysis.checkpointTotal;
   if (
      config.totalScore !== undefined &&
      config.totalScore !== analysis.checkpointTotal
   ) {
      push({
         rule: 'CFG001',
         severity: 'error',
         message: `totalScore=${config.totalScore} 与检查点之和 ${analysis.checkpointTotal} 不一致`,
         file: rel(config.configFile),
         hint: '审计通过的条件是 score === totalScore，两者不等时线上会判失败。',
      });
   }
   if (config.totalScore === undefined) {
      push({
         rule: 'CFG002',
         severity: 'info',
         message: `未指定 totalScore，按检查点之和取 ${analysis.checkpointTotal}`,
         file: rel(config.configFile),
      });
   }

   // ── 运行期配置 ─────────────────────────────────────────────
   const isBackend = config.type === 'backend_service';
   const mountPath = config.runtime.judgeUploadPath;
   const initCommand = config.runtime.initCommand;
   // RUN001 只对前端题型成立：后端服务不要站点根，而是跑一个常驻进程。
   if (!isBackend && initCommand && !initCommand.includes(mountPath)) {
      push({
         rule: 'RUN001',
         severity: 'warn',
         message: `initCommand 未包含上传目录 "${mountPath}"：${initCommand}`,
         file: rel(config.configFile),
         hint: '站点根必须等于判题打包目录，否则判题机会在错误的目录下找 index.html 直到超时。',
      });
   }
   if (config.cover.mode === 'custom' && !('imageId' in config.cover)) {
      push({
         rule: 'IMG001',
         severity: 'error',
         message: 'cover.mode=custom 时必须提供 imageId',
         file: rel(config.configFile),
         hint: '配置了 cover.generate 的话，跑 `qpc cover --upload --write` 一键生成并写回；否则把平台上的图片 id 填进 imageId。',
      });
   }

   // 题面里的本地图片上传后学生看不到：必须先换成平台地址。
   for (const image of findLocalImageRefs(
      config.detail,
      detailBaseDir(config),
   )) {
      const exists = await pathExists(image.file);
      push({
         rule: 'IMG003',
         severity: 'error',
         message: exists
            ? `题面引用了本地图片 ${image.ref}，上传后学生看不到`
            : `题面引用的本地图片不存在：${image.ref}`,
         file: config.detailFile ?? rel(config.configFile),
         // 内联题面的行号相对题面正文，对不上配置文件，不报
         line: config.detailFile ? image.line : undefined,
         hint: exists
            ? '运行 `qpc image --write` 上传题面里的本地图片并把地址回写到题面。'
            : '先用 `qpc gen-img` 生成图片（或修正路径），再 `qpc image --write`。',
      });
   }

   // 后端服务题型的额外约束（详见 docs/BACKEND_SERVICE_PROBLEM.md）
   if (isBackend) {
      // RUN002：后端题的 bootCommand 由镜像决定，作者写的会被覆盖，因此只提示不报错。
      for (const field of config.overriddenByImage) {
         push({
            rule: 'RUN002',
            severity: 'warn',
            message: `${field} 会被初始镜像 ${config.runtime.serviceImage} 规定的命令覆盖，不会生效`,
            file: rel(config.configFile),
            hint: '编辑器里的一次性准备步骤由镜像决定（与容器内的离线安装保持一致）；服务启动命令请写在 runtime.initCommand。',
         });
      }
      if (config.cover.mode === 'default') {
         push({
            rule: 'IMG002',
            severity: 'error',
            message: '后端服务题型必须使用自定义封面（没有首屏可截图）',
            file: rel(config.configFile),
            hint: '把 cover 改成 { mode: "custom", generate: { bg: "#0F172A", bgTo: "#14432A" } }，再跑 `qpc cover --upload --write`。',
         });
      }
   }

   // ── 工程快照 ───────────────────────────────────────────────
   const template = await collectSnapshot(config.paths.template, { mountPath });
   const answer = await collectSnapshot(config.paths.answer, { mountPath });

   const checkArtifact = async (
      label: 'template' | 'answer',
      dir: string,
      snapshot: SnapshotResult,
      rulePrefix: string,
      requireIndex: boolean,
   ): Promise<void> => {
      const relative = rel(dir);
      if (!(await pathExists(dir))) {
         push({
            rule: `${rulePrefix}001`,
            severity: 'error',
            message: `${label} 目录不存在：${relative}`,
            file: relative,
            hint: '题目必须有答案模板（学生起点）与参考解（拿满分的答案）。',
         });
         return;
      }
      if (snapshot.fileCount === 0) {
         push({
            rule: `${rulePrefix}002`,
            severity: 'error',
            message: `${label} 目录为空：${relative}`,
            file: relative,
         });
         return;
      }
      const hasIndex = Object.keys(snapshot.files).some((key) =>
         key.endsWith('/index.html'),
      );
      if (requireIndex && label === 'template' && !hasIndex) {
         push({
            rule: 'TPL003',
            severity: 'error',
            message: `答案模板缺少 index.html（站点根 = ${mountPath}）`,
            file: relative,
            hint: 'initCommand 以该目录为站点根启动静态服务器，没有 index.html 时判题会一直等选择器。',
         });
      }
      // 后端服务必须有锁文件，否则容器内的离线安装无从谈起。
      if (isBackend && label === 'answer') {
         const hasLockfile = Object.keys(snapshot.files).some((key) =>
            key.endsWith('/pnpm-lock.yaml'),
         );
         if (!hasLockfile) {
            push({
               rule: 'RUN003',
               severity: 'error',
               message: `后端服务参考答案缺少 pnpm-lock.yaml（应在 ${mountPath}/ 下）`,
               file: relative,
               hint: '离线安装依赖锁文件；没有它容器无法在断网环境下安装依赖。先在参考答案目录执行一次 pnpm install 生成。',
            });
         }
      }
      for (const ignored of snapshot.ignored) {
         push({
            rule: 'SNAP003',
            severity: 'info',
            message: `${relative} 下已跳过 ${ignored}/（构建产物或依赖）`,
            file: relative,
         });
      }
      for (const decoded of snapshot.decodedDataUrls) {
         push({
            rule: 'SNAP004',
            severity: 'warn',
            message: `${relative}/${decoded} 的内容是 data URL 文本，不是图片二进制；已在上传时还原`,
            file: `${relative}/${decoded}`,
            hint: '平台下发的是还原后的图片，但本地预览和本地判题读的仍是这份文本。把逗号后的 base64 解码写回原文件即可。',
         });
      }
   };

   await checkArtifact(
      'template',
      config.paths.template,
      template,
      'TPL',
      !isBackend,
   );
   await checkArtifact(
      'answer',
      config.paths.answer,
      answer,
      'ANS',
      !isBackend,
   );

   const maxUploadBytes = options.maxUploadBytes ?? Number.POSITIVE_INFINITY;
   const maxFileCount = options.maxFileCount ?? 500;
   for (const [label, snapshot] of [
      ['template', template],
      ['answer', answer],
   ] as const) {
      if (snapshot.totalBytes > maxUploadBytes) {
         push({
            rule: 'SNAP001',
            severity: 'error',
            message: `${label} 快照体积 ${formatBytes(snapshot.totalBytes)} 超过上限 ${formatBytes(maxUploadBytes)}`,
            hint: '确认没有把 dist/、node_modules/ 或大图打进题目目录；必要时调整 QUANTA_MAX_UPLOAD_BYTES。',
         });
      }
      if (snapshot.fileCount > maxFileCount) {
         push({
            rule: 'SNAP002',
            severity: 'error',
            message: `${label} 快照文件数 ${snapshot.fileCount} 超过上限 ${maxFileCount}`,
         });
      }
   }

   const errors = findings.filter((f) => f.severity === 'error').length;
   const warnings = findings.filter((f) => f.severity === 'warn').length;

   return {
      findings,
      errors,
      warnings,
      ok: errors === 0,
      totalScore,
      stats: {
         checkpointCount: analysis.checkpoints.length,
         judgeLines: analysis.lineCount,
         template: toStats(template),
         answer: toStats(answer),
      },
      analysis,
      templateSnapshot: template.files,
      answerSnapshot: answer.files,
   };
};

const toStats = (snapshot: SnapshotResult): ArtifactStats => ({
   fileCount: snapshot.fileCount,
   totalBytes: snapshot.totalBytes,
   ignored: snapshot.ignored,
});

const duplicateNames = (names: string[]): string[] => {
   const seen = new Set<string>();
   const duplicates = new Set<string>();
   for (const name of names) {
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
   }
   return [...duplicates];
};
