/**
 * 包的程序化入口（package.json 的 exports/main 指向这里）。
 *
 * 为什么不和 bin 入口放在同一个文件：`problem.config.ts` 里会
 * `import { defineProblemConfig } from '@challenge/problem-creator-cli'`，
 * 而 CLI 用 jiti 加载这个模块。如果它同时是 bin 入口，加载配置就会
 * 顺便把整个 CLI 跑一遍。这里保持**零副作用**。
 *
 * 只依赖 problem-config-schema（纯 zod，无 fs/jiti）：
 * 否则打包产物里会留下 `node:fs` 之类的空引用，构建时刷一屏无用警告。
 */
import type { ProblemConfigInput } from './domain/problem-config-schema';

export type {
   Difficulty,
   ProblemConfig,
   ProblemConfigInput,
} from './domain/problem-config-schema';
export {
   DEFAULT_INIT_COMMAND,
   DEFAULT_JUDGE_UPLOAD_PATH,
   DIFFICULTIES,
   problemConfigSchema,
} from './domain/problem-config-schema';
export type { Finding, Severity, ValidationReport } from './domain/validate';
export { CLI_NAME, CLI_VERSION } from './version';

/**
 * 出题配置的类型助手：运行时是恒等函数。
 *
 * 返回值刻意声明为 ProblemConfigInput 而不是泛型 T：
 * 泛型参数位置的对象字面量不会被做多余属性检查，
 * 拼错字段名（如 `tagId`）就会静默通过，而这正是它要防的事。
 */
export const defineProblemConfig = (
   config: ProblemConfigInput,
): ProblemConfigInput => config;
