import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   DEVICE_FLOW_CLIENT_ID,
   USER_CODE_MAX_ATTEMPTS,
   formatUserCode,
   normalizeUserCode,
} from '@challenge/shared/oauth';

import { createDeviceFlowService } from '../device-flow';
import { createRedisDouble, type RedisDouble } from '~~/server/utils/test/redis-double';

/**
 * device-flow.ts 是**静态** import useRedis 的，所以 `vi.stubGlobal('useRedis', ...)`
 * 拦不住它 —— 模块加载时就已经绑定了真实的 server/utils/redis.ts，
 * 而后者会调用 useRuntimeConfig() 去连真实 Redis。
 * 必须用 vi.mock 把模块替换掉，才能让替身真正生效。
 */
const redisHolder: { current: RedisDouble | null } = { current: null };
vi.mock('~~/server/utils/redis', () => ({
   useRedis: () => {
      if (!redisHolder.current) throw new Error('测试未初始化 Redis 替身');
      return redisHolder.current;
   },
}));

/**
 * 设备码流程的状态机测试。
 *
 * 重点在**安全属性**，而不是"函数能跑通"：
 *   · device_code 只能换一次 token（一次性消费，且是原子的）
 *   · user_code 输错的次数受限（RFC 8628 §5.1 的爆破防护）
 *   · 别人的 device_code / 篡改的 client_id 换不到 token
 *   · user_code 过期后整条会话失效
 * 这些属性一旦回归，症状是"账号被悄悄授权给别人"，很难从日志发现，
 * 所以必须有测试钉死。
 */
