import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/** 用 bcrypt 加密密码（默认盐轮数 10）。 */
export const hashPassword = async (password: string) => {
   const hash = await bcrypt.hash(password, SALT_ROUNDS);
   return hash;
};

/** 用 bcrypt 比较明文密码与哈希密码，匹配返回 true。 */
export const comparePassword = async (password: string, hash: string) => {
   const isMatch = await bcrypt.compare(password, hash);
   return isMatch;
};
