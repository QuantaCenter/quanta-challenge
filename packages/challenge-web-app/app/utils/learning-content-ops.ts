import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';

/** 学习内容的前端模型与表单输入类型 */

export interface LearningContentState {
   articles: LearningArticle[];
   topics: LearningTopic[];
   courses: LearningCourse[];
}

export interface ArticleInput {
   title: string;
   summary: string;
   body: string;
   coverPreset?: LearningArticle['coverPreset'];
   coverUrl?: string;
}

export interface TopicInput {
   name: string;
   description: string;
   courseId: number;
   articleIds: number[];
   coverPreset?: LearningTopic['coverPreset'];
}

export interface CourseInput {
   name: string;
   description: string;
   topicIds: number[];
   status?: LearningCourse['status'];
   coverPreset?: LearningCourse['coverPreset'];
}
