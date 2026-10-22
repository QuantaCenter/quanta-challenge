import type { IProgressStep } from '../Progress/type';

export type StepsStep = Pick<IProgressStep, 'title' | 'status'>;

/** 状态文案的颜色语义 */
export type StepsTone = 'idle' | 'active' | 'success' | 'warning' | 'error';
