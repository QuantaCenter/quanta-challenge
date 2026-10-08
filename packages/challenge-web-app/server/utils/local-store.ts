import path from 'path';
import { IStore } from './i-store';
import fs from 'fs/promises';
import { resolveLocalStorePath } from '@challenge/shared/store';

export class LocalStore implements IStore {
   // 必须用统一的解析器：相对路径 './local_store' 会按进程 cwd 解析，
   // 与判题调度器的 cwd 不同，导致调度器写出的封面这里读不到（全部图片 404）。
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
      return new File([new Uint8Array(buffer)], file);
   }

   async getBuffer(fileName: string): Promise<Buffer | null> {
      const filePath = path.join(this.storePath, fileName);
      try {
         return await fs.readFile(filePath);
      } catch {
         return null;
      }
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
