/** 搜索类型定义 */
export type SearchType =
   | 'all'
   | 'problem'
   | 'user'
   | 'tag'
   | 'page-section'
   | 'daily-problem'
   | 'achievement'
   | 'notification'
   | 'submission'
   | 'appeal'
   | 'cloud-function';

/** 仅管理员角色可用的搜索类型（服务端按角色过滤，前端隐藏筛选入口） */
export const ADMIN_ONLY_SEARCH_TYPES: SearchType[] = [
   'submission',
   'appeal',
   'cloud-function',
];

/** 搜索类型配置 */
export interface SearchTypeConfig {
   value: SearchType;
   label: string;
   icon?: string; // 图标名称，前端使用时导入对应图标
   order: number; // 排序优先级
   description?: string; // 描述
}

/** 搜索类型配置表，集中管理所有搜索类型的配置 */
export const SEARCH_TYPE_CONFIGS: Record<
   Exclude<SearchType, 'all'>,
   SearchTypeConfig
> = {
   problem: {
      value: 'problem',
      label: '题目',
      icon: 'ListView',
      order: 1,
      description: '搜索算法题目',
   },
   'daily-problem': {
      value: 'daily-problem',
      label: '每日一题',
      icon: 'CalendarThirtyTwo',
      order: 2,
      description: '搜索每日推荐题目',
   },
   achievement: {
      value: 'achievement',
      label: '成就',
      icon: 'GoldMedalTwo',
      order: 5,
      description: '搜索平台成就',
   },
   notification: {
      value: 'notification',
      label: '通知',
      icon: 'VolumeNotice',
      order: 6,
      description: '搜索我的通知与公告',
   },
   submission: {
      value: 'submission',
      label: '提交',
      icon: 'History',
      order: 7,
      description: '搜索提交记录（管理员）',
   },
   appeal: {
      value: 'appeal',
      label: '申诉',
      icon: 'Help',
      order: 8,
      description: '搜索用户申诉（管理员）',
   },
   'cloud-function': {
      value: 'cloud-function',
      label: '云函数',
      icon: 'Code',
      order: 9,
      description: '搜索云函数（管理员）',
   },
   user: {
      value: 'user',
      label: '用户',
      icon: 'User',
      order: 3,
      description: '搜索用户',
   },
   tag: {
      value: 'tag',
      label: '标签',
      icon: 'TagOne',
      order: 4,
      description: '搜索题目标签',
   },
   'page-section': {
      value: 'page-section',
      label: '页面',
      icon: 'WebPage',
      order: 10,
      description: '搜索页面和功能板块',
   },
};

/** 获取所有搜索类型（不包括 'all'） */
export const getAllSearchTypes = (): SearchType[] => {
   return Object.keys(SEARCH_TYPE_CONFIGS) as SearchType[];
};

/** 获取搜索类型配置 */
export const getSearchTypeConfig = (
   type: SearchType
): SearchTypeConfig | null => {
   if (type === 'all') return null;
   return SEARCH_TYPE_CONFIGS[type] || null;
};

/** 获取按顺序排列的搜索类型 */
export const getSortedSearchTypes = (): SearchType[] => {
   return Object.values(SEARCH_TYPE_CONFIGS)
      .sort((a, b) => a.order - b.order)
      .map((config) => config.value);
};

/** 验证搜索类型是否有效 */
export const isValidSearchType = (type: string): type is SearchType => {
   return (
      type === 'all' ||
      Object.keys(SEARCH_TYPE_CONFIGS).includes(type as SearchType)
   );
};

/** 验证搜索类型数组是否有效 */
export const validateSearchTypes = (types: string[]): boolean => {
   return types.every(isValidSearchType);
};

/** 搜索限制配置 */
export const SEARCH_LIMITS = {
   MIN_QUERY_LENGTH: 1,
   MAX_QUERY_LENGTH: 100,
   MIN_LIMIT: 1,
   MAX_LIMIT: 50,
   DEFAULT_LIMIT: 20,
} as const;

/** 搜索相关的常量 */
export const SEARCH_CONSTANTS = {
   RECENT_SEARCH_KEY: 'recent-searches',
   MAX_RECENT_SEARCHES: 5,
   DEBOUNCE_DELAY: 300,
} as const;
