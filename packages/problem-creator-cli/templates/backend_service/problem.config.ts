import { defineProblemConfig } from '@challenge/problem-creator-cli';

// 后端服务题配置。字段语义与踩坑清单见 docs/BACKEND_SERVICE_PROBLEM.md
export default defineProblemConfig({
   title: '{{title}}',
   type: 'backend_service',
   // 题面单独放一个 markdown：后端题通常要列接口清单，写在配置里太长
   detailFile: 'detail.md',
   difficulty: '{{difficulty}}',
   tagIds: [{{tagIds}}], // TODO: 换成后端相关的标签 id
   // 后端题没有首屏可截图：init 已渲染 cover.png，跑 qpc cover --upload --write 上传并把 imageId 写回这里（否则 IMG001 拦下）。
   cover: {
      mode: 'custom',
      generate: {
         bg: '{{coverBg}}',
         bgTo: '{{coverBgTo}}',
         accent: '{{coverAccent}}',
         subtitle: '{{coverSubtitle}}',
      },
   },
   runtime: {
      // 判题打包目录，同时决定快照键前缀（/project/...）
      judgeUploadPath: '{{mountPath}}',
      // 服务启动命令：编辑器与判题容器共用，入口写在 package.json 的 scripts.start
      initCommand: '{{initCommand}}',
      // 初始镜像（容器 + 语言运行时）；bootCommand 由镜像决定，不用手写
      serviceImage: '{{serviceImage}}',
      servicePort: {{servicePort}},
      // 没有构建步骤也要填一个立即退出的命令，否则编辑器点"提交"会空转
      buildCommand: 'node -e ""',
   },
   paths: {
      template: 'template',
      answer: 'answer',
      judge: 'judge.js',
   },
});
