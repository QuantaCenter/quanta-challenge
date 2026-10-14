// Monaco Editor Worker 类型声明
declare module 'monaco-editor/esm/vs/editor/editor.worker' {
   export function initialize(callback: any): void;
}

declare module 'monaco-editor/esm/vs/language/json/json.worker' {
   const content: any;
   export default content;
}

declare module 'monaco-editor/esm/vs/language/css/css.worker' {
   const content: any;
   export default content;
}

declare module 'monaco-editor/esm/vs/language/html/html.worker' {
   const content: any;
   export default content;
}

declare module 'monaco-editor/esm/vs/language/typescript/ts.worker' {
   export function initialize(callback: any): void;
   export class TypeScriptWorker {
      constructor(ctx: any, createData: any);
      getScriptFileNames(): string[];
   }
}

// Worker URL 类型声明
declare module '*?worker&url' {
   const workerUrl: string;
   export default workerUrl;
}
