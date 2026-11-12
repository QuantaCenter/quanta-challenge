import type { LabTemplate } from './types';

export const blankTemplate: LabTemplate = {
   id: 'blank',
   name: '空白项目',
   description: '不含任何文件的 Node.js 环境，从零开始自由创建文件、安装依赖并在终端里运行。',
   category: 'basic',
   tags: ['Node.js', '终端'],
   icon: '/icons/document.png',
   entry: '',
   // 空白项目没有 package.json，不自动安装依赖，也不启动任何服务
   startCommand: '',
   readme: `# 空白项目

一个没有任何文件的 Node.js 环境，适合随手验证想法或从零搭建项目。

## 快速开始

- 在左侧文件树里右键新建文件或文件夹，也可以直接拖入文件上传
- 在终端执行 \`npm init -y\` 初始化项目，再用 \`npm install <包名>\` 安装依赖
- 用 \`node 文件名.js\` 运行脚本；启动 Web 服务后，端口会出现在预览区
`,
   files: {},
};
