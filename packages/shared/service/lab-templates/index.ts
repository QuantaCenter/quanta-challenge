export * from './types';

/**
 * 系统内置模板的文件不在这里定义：每个模板是 ./templates 下的一个目录，
 * 由服务端在运行时读取并组装（见 challenge-web-app 的 server/services/builtin-lab-templates.ts）。
 *
 *   templates/<模板 id>/
 *   ├── template.json   基础信息：name、description、category（模板分类 id，见 lab_categories）、tags、icon、entry、
 *   │                   installCommand（可省略）、startCommand、order（列表排序，越小越靠前）
 *   ├── README.md       说明文档，在模板详情的「介绍」与 IDE 的「说明」中展示
 *   └── files/          项目文件，按原样复制到用户项目根目录（可以没有）
 *
 * templates 目录已从 TypeScript 等工具的检查范围中排除，其中的 package.json、tsconfig.json、
 * *.ts 等文件只是模板内容，不属于本仓库的代码。
 */
