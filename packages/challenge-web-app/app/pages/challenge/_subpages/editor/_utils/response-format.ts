export interface IResponseState {
   status: number;
   statusText: string;
   headers: [string, string][];
   bodyText: string;
   byteLength: number;
   durationMs: number;
}

/** 展示上限：超大响应只截断**展示**，不影响请求本身 */
export const MAX_BODY_CHARS = 200_000;

export const formatBytes = (bytes: number) => {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const formatDuration = (ms: number) =>
   ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;

export const statusClass = (status: number) => {
   if (status < 300) return 'text-success bg-success/15';
   if (status < 400) return 'text-warning bg-warning/15';
   return 'text-error bg-error/15';
};
