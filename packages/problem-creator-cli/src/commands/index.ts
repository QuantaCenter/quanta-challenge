import { registerAgentCommand } from './agent';
import { registerCheckCommand } from './check';
import { registerCoverCommand } from './cover';
import { registerDoctorCommand } from './doctor';
import { registerGenImgCommand } from './gen-img';
import { registerImageCommand } from './image';
import { registerInitCommand } from './init';
import { registerLoginCommand } from './login';
import { registerPublishCommand } from './publish';
import type { CommandRegistry } from './registry';
import { registerStatusCommand } from './status';
import { registerTagCommand } from './tag';
import { registerUploadCommand } from './upload';

export type { CommandRegistry } from './registry';

/** 命令清单（也是 `qpc --help` 的顺序）：按出题人实际使用顺序排，登录与自检放最后。 */
export const registerCommands = (registry: CommandRegistry): void => {
   registerAgentCommand(registry);
   registerInitCommand(registry);
   registerTagCommand(registry);
   registerGenImgCommand(registry);
   registerImageCommand(registry);
   registerCoverCommand(registry);
   registerCheckCommand(registry);
   registerUploadCommand(registry);
   registerStatusCommand(registry);
   registerPublishCommand(registry);
   registerLoginCommand(registry);
   registerDoctorCommand(registry);
};
