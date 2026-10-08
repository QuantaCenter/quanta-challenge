import path from 'path';
import type { IStore } from './i-store';
import fs from 'fs/promises';
import { resolveLocalStorePath } from '../../utils/local-store-path';

export class LocalStore implements IStore {
   // 相对路径 './local_store' 会按进程 cwd 解析，不同进程会落到不同目录，
   // 导致写入方与读取方看到不同的文件。统一走解析器。
   private storePath: string = resolveLocalStorePath();

   constructor() {
      fs.mkdir(this.storePath, { recursive: true });
   }

   async save(buffer: Buffer, name: string) {
      const fileId = crypto.randomUUID();
      const extension = path.extname(name);
      const filePath = path.join(this.storePath, `${fileId}${extension}`);
      await fs.writeFile(filePath, buffer as unknown as Uint8Array);
      return fileId;
   }

   async get(fileId: string): Promise<File | null> {
      const files = await fs.readdir(this.storePath);
      const file = files.find((f) => f.startsWith(fileId));
      if (!file) return null;
      const buffer = await fs.readFile(path.join(this.storePath, file));
      return new File([buffer], file);
   }

   async exists(fileId: string): Promise<boolean> {
      const files = await fs.readdir(this.storePath);
      return files.some((f) => f.startsWith(fileId));
   }

   async delete(fileId: string): Promise<void> {
      return fs.readdir(this.storePath).then((files) => {
         const file = files.find((f) => f.startsWith(fileId));
         if (file) {
            return fs.unlink(path.join(this.storePath, file));
         }
         return Promise.resolve();
      });
   }

   async list(): Promise<string[]> {
      const files = await fs.readdir(this.storePath);
      return files;
   }

   async url(fileId: string): Promise<string> {
      const file = await this.get(fileId);
      if (!file) throw new Error('File not found');
      return `static/${file.name}`;
   }

   cleanup(): Promise<void> {
      throw new Error('Method not implemented.');
   }
}
