import type { IStoreService } from './store';
import path from 'path';
import fs from 'fs/promises';
import { Singleton } from './singleton';
import { resolveLocalStorePath } from '@challenge/shared/store';

export class LocalStoreService extends Singleton implements IStoreService {
   static get instance() {
      return this.getInstance<LocalStoreService>();
   }

   // 必须与 Web 应用的 /api/static 用同一个目录，否则判题生成的题目封面全部 404。
   private storePath: string = resolveLocalStorePath();

   private constructor() {
      super();
      fs.mkdir(this.storePath, { recursive: true });
   }

   async save(buffer: Buffer, name: string) {
      const fileId = crypto.randomUUID();
      const extension = path.extname(name);
      const filePath = path.join(this.storePath, `${fileId}${extension}`);
      await fs.writeFile(filePath, buffer);
      return fileId;
   }

   async get(fileId: string): Promise<File | null> {
      const files = await fs.readdir(this.storePath);
      const file = files.find((f) => f.startsWith(fileId));
      if (!file) return null;
      const buffer = await fs.readFile(path.join(this.storePath, file));
      return new File([buffer], file);
   }

   async url(fileId: string): Promise<string> {
      const file = await this.get(fileId);
      if (!file) throw new Error('File not found');
      return new URL(
         `/static/${file.name}`,
         process.env.APP_SERVER_URL || 'http://localhost:3000'
      ).toString();
   }
}
