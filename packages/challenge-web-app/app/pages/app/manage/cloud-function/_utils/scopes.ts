/** API Key 权限的展示文案与配色，签发抽屉与列表共用。 */
export const SCOPE_META: Record<string, { label: string; color: string }> = {
   invoke: { label: '调用', color: 'text-secondary bg-secondary/15' },
   read: { label: '读取', color: 'text-primary bg-primary/15' },
   manage: { label: '管理', color: 'text-error bg-error/15' },
};

export const API_KEY_SCOPES = ['invoke', 'read', 'manage'] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