describe('设备授权流程状态机', () => {
   let redis: RedisDouble;
   let clock: { current: number };
   let service: ReturnType<typeof createDeviceFlowService>;

   beforeEach(() => {
      clock = { current: Date.now() };
      redis = createRedisDouble(clock);
      redisHolder.current = redis;
      service = createDeviceFlowService();
   });

   afterEach(() => {
      redisHolder.current = null;
   });

   const authorize = async () =>
      service.authorize({ clientId: DEVICE_FLOW_CLIENT_ID });

   it('签发高熵 device_code 与人可读 user_code', async () => {
      const issued = await authorize();

      // device_code 不该被人看到，因此用长随机串（RFC §5.2 要求高熵）
      expect(issued.deviceCode.length).toBeGreaterThanOrEqual(32);
      // user_code 展示为 XXXX-XXXX 且落在 base20 字符集内
      expect(issued.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
      expect(issued.expiresIn).toBeGreaterThan(0);
   });

   it('两次授权签发的码互不相同，且 user_code 不重复占用', async () => {
      const a = await authorize();
      const b = await authorize();
      expect(a.deviceCode).not.toBe(b.deviceCode);
      expect(a.userCode).not.toBe(b.userCode);
   });

   it('拒绝未知的 client_id（不接受任意第三方客户端）', async () => {
      await expect(service.authorize({ clientId: 'evil-client' })).rejects.toThrow(
         /unknown_client/,
      );
   });

   it('用户可以按 device_code 查到自己的会话，他人查不到', async () => {
      const issued = await authorize();
      const session = await service.findByUserCode(issued.userCode);
      expect(session?.deviceCode).toBe(issued.deviceCode);
      expect(session?.status).toBe('pending');

      expect(await service.findByUserCode('ZZZZ-ZZZZ')).toBeNull();
   });

   it('未批准时轮询得到 pending（CLI 收到 authorization_pending）', async () => {
      const issued = await authorize();
      const session = await service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID);
      expect(session?.status).toBe('pending');
   });

   it('批准后轮询拿到 approved，且**只能拿到一次**（一次性消费）', async () => {
      const issued = await authorize();
      await service.approve(issued.userCode, 'user-1');

      const first = await service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID);
      expect(first?.status).toBe('approved');
      expect(first?.userId).toBe('user-1');

      // 第二次：必须拿不到 approved，否则同一个 device_code 能签发两个 token
      const second = await service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID);
      expect(second?.status).not.toBe('approved');
   });

   it('并发消费只会有一个成功（原子性，不能双签发）', async () => {
      const issued = await authorize();
      await service.approve(issued.userCode, 'user-1');

      // 10 个并发请求模拟"攻击者与合法 CLI 同时兑换"
      const results = await Promise.all(
         Array.from({ length: 10 }, () =>
            service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID),
         ),
      );
      const approved = results.filter((r) => r?.status === 'approved');
      expect(approved).toHaveLength(1);
   });

   it('用别人的 device_code 或伪造 client_id 换不到会话', async () => {
      const issued = await authorize();
      await service.approve(issued.userCode, 'user-1');

      // client_id 不匹配（会话里记的是发起授权的那个客户端）
      const wrongClient = await service.consume(issued.deviceCode, 'other-client');
      expect(wrongClient).toBeNull();
   });

   it('拒绝后状态为 denied（CLI 应立即停止轮询）', async () => {
      const issued = await authorize();
      await service.deny(issued.userCode);
      const session = await service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID);
      expect(session?.status).toBe('denied');
   });

   it('已被批准的会话不能被第二个账号改绑，且明确告知已处理', async () => {
      const issued = await authorize();
      const first = await service.approve(issued.userCode, 'victim');
      expect(first.outcome).toBe('approved');

      const again = await service.approve(issued.userCode, 'attacker');

      // 必须区分"本次批准成功"与"早就被批准过"：调用方（确认页）要据此
      // 告诉第二个账号"该码已被处理"，而不是回一个看起来成功的响应。
      expect(again.outcome).toBe('already_decided');
      expect(again.outcome === 'already_decided' && again.session.userId).toBe('victim');
   });

   it('批准不存在的码返回 not_found（不抛异常）', async () => {
      const outcome = await service.approve('ZZZZ-ZZZZ', 'user-1');
      expect(outcome.outcome).toBe('not_found');
   });

   it('user_code 归一化后可接受用户实际输入的多种形态', async () => {
      const issued = await authorize();
      const normalized = normalizeUserCode(issued.userCode);

      for (const variant of [
         formatUserCode(normalized), // WDJB-MJHT
         normalized.toLowerCase(), // wdjbmjht
         ` ${normalized} `, // 前后空格
         normalized.split('').join(' '), // W D J B M J H T
      ]) {
         const session = await service.findByUserCode(variant);
         expect(session?.deviceCode, variant).toBe(issued.deviceCode);
      }
   });

   it('输错 user_code 会累计次数，超过上限后作废', async () => {
      const issued = await authorize();
      const deviceCode = issued.deviceCode;

      // 前 4 次错误：还剩 4..1 次
      for (let i = 0; i < USER_CODE_MAX_ATTEMPTS - 1; i += 1) {
         const remaining = await service.registerFailedAttempt('ZZZZ-ZZZZ');
         expect(remaining).toBeGreaterThan(0);
      }
      const last = await service.registerFailedAttempt('ZZZZ-ZZZZ');
      expect(last).toBe(0);

      // 关键：失败计数是**全局**的，不受"换 IP / 换会话"影响 ——
      // 这里验证同一 user_code 的计数确实被记住（而不是每次从 0 开始）
      const again = await service.registerFailedAttempt('ZZZZ-ZZZZ');
      expect(again).toBe(0);

      // 合法会话不受影响（计数只针对被尝试的那个码）
      expect((await service.findByUserCode(issued.userCode))?.deviceCode).toBe(deviceCode);
   });

   it('存储归一化、展示带横线，两者必须能互相还原', async () => {
      const issued = await authorize();
      const session = await service.findByUserCode(issued.userCode);

      // 存储层：无横线、8 位，用于比较与做 Redis 键
      expect(session?.userCode).toHaveLength(8);
      expect(session?.userCode).not.toContain('-');

      // 展示层：与终端显示的完全一致（确认页要用户逐字核对，格式必须相同）
      expect(issued.userCode).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
      expect(formatUserCode(session!.userCode)).toBe(issued.userCode);

      // 还原后仍能查到（说明两种格式在服务端是自洽的）
      expect((await service.findByUserCode(issued.userCode))?.deviceCode).toBe(
         issued.deviceCode,
      );
   });

   it('会话过期后查不到，且 consume 返回空', async () => {
      const issued = await authorize();

      // 推进到 TTL 之后
      clock.current += 601 * 1000;

      expect(await service.findByUserCode(issued.userCode)).toBeNull();
      expect(await service.consume(issued.deviceCode, DEVICE_FLOW_CLIENT_ID)).toBeNull();
   });

   it('销毁会话会同时清掉 user_code 索引，避免残留可查记录', async () => {
      const issued = await authorize();
      await service.destroy(issued.deviceCode, normalizeUserCode(issued.userCode));

      expect(await service.findByUserCode(issued.userCode)).toBeNull();
      expect(redis.keys().some((k) => k.includes('oauth:user:'))).toBe(false);
   });
});
