import { ValidFieldPath } from '@challenge/database';

/**
 * 不合法的字段路径列表，包含正则表达式和具体的字段路径
 */
export const invalidFieldsPattern: (ValidFieldPath | RegExp)[] = [
   /^auths.*/,
   /^achievement.*/, // 避免触发成就相关的循环依赖
   /^user_achievements.*/,
];

/**
 * 上下文注入 __ctx 的属性
 */
export const contextVariables = ['userId', 'continuesCheckinCount'];

/**
 * 页面板块配置
 * 这些是可以被搜索到的页面板块
 */
export const pageSecions = [
   {
      id: 'dashboard-recent-submission',
      pageName: '仪表盘',
      sectionName: '最近提交',
      url: '/app/dashboard',
      keywords: [
         '首页',
         '仪表盘',
         'dashboard',
         '最近',
         '提交',
         'submission',
         'zuijingtijiao',
      ],
   },
   {
      id: 'dashboard-recent-learning',
      pageName: '仪表盘',
      sectionName: '最近学习',
      url: '/app/dashboard',
      keywords: [
         '首页',
         '仪表盘',
         'dashboard',
         '最近',
         '学习',
         'learning',
         'yibiaopan',
         'shouye',
      ],
   },
   {
      id: 'topics-list',
      pageName: '专题',
      sectionName: '专题总览',
      url: '/app/topics',
      keywords: ['专题', '学习', '路径', 'topics', 'learning', 'zhuanti', 'xuexi'],
   },
   {
      id: 'dashboard-daily-challenge',
      pageName: '仪表盘',
      sectionName: '每日一题',
      url: '/app/dashboard',
      keywords: [
         '首页',
         '仪表盘',
         'dashboard',
         '每日',
         '一题',
         'daily',
         'challenge',
         'meiriyiti',
         'timu',
         'shouye',
      ],
   },
   {
      id: 'dashboard-ranking',
      pageName: '仪表盘',
      sectionName: '排行榜',
      url: '/app/dashboard',
      keywords: [
         '首页',
         '仪表盘',
         'dashboard',
         '排行',
         '排名',
         'ranking',
         'leaderboard',
         'paihangbang',
         'shouye',
      ],
   },
   {
      id: 'problems-list',
      pageName: '题库',
      sectionName: '题目列表',
      url: '/app/problems',
      keywords: ['题库', '题目', 'problems', '列表', 'list', 'timu', 'tiku'],
   },
   {
      id: 'space',
      pageName: '个人空间',
      sectionName: '个人信息',
      url: '/app/space',
      keywords: [
         '个人',
         '中心',
         '信息',
         'profile',
         'user',
         'gerenkongjian',
         'space',
      ],
   },
   {
      id: 'rankings',
      pageName: '排行榜',
      sectionName: '全部排行',
      url: '/app/rankings',
      keywords: [
         '排行',
         '排名',
         '排行榜',
         'ranking',
         'leaderboard',
         'paihangbang',
      ],
   },
   {
      id: 'settings-common',
      pageName: '设置',
      sectionName: '常规设置',
      url: '/app/settings',
      keywords: ['设置', '常规', 'settings', 'common', 'shezhi', 'changgui'],
   },
   {
      id: 'settings-security',
      pageName: '设置',
      sectionName: '安全设置',
      url: '/app/settings/security',
      keywords: ['设置', '安全', 'settings', 'security', 'shezhi', 'anquan'],
   },
   {
      id: 'settings-advanced',
      pageName: '设置',
      sectionName: '高级设置',
      url: '/app/settings/advanced',
      keywords: ['设置', '高级', 'settings', 'advanced', 'shezhi', 'gaoji'],
   },
];
