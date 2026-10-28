export interface LearningPlaygroundSource {
   html: string;
   css: string;
   js: string;
}

const escapeClosingTag = (value: string, tag: 'style' | 'script') =>
   value.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/**
 * 生成给无同源权限 sandbox iframe 使用的文档。
 * CSP 阻止外部请求，闭合标签转义避免 CSS/JS 提前逃出所属节点。
 */
export const createLearningPlaygroundDocument = ({
   html,
   css,
   js,
}: LearningPlaygroundSource) => {
   const safeCss = escapeClosingTag(css, 'style');
   const safeJs = escapeClosingTag(js, 'script');
   return [
   `<!doctype html>`,
   `<html>`,
   `  <head>`,
   `    <meta charset="utf-8">`,
   `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`,
   `    <meta name="referrer" content="no-referrer">`,
   `    <style>html{color-scheme:light}body{margin:16px;font-family:system-ui,sans-serif}${safeCss}</style>`,
   `  </head>`,
   `  <body>${html}<script>${safeJs}<\/script></body>`,
   `</html>`,
   ].join('');
};
