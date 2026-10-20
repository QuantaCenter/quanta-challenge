import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ConfigError } from '../core/errors';

export interface AgentTopic {
   id: string;
   title: string;
}

/** 手册章节：一个章节对应包根 `agent/<id>.md` */
export const AGENT_TOPICS: readonly AgentTopic[] = [
   { id: 'overview', title: '这个 CLI 是干什么的' },
   { id: 'workflow', title: '出题流程（每步命令与验收条件）' },
   { id: 'config', title: '题目配置字段与最小示例' },
   { id: 'judge-frontend', title: '如何编写前端 Judge 脚本' },
   { id: 'judge-backend', title: '如何编写后端 Judge 脚本' },
   { id: 'types', title: 'Judge 脚本的 Type Schema' },
   { id: 'images', title: '题面插图（gen-img / image）与封面' },
   { id: 'check', title: 'qpc check：基础信息检查 + 本地微判题' },
   { id: 'errors', title: '错误码与下一步动作' },
];

/** 组合视图：`qpc agent` 不带章节时按所在目录二选一 */
export const AGENT_GUIDES = {
   cli: {
      title: 'qpc 使用手册',
      topics: ['overview', 'workflow'],
   },
   authoring: {
      title: '判题脚本编写手册',
      topics: ['judge-frontend', 'judge-backend', 'types'],
   },
} as const;

export type AgentGuide = keyof typeof AGENT_GUIDES;

export const DTS_FILES = {
   frontend: 'system.frontend.standalone.dts',
   backend: 'system.backend.standalone.dts',
} as const;

// 源码直跑取包根 agent/；打包后 dist/index.js 取 ../agent。
const DOC_DIR_CANDIDATES = ['../../agent', '../agent'] as const;
// .d.ts 真源在 Web 应用（编辑器同一份）：构建时拷到 dist/agent-types，源码直跑时直接读真源。
const DTS_DIR_CANDIDATES = [
   './agent-types',
   '../../../challenge-web-app/public',
] as const;

const resolveDir = (candidates: readonly string[], probe: string): string => {
   for (const candidate of candidates) {
      const dir = fileURLToPath(new URL(`${candidate}/`, import.meta.url));
      if (existsSync(`${dir}${probe}`)) return dir;
   }
   throw new ConfigError('内部错误：找不到随包分发的 Agent 手册文件', {
      details: { from: import.meta.url, candidates, probe },
   });
};

export const findTopic = (id: string): AgentTopic | undefined =>
   AGENT_TOPICS.find((topic) => topic.id === id);

export const readTopic = async (id: string): Promise<string> => {
   const dir = resolveDir(DOC_DIR_CANDIDATES, 'overview.md');
   return (await readFile(`${dir}${id}.md`, 'utf8')).trimEnd();
};

export const readDts = async (
   type: keyof typeof DTS_FILES,
): Promise<string> => {
   const dir = resolveDir(DTS_DIR_CANDIDATES, DTS_FILES.frontend);
   return readFile(`${dir}${DTS_FILES[type]}`, 'utf8');
};
