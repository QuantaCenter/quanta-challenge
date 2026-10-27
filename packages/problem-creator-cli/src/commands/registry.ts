import type { Command } from 'commander';

import type { CommandContext } from '../core/context';

/** 命令注册所需的共享依赖：命令模块只依赖此接口，单元测试可用假 context 直接调用。 */
export interface CommandRegistry {
   program: Command;
   /** 解析全局参数 + 读取凭据，得到一次命令执行的上下文 */
   context: () => Promise<CommandContext>;
}
