import bcrypt from 'bcrypt';

/**
 * bcrypt 盐轮数：服务端读 runtimeConfig；scripts/prisma-seed.ts 在 Nuxt 之外直接用 node 运行，
 * 没有 useRuntimeConfig，回退到同名环境变量（默认值与 nuxt.config.ts 保持一致）。
 */
const resolveSaltRounds = () => {
   if (typeof useRuntimeConfig === 'function') {
      return useRuntimeConfig().password.saltRounds;
   }
   const fromEnv = Number.parseInt(process.env.PASSWORD_SALT_ROUNDS ?? '', 10);
   return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 10;
};

/** 用 bcrypt 加密密码。 */
export const hashPassword = async (password: string) => {
   const hash = await bcrypt.hash(password, resolveSaltRounds());
   return hash;
};

/** 用 bcrypt 比较明文密码与哈希密码，匹配返回 true。 */
export const comparePassword = async (password: string, hash: string) => {
   const isMatch = await bcrypt.compare(password, hash);
   return isMatch;
};
