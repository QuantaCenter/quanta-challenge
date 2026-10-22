import { createInterface } from 'node:readline';
import {
   multiselect as clackMultiselect,
   select as clackSelect,
   isCancel,
} from '@clack/prompts';

import { CanceledError, UsageError } from '../core/errors';

export interface PromptIO {
   stdin: NodeJS.ReadStream;
   stderr: (chunk: string) => void;
   // @clack/core 要的是真正的可写流（读 isTTY、写光标控制序列），只给 write 函数会崩。
   stderrStream?: NodeJS.WriteStream;
}

const isInteractive = (stdin: NodeJS.ReadStream): boolean =>
   Boolean(stdin.isTTY) && typeof stdin.setRawMode === 'function';

/** 读取密码 / 令牌时不回显：TTY 下走 raw mode 收集按键（不用 readline 私有 API），非 TTY 降级为普通读取。 */
export const promptHidden = async (
   question: string,
   io: PromptIO,
): Promise<string> => {
   const { stdin, stderr } = io;

   if (!isInteractive(stdin)) {
      const rl = createInterface({ input: stdin, terminal: false });
      const answer = await new Promise<string>((resolve) => {
         rl.question(question, resolve);
      });
      rl.close();
      return answer.trim();
   }

   stderr(question);
   const wasRaw = Boolean(stdin.isRaw);
   stdin.setRawMode?.(true);
   stdin.resume();

   return new Promise<string>((resolve, reject) => {
      const chars: string[] = [];
      const cleanup = () => {
         stdin.setRawMode?.(wasRaw);
         stdin.removeListener('data', onData);
         stdin.pause();
         stderr('\n');
      };
      const onData = (chunk: Buffer) => {
         for (const char of chunk.toString('utf8')) {
            if (char === '\r' || char === '\n') {
               cleanup();
               resolve(chars.join(''));
               return;
            }
            if (char === '\u0003') {
               cleanup();
               reject(new CanceledError());
               return;
            }
            if (char === '\u007f' || char === '\b') {
               chars.pop();
               continue;
            }
            chars.push(char);
         }
      };
      stdin.on('data', onData);
   });
};

/** 普通可见输入（不需要隐藏的字段，如邮箱） */
export const promptVisible = async (
   question: string,
   io: PromptIO,
): Promise<string> => {
   const rl = createInterface({ input: io.stdin, terminal: false });
   const answer = await new Promise<string>((resolve) => {
      rl.question(question, resolve);
   });
   rl.close();
   return answer.trim();
};

/** 从管道读取全部内容（`echo $TOKEN | qpc login --password-stdin`） */
export const readAllStdin = async (
   stdin: NodeJS.ReadStream,
): Promise<string> => {
   const chunks: Buffer[] = [];
   for await (const chunk of stdin) {
      chunks.push(Buffer.from(chunk as Buffer));
   }
   return Buffer.concat(chunks).toString('utf8').trim();
};

export const confirm = async (
   question: string,
   io: PromptIO,
   defaultValue = false,
): Promise<boolean> => {
   if (!io.stdin.isTTY) {
      throw new UsageError('当前不是交互式终端，无法确认', {
         hint: '请在命令中显式加上 --yes 表示确认，或使用 --dry-run 预览。',
      });
   }
   const rl = createInterface({ input: io.stdin, terminal: false });
   const answer = await new Promise<string>((resolve) => {
      rl.question(`${question} ${defaultValue ? '[Y/n]' : '[y/N]'} `, resolve);
   });
   rl.close();
   const normalized = answer.trim().toLowerCase();
   if (normalized === '') return defaultValue;
   return normalized === 'y' || normalized === 'yes';
};

export interface SelectChoice<T extends string> {
   value: T;
   label: string;
   // 右侧灰字补充说明
   hint?: string;
}

// @clack/prompts 的 Option<Value> 在 Value 为泛型时会退化成联合类型，这里收敛成 Primitive 分支的形状。
interface ClackOption {
   value: string;
   label: string;
   hint?: string;
}

/** 方向键单选（@clack/prompts 的 select），比敲编号更接近 IDE 交互；非 TTY 直接抛用法错误。 */
export const select = async <T extends string>(
   message: string,
   choices: SelectChoice<T>[],
   io: PromptIO,
   options: { initialValue?: T; nonInteractiveHint?: string } = {},
): Promise<T> => {
   if (!isInteractive(io.stdin)) {
      throw new UsageError('当前不是交互式终端，无法选择', {
         hint:
            options.nonInteractiveHint ??
            '请在命令里显式指定，例如 `qpc init --type backend_service`。',
      });
   }

   const answer = await clackSelect<string>({
      message,
      options: choices.map(
         (choice): ClackOption => ({
            value: choice.value,
            label: choice.label,
            ...(choice.hint === undefined ? {} : { hint: choice.hint }),
         }),
      ),
      ...(options.initialValue === undefined
         ? {}
         : { initialValue: options.initialValue }),
      input: io.stdin,
      output: io.stderrStream ?? process.stderr,
   });

   if (isCancel(answer)) {
      throw new CanceledError('已取消选择');
   }
   return answer as T;
};

export interface MultiSelectChoice<T extends string> {
   value: T;
   label: string;
   hint?: string;
}

/** 方向键多选（空格切换，回车确认）。非 TTY 同样报用法错误，由调用方回落。 */
export const multiselect = async <T extends string>(
   message: string,
   choices: MultiSelectChoice<T>[],
   io: PromptIO,
   options: { initialValues?: T[]; required?: boolean } = {},
): Promise<T[]> => {
   if (!isInteractive(io.stdin)) {
      throw new UsageError('当前不是交互式终端，无法多选', {
         hint: '请在命令里显式指定，例如 `qpc tag --write 1,2`。',
      });
   }

   const answer = await clackMultiselect<string>({
      message,
      options: choices.map(
         (choice): ClackOption => ({
            value: choice.value,
            label: choice.label,
            ...(choice.hint === undefined ? {} : { hint: choice.hint }),
         }),
      ),
      ...(options.initialValues === undefined
         ? {}
         : { initialValues: options.initialValues }),
      ...(options.required === undefined ? {} : { required: options.required }),
      input: io.stdin,
      output: io.stderrStream ?? process.stderr,
   });

   if (isCancel(answer)) {
      throw new CanceledError('已取消选择');
   }
   return answer as T[];
};
