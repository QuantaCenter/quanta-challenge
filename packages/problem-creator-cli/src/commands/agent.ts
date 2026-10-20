import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import {
   AGENT_GUIDES,
   AGENT_TOPICS,
   type AgentGuide,
   findTopic,
   readDts,
   readTopic,
} from '../domain/agent-docs';
import { findConfigFile, type ProblemType } from '../domain/problem-config';
import type { CommandRegistry } from './registry';

export interface AgentOptions {
   list?: boolean;
   dir?: string;
   type?: string;
}

export const registerAgentCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('agent')
      .description(
         '给 Agent 的使用手册（随版本分发）：题目目录外是 CLI 手册，题目目录内是判题脚本编写手册',
      )
      .argument(
         '[topic]',
         `章节：${[...Object.keys(AGENT_GUIDES), ...AGENT_TOPICS.map((t) => t.id), 'dts'].join(' | ')}`,
      )
      .option('--list', '列出全部章节')
      .option('--dir <dir>', '题目目录（默认当前目录），用于判断题型', '.')
      .option(
         '--type <type>',
         'dts 章节的题型：frontend | backend（默认按题目配置）',
      )
      .action(async (topic: string | undefined, options: AgentOptions) => {
         const ctx = await context();
         await runAgent(ctx, topic, options);
      });
};

export const runAgent = async (
   ctx: CommandContext,
   topic: string | undefined,
   options: AgentOptions,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir ?? '.');
   const problemType = await detectProblemType(rootDir);
   const out = (text: string) => ctx.runtime.stdout(`${text}\n`);

   if (options.list) {
      if (ctx.logger.json) {
         ctx.logger.result({ guides: AGENT_GUIDES, topics: AGENT_TOPICS });
         return;
      }
      out(renderIndex(problemType));
      return;
   }

   if (topic === 'dts') {
      const type = resolveDtsType(options.type, problemType);
      const content = await readDts(type);
      if (ctx.logger.json) ctx.logger.result({ topic: 'dts', type, content });
      else out(content.trimEnd());
      return;
   }

   const guide: AgentGuide | undefined =
      topic === undefined
         ? problemType
            ? 'authoring'
            : 'cli'
         : topic in AGENT_GUIDES
           ? (topic as AgentGuide)
           : undefined;

   if (guide) {
      const ids = orderTopics(AGENT_GUIDES[guide].topics, problemType);
      const sections = await Promise.all(ids.map((id) => readTopic(id)));
      const header = renderGuideHeader(guide, problemType);
      if (ctx.logger.json) {
         ctx.logger.result({
            guide,
            problemType,
            topics: ids,
            content: [header, ...sections].join('\n\n'),
         });
         return;
      }
      out([header, ...sections, renderIndex(problemType)].join('\n\n---\n\n'));
      return;
   }

   const id =
      topic === 'judge' ? judgeTopicFor(problemType) : (topic as string);
   if (!findTopic(id)) {
      throw new UsageError(`没有这个章节：${topic}`, {
         hint: '运行 `qpc agent --list` 查看全部章节。',
      });
   }
   const content = await readTopic(id);
   if (ctx.logger.json) ctx.logger.result({ topic: id, content });
   else out(content);
};

const detectProblemType = async (
   rootDir: string,
): Promise<ProblemType | undefined> => {
   try {
      const file = await findConfigFile(rootDir);
      // 不跑 schema：配置写到一半也要能给出对应题型的手册
      const text = await readFile(file, 'utf8');
      return /['"]?type['"]?\s*:\s*['"]backend_service['"]/.test(text)
         ? 'backend_service'
         : 'frontend';
   } catch {
      return undefined;
   }
};

const judgeTopicFor = (type: ProblemType | undefined): string =>
   type === 'backend_service' ? 'judge-backend' : 'judge-frontend';

/** 本题题型对应的判题章节排在前面 */
const orderTopics = (
   ids: readonly string[],
   type: ProblemType | undefined,
): string[] => {
   if (type !== 'backend_service') return [...ids];
   return [
      ...ids.filter((id) => id === 'judge-backend'),
      ...ids.filter((id) => id !== 'judge-backend'),
   ];
};

const resolveDtsType = (
   flag: string | undefined,
   type: ProblemType | undefined,
): 'frontend' | 'backend' => {
   if (flag === undefined)
      return type === 'backend_service' ? 'backend' : 'frontend';
   if (flag === 'frontend' || flag === 'backend') return flag;
   if (flag === 'backend_service') return 'backend';
   throw new UsageError(`--type 不合法：${flag}`, {
      hint: '可选值：frontend | backend',
   });
};

const renderGuideHeader = (
   guide: AgentGuide,
   type: ProblemType | undefined,
): string => {
   const lines = [`# ${AGENT_GUIDES[guide].title}`];
   if (guide === 'authoring') {
      lines.push(
         '',
         type
            ? `> 当前目录是一道 \`${type}\` 题，对应章节排在最前。完整 CLI 手册：\`qpc agent cli\`。`
            : '> 完整 CLI 手册：`qpc agent cli`。',
      );
   } else {
      lines.push(
         '',
         '> 进入题目目录后再运行 `qpc agent`，会得到判题脚本编写手册（前端 / 后端 / Type Schema）。',
      );
   }
   return lines.join('\n');
};

const renderIndex = (type: ProblemType | undefined): string => {
   const lines = ['# 手册章节（qpc agent <章节>）', ''];
   lines.push('| 章节 | 内容 |', '| --- | --- |');
   lines.push('| `cli` | CLI 手册：overview + workflow |');
   lines.push(
      '| `authoring` | 判题脚本编写手册：judge-frontend + judge-backend + types |',
   );
   for (const topic of AGENT_TOPICS) {
      lines.push(`| \`${topic.id}\` | ${topic.title} |`);
   }
   lines.push(
      `| \`dts\` | 完整 .d.ts 类型声明（\`--type frontend\\|backend\`，默认 ${type === 'backend_service' ? 'backend' : 'frontend'}），可重定向到 judge.d.ts |`,
   );
   return lines.join('\n');
};
