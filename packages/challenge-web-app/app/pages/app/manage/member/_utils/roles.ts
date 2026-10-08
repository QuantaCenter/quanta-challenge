import type { ISelectOption } from '~/components/st/Select/type';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type RoleFilter = 'ALL' | UserRole;

export const ROLE_META = {
   SUPER_ADMIN: { text: '超级管理员', color: '#fe4e4e' },
   ADMIN: { text: '管理员', color: '#fa7c0e' },
   USER: { text: '普通用户', color: '#434343' },
} as const;

export const ROLE_VALUES = ['SUPER_ADMIN', 'ADMIN', 'USER'] as const;

export const isRoleValue = (value: unknown): value is UserRole =>
   ROLE_VALUES.includes(value as UserRole);

/** 筛选下拉：带「全部角色」 */
export const ROLE_OPTIONS: { label: string; value: RoleFilter }[] = [
   { label: '全部角色', value: 'ALL' },
   ...ROLE_VALUES.map((value) => ({ label: ROLE_META[value].text, value })),
];

/** 行内角色下拉（没有「全部」） */
export const ROLE_SELECT_OPTIONS: ISelectOption[] = ROLE_VALUES.map((value) => ({
   label: ROLE_META[value].text,
   value,
}));

/** 可排序字段；升/降序由旁边的方向按钮切换，不写进选项文案里 */
export const SORT_FIELDS = [
   { value: 'lastActiveAt', label: '活跃时间' },
   { value: 'createdAt', label: '注册时间' },
   { value: 'score', label: '分数' },
] as const;

export type SortBy = (typeof SORT_FIELDS)[number]['value'];
export type SortOrder = 'asc' | 'desc';
