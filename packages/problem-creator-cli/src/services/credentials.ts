import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { ConfigError } from '../core/errors';
import { pathExists, readText, writeTextWithMode } from '../utils/fs';

export const credentialsSchema = z.object({
   version: z.literal(1),
   apiUrl: z.string().optional(),
   cookies: z.object({
      access: z.string().optional(),
      refresh: z.string().optional(),
      csrf: z.string().optional(),
   }),
   user: z
      .object({
         id: z.string(),
         nickname: z.string().optional(),
         email: z.string().optional(),
         role: z.string().optional(),
      })
      .optional(),
   updatedAt: z.string().optional(),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type CookieJar = Credentials['cookies'];

export const emptyCredentials = (): Credentials => ({
   version: 1,
   cookies: {},
});

/**
 * 凭据目录遵循 XDG：显式 QUANTA_CONFIG_DIR > XDG_CONFIG_HOME > ~/.config。
 * 不放在项目目录里，避免"换一个题目目录就要重新登录"
 * 以及误把令牌提交进版本库。
 */
export const resolveConfigDir = (
   env: NodeJS.ProcessEnv = process.env,
): string => {
   const explicit = env.QUANTA_CONFIG_DIR;
   if (explicit) return explicit;
   const xdg = env.XDG_CONFIG_HOME;
   if (xdg) return xdg;
   return join(homedir(), '.config');
};

export const credentialsPath = (configDir: string): string =>
   join(configDir, 'quanta', 'credentials.json');

export const readCredentials = async (file: string): Promise<Credentials> => {
   if (!(await pathExists(file))) return emptyCredentials();
   const raw = await readText(file);
   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch (error) {
      throw new ConfigError(`凭据文件不是合法 JSON：${file}`, {
         cause: error,
         hint: '执行 `qpc logout` 后重新 `qpc login`。',
      });
   }
   const result = credentialsSchema.safeParse(parsed);
   if (!result.success) {
      throw new ConfigError(`凭据文件结构无法识别：${file}`, {
         details: { issues: result.error.issues.map((i) => i.message) },
         hint: '执行 `qpc logout` 后重新 `qpc login`。',
      });
   }
   return result.data;
};

/** 凭据是令牌，权限必须是 0600：同机器上的其它用户不应能读到 */
export const writeCredentials = async (
   file: string,
   credentials: Credentials,
): Promise<void> => {
   await writeTextWithMode(
      file,
      `${JSON.stringify({ ...credentials, updatedAt: new Date().toISOString() }, null, 3)}\n`,
      0o600,
   );
};

export const removeCredentials = async (file: string): Promise<boolean> => {
   const { rm } = await import('node:fs/promises');
   if (!(await pathExists(file))) return false;
   await rm(file, { force: true });
   return true;
};
