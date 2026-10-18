/** 包的程序化入口（exports/main 指向这里）：零副作用，与 bin 入口分开以避免 jiti 加载配置时把 CLI 跑一遍；只依赖 problem-config-schema（纯 zod）。 */
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

/** 出题配置的类型助手（运行时恒等函数）；返回值刻意声明为 ProblemConfigInput 而非泛型 T，让拼错的字段名触发多余属性检查。 */
export const defineProblemConfig = (
   config: ProblemConfigInput,
): ProblemConfigInput => config;
