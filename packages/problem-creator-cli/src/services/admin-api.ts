import type { Difficulty } from '../domain/problem-config';
import type { HttpClient } from './http';

export interface UploadProblemInput {
   title: string;
   detail: string;
   tagIds: number[];
   judgeScript: string;
   difficulty: Difficulty;
   totalScore: number;
   answerTemplateSnapshot: Record<string, string>;
   referenceAnswerSnapshot: Record<string, string>;
   coverMode: 'default' | 'custom';
   coverImageId?: string;
   bootCommand?: string;
   initCommand?: string;
   buildCommand?: string;
   judgeUploadPath: string;
}

/** 与 upload 同形，多一个 baseId：新版本挂在这个题号下 */
export interface ReuploadProblemInput extends UploadProblemInput {
   baseId: number;
}

export interface AuditCheckpointResult {
   score: number;
   totalScore: number;
   details: string;
   status: 'pass' | 'fail';
   cacheFiles?: Record<string, string>;
}

export interface AuditRecord {
   id: number;
   result: 'pending' | 'success' | 'failed';
   score: number;
   type: 'audit' | 'judge';
   info: AuditCheckpointResult[] | { errorMessage?: string };
   pendingTime?: number;
   judgingTime?: number;
   createdAt?: string;
}

export interface AuditDetail {
   pid: number;
   title: string;
   totalScore: number;
   /** 审计完成前是 draft，成功是 ready，失败是 invalid */
   status: 'draft' | 'ready' | 'invalid' | 'published';
   difficulty: Difficulty;
   tags: Array<{ name: string; color: string }>;
   imageName?: string;
   TemplateJudgeRecord?: Array<{ judgeRecord: AuditRecord }>;
   JudgeFile?: Array<{ judgeScript: string }>;
   BaseProblem?: { id: number; currentPid: number | null };
}

export interface ProblemListItem {
   pid: number;
   title: string;
   status: string;
   totalScore: number;
   difficulty: Difficulty;
   updatedAt?: string;
}

export interface CurrentUser {
   id: string;
   nickname?: string;
   email?: string;
   role?: string;
}

/**
 * 出题相关的 admin tRPC 接口封装。
 *
 * 只包这一层的目的：命令里不出现 URL 字符串，
 * 接口签名变化时改一处即可（并且能被单元测试用假 fetch 覆盖）。
 */
export interface AdminApi {
   login(input: { email: string; password: string }): Promise<{
      user: CurrentUser;
      csrfToken: string;
   }>;
   getCurrentUser(): Promise<CurrentUser>;
   uploadProblem(input: UploadProblemInput): Promise<{
      problemId: number;
      message: string;
   }>;
   /** 在已有 baseProblem 上创建新版本（题目改了配置但想保持 baseId 不变时用） */
   reuploadProblem(input: ReuploadProblemInput): Promise<{
      problemId: number;
      message: string;
   }>;
   getAuditDetail(problemId: number): Promise<AuditDetail>;
   setStatus(problemId: number, publish: boolean): Promise<{ message: string }>;
   listProblems(tagIds?: number[]): Promise<ProblemListItem[]>;
}

export const createAdminApi = (client: HttpClient): AdminApi => ({
   login: async (input) =>
      client.call<{ user: CurrentUser; csrfToken: string }>(
         'auth.login.email',
         {
            input,
            method: 'POST',
         },
      ),

   getCurrentUser: async () => {
      const result = await client.call<{ user: CurrentUser }>(
         'auth.login.getUser',
         {
            method: 'GET',
         },
      );
      return result.user;
   },

   uploadProblem: (input) =>
      client.call<{ problemId: number; message: string }>(
         'admin.problem.upload',
         {
            input,
            method: 'POST',
         },
      ),

   reuploadProblem: (input) =>
      client.call<{ problemId: number; message: string }>(
         'admin.problem.reupload',
         {
            input,
            method: 'POST',
         },
      ),

   getAuditDetail: (problemId) =>
      client.call<AuditDetail>('admin.problem.getAuditDetail', {
         input: { problemId },
         method: 'GET',
      }),

   setStatus: (problemId, publish) =>
      client.call<{ message: string }>('admin.problem.setStatus', {
         input: { problemId, publish },
         method: 'POST',
      }),

   listProblems: async (tagIds = []) => {
      const result = await client.call<
         { problems?: ProblemListItem[] } | ProblemListItem[]
      >('admin.problem.list', { input: { tids: tagIds }, method: 'GET' });
      if (Array.isArray(result)) return result;
      return result.problems ?? [];
   },
});

/** 从审计记录里取出检查点明细，兼容失败时只有 errorMessage 的情况 */
export const readAuditResults = (
   record: AuditRecord | undefined,
): { results: AuditCheckpointResult[]; errorMessage?: string } => {
   if (!record) return { results: [] };
   if (Array.isArray(record.info)) return { results: record.info };
   const errorMessage = (record.info as { errorMessage?: string }).errorMessage;
   return { results: [], errorMessage };
};
