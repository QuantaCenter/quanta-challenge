/** 服务端要求的最低 CLI 版本，可用 NUXT_QUANTA_MIN_CLI_VERSION 覆盖 */
export const MIN_CLI_VERSION = '1.2.0';

/** 从 user-agent 取 CLI 版本号（形如 qpc/1.2.0），取不到返回 undefined */
export const parseCliVersionFromUserAgent = (
   userAgent: string | undefined
): string | undefined => /qpc\/(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/i.exec(userAgent ?? '')?.[1];

interface ParsedVersion {
   core: [number, number, number];
   /** 预发布号（`1.1.0-beta.1` → `['beta','1']`）；正式版为 undefined */
   prerelease: string[] | undefined;
}

const parseVersion = (version: string): ParsedVersion | undefined => {
   const matched = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(
      version.trim()
   );
   if (!matched) return undefined;
   return {
      core: [Number(matched[1]), Number(matched[2]), Number(matched[3])],
      prerelease: matched[4]?.split('.'),
   };
};

/** 同号版本下预发布号低于正式版，前缀更短者更低 */
const comparePrerelease = (a: string[], b: string[]): number => {
   for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i];
      const y = b[i];
      if (x === undefined) return -1;
      if (y === undefined) return 1;
      const numericX = Number(x);
      const numericY = Number(y);
      const bothNumeric =
         Number.isFinite(numericX) &&
         Number.isFinite(numericY) &&
         x !== '' &&
         y !== '';
      if (bothNumeric ? numericX !== numericY : x !== y) {
         return (bothNumeric ? numericX < numericY : x < y) ? -1 : 1;
      }
   }
   return 0;
};

/** a 旧于 b 返回 -1，相同 0，更新 1；无法解析返回 undefined */
export const compareVersions = (
   a: string,
   b: string
): number | undefined => {
   const parsedA = parseVersion(a);
   const parsedB = parseVersion(b);
   if (!parsedA || !parsedB) return undefined;

   for (let i = 0; i < 3; i++) {
      if (parsedA.core[i] !== parsedB.core[i]) {
         return parsedA.core[i]! < parsedB.core[i]! ? -1 : 1;
      }
   }
   if (!parsedA.prerelease && !parsedB.prerelease) return 0;
   if (!parsedA.prerelease) return 1;
   if (!parsedB.prerelease) return -1;
   return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
};

/** 版本是否达到门槛；缺失或无法解析按不满足处理 */
export const isCliVersionSatisfied = (
   version: string | undefined,
   minVersion: string = MIN_CLI_VERSION
): boolean => {
   if (!version) return false;
   const compared = compareVersions(version, minVersion);
   return compared !== undefined && compared >= 0;
};
