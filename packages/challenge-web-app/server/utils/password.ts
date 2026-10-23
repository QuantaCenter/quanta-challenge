import bcrypt from 'bcrypt';

/** 用 bcrypt 加密密码。 */
export const hashPassword = async (password: string) => {
   const { saltRounds } = useRuntimeConfig().password;
   const hash = await bcrypt.hash(password, saltRounds);
   return hash;
};

/** 用 bcrypt 比较明文密码与哈希密码，匹配返回 true。 */
export const comparePassword = async (password: string, hash: string) => {
   const isMatch = await bcrypt.compare(password, hash);
   return isMatch;
};
