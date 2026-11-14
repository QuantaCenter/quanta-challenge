import type { DefineComponent } from 'vue';
import {
   Api,
   ApplicationTwo,
   BookOpen,
   Brain,
   Browser,
   ChartHistogram,
   Code,
   CodeBrackets,
   Components,
   Cpu,
   Cube,
   DataScreen,
   Earth,
   Experiment,
   GameHandle,
   Iphone,
   Layers,
   Lightning,
   Lock,
   Paint,
   Platte,
   Puzzle,
   Robot,
   Rocket,
   Server,
   Terminal,
   ThreeHexagons,
   Tool,
} from '@icon-park/vue-next';
import {
   WORKSHOP_CATEGORY_FALLBACK,
   type WorkshopCategoryIconName,
} from '@challenge/shared/workshop-templates';

/** 模板分类的预置图标：键与 WORKSHOP_CATEGORY_ICON_NAMES 一一对应 */
export const WORKSHOP_CATEGORY_ICONS: Record<WorkshopCategoryIconName, DefineComponent> = {
   components: Components as DefineComponent,
   'chart-histogram': ChartHistogram as DefineComponent,
   'code-brackets': CodeBrackets as DefineComponent,
   server: Server as DefineComponent,
   code: Code as DefineComponent,
   terminal: Terminal as DefineComponent,
   api: Api as DefineComponent,
   'data-screen': DataScreen as DefineComponent,
   iphone: Iphone as DefineComponent,
   'game-handle': GameHandle as DefineComponent,
   robot: Robot as DefineComponent,
   experiment: Experiment as DefineComponent,
   lightning: Lightning as DefineComponent,
   paint: Paint as DefineComponent,
   'book-open': BookOpen as DefineComponent,
   cube: Cube as DefineComponent,
   puzzle: Puzzle as DefineComponent,
   earth: Earth as DefineComponent,
   lock: Lock as DefineComponent,
   brain: Brain as DefineComponent,
   platte: Platte as DefineComponent,
   layers: Layers as DefineComponent,
   'application-two': ApplicationTwo as DefineComponent,
   browser: Browser as DefineComponent,
   cpu: Cpu as DefineComponent,
   rocket: Rocket as DefineComponent,
   tool: Tool as DefineComponent,
};

/** 图标名对应的组件；未设置或无法识别时使用通用图标 */
export const workshopCategoryIcon = (name?: string | null): DefineComponent =>
   (name && WORKSHOP_CATEGORY_ICONS[name as WorkshopCategoryIconName]) ||
   (ThreeHexagons as DefineComponent);

/** 分类的最小展示信息 */
export interface WorkshopCategoryDisplay {
   id: string;
   name: string;
   color: string;
   icon?: string | null;
   enabled?: boolean;
}

/** 按 id 查找分类展示信息；分类不存在（被删除）时返回「未分类」 */
export const resolveWorkshopCategory = (
   categories: readonly WorkshopCategoryDisplay[] | null | undefined,
   id: string,
): WorkshopCategoryDisplay =>
   categories?.find((category) => category.id === id) ?? {
      id,
      ...WORKSHOP_CATEGORY_FALLBACK,
   };
