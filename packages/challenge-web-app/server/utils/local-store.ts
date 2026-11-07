import path from 'path';
import type { IStore } from './i-store';
import fs from 'fs/promises';
import { resolveLocalStorePath } from '@challenge/shared/store';

export class LocalStore implements IStore {
   // 必须用统一的解析器：相对路径 './local_store' 会按进程 cwd 解析，
   // 与判题调度器的 cwd 不同，导致调度器写出的封面这里读不到（全部图片 404）。
   private storePath: string = resolveLocalStorePath();

   constructor() {
      fs.mkdir(this.storePath, { recursive: true });
   }

   private assetPath(key: string): string {
      if (!/^assets\/[0-9a-f-]+\.bin$/.test(key)) throw new Error('Invalid asset key');
      return path.join(this.storePath, key);
   }

   async saveAsset(key: string, buffer: Buffer): Promise<void> {
      const target = this.assetPath(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer, { flag: 'wx' });
   }

   async readAsset(key: string): Promise<Buffer> {
      return fs.readFile(this.assetPath(key));
   }

   async deleteAsset(key: string): Promise<void> {
      await fs.rm(this.assetPath(key), { force: true });
   }

   async listOldAssets(before: Date, limit: number, after = ''): Promise<string[]> {
      const directory = path.join(this.storePath, 'assets');
      let entries: string[];
      try {
         entries = await fs.readdir(directory);
      } catch (error) {
         if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
         throw error;
      }
      const result: string[] = [];
      for (const name of entries.sort()) {
         const key = `assets/${name}`;
         if (key <= after || !/^assets\/[0-9a-f-]+\.bin$/.test(key)) continue;
         try {
            const stat = await fs.stat(this.assetPath(key));
            if (stat.isFile() && stat.mtime < before) result.push(key);
         } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
         }
         if (result.length >= limit) break;
      }
      return result;
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
