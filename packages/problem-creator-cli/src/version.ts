import { readFileSync } from 'node:fs';

export const CLI_NAME = 'qpc';
export const CLI_DESCRIPTION = 'Quanta 出题工具：脚手架、离线预检、上传与发布';

const readVersion = (): string => {
   try {
      const raw = readFileSync(
         new URL('../package.json', import.meta.url),
         'utf8',
      );
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version ?? '0.0.0';
   } catch {
      return '0.0.0';
   }
};

export const CLI_VERSION = readVersion();
