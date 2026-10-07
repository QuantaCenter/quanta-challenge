import { defineConfig } from 'vitest/config';

export default defineConfig({
   test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      // e2e 用子进程跑真实 CLI（含 init/check），留足冷启动时间。
      testTimeout: 30_000,
      hookTimeout: 30_000,
      restoreMocks: true,
      coverage: {
         provider: 'v8',
         reporter: ['text', 'html', 'lcov'],
         reportsDirectory: './coverage',
         include: ['src/**/*.ts'],
         exclude: [
            // 纯数据（脚手架模板字符串），用 e2e 断言其产物而不是统计行覆盖率
            'src/templates/**',
            // 进程入口，只有 exitCode 赋值
            'src/index.ts',
         ],
         thresholds: {
            lines: 70,
            functions: 70,
            branches: 70,
            statements: 70,
         },
      },
   },
});
