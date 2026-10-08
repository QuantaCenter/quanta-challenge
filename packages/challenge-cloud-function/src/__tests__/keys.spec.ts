import { describe, expect, it, vi } from 'vitest';

// 外部密钥解析会查库；单测里用替身，避免依赖真实数据库。
vi.mock('../utils/prisma', () => ({
   default: {
      cloudFunctionApiKey: {
         findUnique: vi.fn().mockResolvedValue(null),
      },
   },
}));

import { deriveSecret, resolveKey } from '../services/keys';

describe('API Key 派生', () => {
   it('同一 (master, keyId) 稳定；不同 keyId 不同', () => {
      const a1 = deriveSecret('cfk_a', 1);
      const a2 = deriveSecret('cfk_a', 1);
      const b = deriveSecret('cfk_b', 1);

      expect(a1).toBeTruthy();
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b);
   });

   it('未知主密钥版本返回 null', () => {
      expect(deriveSecret('cfk_a', 999)).toBeNull();
   });
});

describe('内部密钥解析', () => {
   it('web-app 是内部密钥且拥有 manage 权限、不受函数白名单限制', async () => {
      const resolved = await resolveKey('web-app');
      expect(resolved?.type).toBe('internal');
      expect(resolved?.scopes).toContain('manage');
      expect(resolved?.restricted).toBe(false);
   });

   it('judge 是内部密钥、仅 invoke、且始终受白名单约束（默认不允许任何函数）', async () => {
      const resolved = await resolveKey('judge');
      expect(resolved?.type).toBe('internal');
      expect(resolved?.scopes).toEqual(['invoke']);
      expect(resolved?.restricted).toBe(true);
      expect(resolved?.allowedFunctions).toEqual([]);
   });

   it('未知 keyId 返回 null', async () => {
      expect(await resolveKey('cfk_does_not_exist')).toBeNull();
   });
});
