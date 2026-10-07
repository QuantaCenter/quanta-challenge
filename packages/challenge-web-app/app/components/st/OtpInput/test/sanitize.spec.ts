import { describe, expect, it } from 'vitest';
import { USER_CODE_ALPHABET, isValidUserCode } from '@challenge/shared/oauth';

import { sanitizeOtpInput } from '../sanitize';

/**
 * OTP 输入清洗逻辑。
 *
 * 这里覆盖的是"用户实际会怎么输入"，而不是理想路径 ——
 * 从终端复制设备码时几乎必然带上横线或空格，在手机上输入还常混入
 * 易混字符（0/O、1/I）。这些都必须被安静地修好，而不是让合法的码作废。
 */
const opts = { alphabet: USER_CODE_ALPHABET, maxLength: 8 };

describe('sanitizeOtpInput', () => {
   it('接受终端显示的标准格式（含中间横线）', () => {
      expect(sanitizeOtpInput('WDJB-MJHT', opts)).toBe('WDJBMJHT');
   });

   it('接受小写、空格、全角横线等粘贴变体', () => {
      for (const input of [
         'wdjb-mjht',
         'WDJB MJHT',
         ' WDJB-MJHT ',
         'WDJB—MJHT',
         'W D J B M J H T',
      ]) {
         expect(sanitizeOtpInput(input, opts), input).toBe('WDJBMJHT');
      }
   });

   it('剔除不在字符集内的字符（0/O 这类易混字符）', () => {
      // 0 不在 base20 里，用户看错输进来时应当被剔除而非让整个码作废
      expect(sanitizeOtpInput('WDJB-0JHT', opts)).toBe('WDJBJHT');
      // 剔除后长度不足，由调用方判定"还没输完"
      expect(isValidUserCode(sanitizeOtpInput('WDJB0JHT', opts))).toBe(false);
   });

   it('超长截断到 maxLength', () => {
      expect(sanitizeOtpInput('WDJBMJHTEXTRA', opts)).toBe('WDJBMJHT');
   });

   it('清洗结果对合法的完整码始终通过协议校验', () => {
      // 这是最关键的一条：清洗后必须能被共享层判定为合法，
      // 否则会出现"界面收下了、查询却总说格式不对"。
      for (const input of ['wdjb-mjht', 'WDJB MJHT', 'WDJB-MJHT']) {
         expect(isValidUserCode(sanitizeOtpInput(input, opts)), input).toBe(true);
      }
   });

   it('不传 alphabet 时放开为 A-Z0-9（组件默认行为）', () => {
      expect(sanitizeOtpInput('ab-12_34', { maxLength: 8 })).toBe('AB1234');
   });
});
