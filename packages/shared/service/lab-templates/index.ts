import type { LabTemplate } from './types';
import { staticTemplate } from './static';
import { vanillaTemplate } from './vanilla';
import { vueTemplate } from './vue';
import { reactTemplate } from './react';
import { echartsTemplate } from './echarts';
import { chartjsTemplate } from './chartjs';
import { d3Template } from './d3';
import { nodeTemplate } from './node';
import { blankTemplate } from './blank';

export * from './types';

export const LAB_TEMPLATES: LabTemplate[] = [
   vueTemplate,
   reactTemplate,
   echartsTemplate,
   chartjsTemplate,
   d3Template,
   vanillaTemplate,
   staticTemplate,
   nodeTemplate,
   blankTemplate,
];

export const getLabTemplate = (id: string | undefined) =>
   LAB_TEMPLATES.find((template) => template.id === id);
