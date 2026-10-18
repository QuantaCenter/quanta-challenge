import path from 'path';
import os from 'os';
import { Singleton } from '../utils/singleton';
import { logger } from '../utils/logger';
import fs from 'fs/promises';

export class TempFileService extends Singleton {
   static get instance() {
      return this.getInstance<TempFileService>();
   }

   private constructor(
      // 默认用 os.tmpdir()：硬编码 '/tmp' 在 Windows 上会误判为绝对路径，bind mount 直接报错。
      public readonly tempDir: string = process.env.TEMP_DIR || os.tmpdir()
   ) {
      super();
   }

   resolvePath(fileName: string): string {
      // TEMP_DIR 为绝对路径时必须原样使用（容器部署必需），相对路径仍按 cwd 解析。
      if (path.isAbsolute(this.tempDir)) {
         return path.join(this.tempDir, fileName);
      }
      return path.join(process.cwd(), this.tempDir, fileName);
   }

   async restoreFileSystem(fsSnapshot: Record<string, string>) {
      const fsName = crypto.randomUUID();
      const fsRootPath = this.resolvePath(fsName);

      for (const [filePath, content] of Object.entries(fsSnapshot)) {
         const fullPath = path.join(fsRootPath, filePath);
         const dir = path.dirname(fullPath);
         await fs.mkdir(dir, { recursive: true });
         if (content.startsWith('data:image')) {
            const base64Content = content.split(',')[1];
            const buffer = Buffer.from(base64Content, 'base64');
            await fs.writeFile(fullPath, buffer);
         } else {
            await fs.writeFile(fullPath, content);
         }
      }

      return { fsName, fsRootPath };
   }

   async cleanup(fsRootPath: string) {
      if (!fsRootPath.startsWith(this.resolvePath('.'))) {
         throw new Error(
            `Cannot clean up files outside of the temporary directory: ${fsRootPath}`
         );
      }
      try {
         await fs.rm(fsRootPath, { recursive: true, force: true });
      } catch (error) {
         logger.error(
            { err: error },
            `Error cleaning up temporary file system at ${fsRootPath}`
         );
      }
   }
}
