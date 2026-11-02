export const feedbackTypeLabels = {
   bug: '功能异常',
   problem_judge: '题目 / 判题',
   suggestion: '体验建议',
   other: '其他',
} as const;

export type FeedbackType = keyof typeof feedbackTypeLabels;

export const feedbackStatuses = {
   pending: { label: '待处理', color: 'text-warning', dot: 'bg-warning' },
   working: { label: '处理中', color: 'text-primary', dot: 'bg-primary' },
   resolved: { label: '已解决', color: 'text-success', dot: 'bg-success' },
   closed: { label: '已关闭', color: 'text-accent-300', dot: 'bg-accent-400' },
} as const;

export type FeedbackStatus = keyof typeof feedbackStatuses;
export type FeedbackStatusFilter = 'ALL' | FeedbackStatus;

export const feedbackStatusFilters: {
   value: FeedbackStatusFilter;
   label: string;
}[] = [
   { value: 'ALL', label: '全部' },
   { value: 'pending', label: '待处理' },
   { value: 'working', label: '处理中' },
   { value: 'resolved', label: '已解决' },
   { value: 'closed', label: '已关闭' },
];
