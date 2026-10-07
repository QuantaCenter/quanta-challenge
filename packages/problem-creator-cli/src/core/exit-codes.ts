/**
 * 退出码是 CLI 的对外契约（CI、脚本、pre-commit 都靠它判断结果），
 * 因此集中定义、禁止在命令里硬编码数字。
 */
export const EXIT = {
   /** 全部成功 */
   OK: 0,
   /** 未分类的运行时错误 */
   FAILURE: 1,
   /** 参数/配置用法错误（用户输入问题，不是 bug） */
   USAGE: 2,
   /** 预检或审计未通过（题目本身不合格，需要改题目而不是改脚本） */
   PRECHECK_FAILED: 3,
   /** 网络或服务端 5xx */
   NETWORK: 4,
   /** 未登录 / 令牌失效 / 权限不足 */
   AUTH: 5,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
