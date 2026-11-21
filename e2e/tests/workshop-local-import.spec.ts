import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';

test('从本地文件夹导入保留目录结构和二进制文件', async ({ page }) => {
   const folder = await mkdtemp(join(tmpdir(), 'quanta-workshop-'));
   const name = `本地导入 ${randomUUID().slice(0, 8)}`;
   const text = 'export const title = "工坊";\r\n';
   const binary = Buffer.from([0, 1, 2, 13, 10, 255]);
   const files = {
      'src/示例.ts': text,
      'project/assets/data.bin': binary,
      '.gitignore': 'node_modules\n',
      'empty.txt': '',
      '.git/config': 'ignored',
      'src/node_modules/example/index.js': 'ignored',
   };
   let projectId: string | undefined;
   const headers = { 'x-csrf-token': '' };
   try {
      const csrf = (await page.context().cookies()).find(({ name }) => name === 'quanta_csrf_token');
      if (!csrf) throw new Error('工坊测试需要已登录的会话');
      headers['x-csrf-token'] = csrf.value;
      for (const [path, content] of Object.entries(files)) {
         const target = join(folder, path);
         await mkdir(dirname(target), { recursive: true });
         await writeFile(target, content);
      }

      await page.goto('/app/workshop', { waitUntil: 'networkidle' });
      const localButton = page.getByRole('button', { name: '从本地文件夹导入' });
      const githubButton = page.getByRole('button', { name: '从 GitHub 导入' });
      await expect(localButton).toBeVisible();
      await expect(githubButton).toBeVisible();
      expect((await localButton.boundingBox())!.x).toBeLessThan((await githubButton.boundingBox())!.x);
      await localButton.click();
      const drawer = page.getByRole('dialog', { name: '从本地文件夹导入' });
      const next = drawer.getByRole('button', { name: '下一步' });
      await expect(next).toBeDisabled();

      const chooserPromise = page.waitForEvent('filechooser');
      await drawer.getByRole('button', { name: '选择文件夹' }).click();
      await (await chooserPromise).setFiles(folder);
      await next.click();
      const preview = drawer.getByRole('region', { name: '文件夹目录预览' });
      await expect(preview.getByText('4 个文件', { exact: true })).toBeVisible();
      await expect(preview.getByText('已跳过 2 个', { exact: false })).toBeVisible();
      await preview.getByText('src', { exact: true }).click();
      await expect(preview.getByText('示例.ts', { exact: true })).toBeVisible();
      await next.click();
      const nameInput = drawer.getByRole('textbox', { name: '项目名称' });
      await expect(nameInput).toHaveValue(basename(folder));
      await nameInput.fill(name);
      await drawer.getByRole('button', { name: '上一步' }).click();
      await expect(preview).toBeVisible();
      await next.click();
      await expect(nameInput).toHaveValue(name);

      const responsePromise = page.waitForResponse((response) =>
         response.url().endsWith('/api/workshop/import/local') && response.request().method() === 'POST',
      );
      await drawer.getByRole('button', { name: '确认导入' }).click();
      const response = await responsePromise;
      expect(response.ok(), response.ok() ? undefined : await response.text()).toBe(true);
      ({ id: projectId } = await response.json());

      await expect(drawer).toBeHidden();
      const card = page.getByRole('link').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(card).toHaveAttribute('href', `/workshop/${projectId}`);
      await expect(card.getByText('本地文件夹', { exact: true })).toBeVisible();

      const read = await page.request.get('/api/trpc/protected.workshop.get', {
         headers,
         params: { input: JSON.stringify({ id: projectId }) },
      });
      await expect(read).toBeOK();
      const { template, project, files: saved } = (await read.json()).result.data;
      expect(template).toBeNull();
      expect(project).toMatchObject({ name, source: 'local', importStatus: 'ready' });
      const asset = saved.find(({ path }: { path: string }) => path === '/project/project/assets/data.bin');
      expect(asset.assetId).toBeTruthy();
      expect(saved).toEqual(expect.arrayContaining([
         expect.objectContaining({ path: '/project/src/示例.ts', content: text }),
         expect.objectContaining({ path: '/project/.gitignore', content: files['.gitignore'] }),
         expect.objectContaining({ path: '/project/empty.txt', content: '' }),
         expect.objectContaining({ path: '/project/project/assets/data.bin', content: null }),
      ]));
      expect(saved).toHaveLength(4);
      const download = await page.request.get(`/api/workshop/projects/${projectId}/assets/${asset.assetId}`);
      await expect(download).toBeOK();
      expect(await download.body()).toEqual(binary);
   } finally {
      if (projectId) {
         await page.request.post('/api/trpc/protected.workshop.delete', { headers, data: { id: projectId } });
      }
      await rm(folder, { recursive: true, force: true });
   }
});
