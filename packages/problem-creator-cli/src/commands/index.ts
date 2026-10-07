import { registerCheckCommand } from './check';
import { registerDoctorCommand } from './doctor';
import { registerInitCommand } from './init';
import { registerLoginCommand } from './login';
import { registerPublishCommand } from './publish';
import type { CommandRegistry } from './registry';
import { registerStatusCommand } from './status';
import { registerUploadCommand } from './upload';

export type { CommandRegistry } from './registry';

/**
 * 命令清单（也是 `qpc --help` 的顺序）。
 *
 * 顺序按出题人实际的使用顺序排：init → check → upload → status → publish，
 * 登录与自检放在最后，它们是一次性动作。
 */
export const registerCommands = (registry: CommandRegistry): void => {
   registerInitCommand(registry);
   registerCheckCommand(registry);
   registerUploadCommand(registry);
   registerStatusCommand(registry);
   registerPublishCommand(registry);
   registerLoginCommand(registry);
   registerDoctorCommand(registry);
};
