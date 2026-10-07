import { createInterface } from 'node:readline';

import { CanceledError, UsageError } from '../core/errors';

export interface PromptIO {
   stdin: NodeJS.ReadStream;
   stderr: (chunk: string) => void;
}

const isInteractive = (stdin: NodeJS.ReadStream): boolean =>
   Boolean(stdin.isTTY) && typeof stdin.setRawMode === 'function';

/**
 * 读取密码 / 令牌时不回显。
 *
 * TTY 下走 raw mode 自己收集按键，而不是覆盖 readline 的私有 `_writeToOutput`：
 * 私有 API 在 Node 大版本间改过签名，出问题时表现为"密码被明文打印到终端"，
 * 属于安全缺陷而不是体验问题。
 * 非 TTY（CI、管道、`echo pass | qpc login`）降级为普通读取。
 */
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
