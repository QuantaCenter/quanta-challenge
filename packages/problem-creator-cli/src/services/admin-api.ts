import type { BackendServiceImageId } from '@challenge/shared/backend-service-image';
import type { Difficulty } from '../domain/problem-config';
import type { HttpClient } from './http';

export interface UploadedImage {
   id: string;
   name: string;
}

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
   /** 题型：frontend（默认）或 backend_service */
   problemType?: 'frontend' | 'backend_service';
   /** 后端服务：初始镜像 id（见 @challenge/shared/backend-service-image） */
   serviceImage?: BackendServiceImageId;
   /** 后端服务：服务监听端口 */
   servicePort?: number;
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

export interface Tag {
   tid: number;
   name: string;
   color?: string | null;
   description?: string | null;
}

export interface CurrentUser {
   id: string;
   nickname?: string;
   email?: string;
   role?: string;
}

/** 出题相关的 admin tRPC 接口封装：命令里不出现 URL 字符串，接口变化改一处即可。 */
export interface AdminApi {
   login(input: { email: string; password: string }): Promise<{
      user: CurrentUser;
      csrfToken: string;
   }>;
   getCurrentUser(): Promise<CurrentUser>;
   /** 上传图片（`qpc cover --upload` 用它把生成的封面变成 imageId） */
   uploadImage(input: {
      fileBase64: string;
      fileName: string;
   }): Promise<UploadedImage>;
   uploadProblem(input: UploadProblemInput): Promise<{
      problemId: number;
      message: string;
   }>;
   /**
    * 更新已有基础题目（baseId）：只改基本信息（标题/描述/标签/难度/封面）时原地生效（mode=quick），
    * 否则创建新版本并进入审核（mode=audit）。旧版服务端不返回 mode，按 audit 处理。
    */
   reuploadProblem(input: UploadProblemInput & { baseId: number }): Promise<{
      problemId: number;
      message: string;
      mode?: 'quick' | 'audit';
      auditReasons?: string[];
   }>;
   getAuditDetail(problemId: number): Promise<AuditDetail>;
   setStatus(problemId: number, publish: boolean): Promise<{ message: string }>;
   listProblems(tagIds?: number[]): Promise<ProblemListItem[]>;
   /** 平台全部标签（public.tag.list，无需登录） */
   listTags(): Promise<Tag[]>;
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
      client.call<{
         problemId: number;
         message: string;
         mode?: 'quick' | 'audit';
         auditReasons?: string[];
      }>('admin.problem.reupload', {
         input,
         method: 'POST',
      }),

   uploadImage: (input) =>
      client.call<UploadedImage>('admin.image.upload', {
         input,
         method: 'POST',
      }),

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

   listTags: async () => {
      const tags = await client.call<RawTag[]>('public.tag.list', {
         method: 'GET',
      });
      return tags.map((tag) => ({
         tid: tag.tid,
         name: tag.name,
         color: tag.color ?? null,
         description: tag.description ?? null,
      }));
   },
});

/** `public.tag.list` 原样返回数据库整行，这里只声明用到的字段 */
interface RawTag {
   tid: number;
   name: string;
   color?: string | null;
   description?: string | null;
}

/** 取本题版本的判题记录（服务端按关系返回，[0] 即当前版本那条） */
export const auditRecordOf = (detail: AuditDetail): AuditRecord | undefined =>
   detail.TemplateJudgeRecord?.[0]?.judgeRecord;

/** 审计是否已到终局：status 离开 draft 即算结束（失败时调度器只改 status 不补判题记录）。 */
export const isAuditSettled = (detail: AuditDetail): boolean => {
   if (detail.status !== 'draft') return true;
   const record = auditRecordOf(detail);
   return record !== undefined && record.result !== 'pending';
};

/** 从审计记录里取出检查点明细，兼容失败时只有 errorMessage 的情况 */
export const readAuditResults = (
   record: AuditRecord | undefined,
): { results: AuditCheckpointResult[]; errorMessage?: string } => {
   if (!record) return { results: [] };
   if (Array.isArray(record.info)) return { results: record.info };
   const errorMessage = (record.info as { errorMessage?: string }).errorMessage;
   return { results: [], errorMessage };
};
