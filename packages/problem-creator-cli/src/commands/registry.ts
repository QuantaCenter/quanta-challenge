import type { Command } from 'commander';

import type { CommandContext } from '../core/context';

/**
 * 命令注册所需的共享依赖。
 *
 * `context()` 由 cli.ts 提供（它才知道全局参数怎么解析），
 * 命令模块只依赖这个接口，因此单元测试可以直接构造一个 registry，
 * 用假的 context 调用命令逻辑，不必经过参数解析。
 */
export interface CommandRegistry {
   program: Command;
   /** 解析全局参数 + 读取凭据，得到一次命令执行的上下文 */
   context: () => Promise<CommandContext>;
}
