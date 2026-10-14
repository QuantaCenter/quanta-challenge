import { getLanguageService, TokenType } from 'vscode-html-languageservice';
import type {
   CodeInformation,
   CodeMapping,
   LanguagePlugin,
   VirtualCode,
} from '@vue/language-service';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';

const fullFeatures: CodeInformation = {
   verification: true,
   completion: true,
   semantic: true,
   navigation: true,
   structure: true,
   format: true,
};

// style="" 只是一段声明列表，外层包了一层选择器，格式化会破坏原文
const inlineStyleFeatures: CodeInformation = { ...fullFeatures, format: false };

const JS_SCRIPT_TYPES = new Set([
   '',
   'module',
   'text/javascript',
   'application/javascript',
   'text/ecmascript',
   'application/ecmascript',
]);

const htmlService = getLanguageService();

const INLINE_STYLE_PREFIX = '*{';
const INLINE_STYLE_SUFFIX = '}\n';

const createSnapshot = (text: string): ts.IScriptSnapshot => ({
   getText: (start, end) => text.substring(start, end),
   getLength: () => text.length,
   getChangeRange: () => undefined,
});

const createMapping = (
   sourceOffset: number,
   generatedOffset: number,
   length: number,
   data: CodeInformation
): CodeMapping => ({
   sourceOffsets: [sourceOffset],
   generatedOffsets: [generatedOffset],
   lengths: [length],
   data,
});

const unquote = (value: string, offset: number) => {
   const quote = value[0];
   if ((quote === '"' || quote === "'") && value.length >= 2) {
      const end = value.endsWith(quote) ? value.length - 1 : value.length;
      return { text: value.slice(1, end), offset: offset + 1 };
   }
   return { text: value, offset };
};

/**
 * 把 HTML 拆成虚拟代码：根节点交给 HTML 服务，<style> 与 style="" 交给 CSS 服务，
 * 每个 <script> 作为独立的 JS 文件交给 TypeScript 服务（经典脚本之间共享全局作用域，
 * 与浏览器行为一致）。
 */
const createHtmlVirtualCode = (text: string): VirtualCode => {
   const embeddedCodes: VirtualCode[] = [];
   const inlineStyleMappings: CodeMapping[] = [];
   let inlineStyleText = '';

   const scanner = htmlService.createScanner(text);
   let tagName = '';
   let attrName = '';
   let scriptType = '';
   let token = scanner.scan();
   while (token !== TokenType.EOS) {
      switch (token) {
         case TokenType.StartTag:
            tagName = scanner.getTokenText().toLowerCase();
            scriptType = '';
            break;
         case TokenType.AttributeName:
            attrName = scanner.getTokenText().toLowerCase();
            break;
         case TokenType.AttributeValue: {
            const value = unquote(scanner.getTokenText(), scanner.getTokenOffset());
            if (tagName === 'script' && attrName === 'type') {
               scriptType = value.text.trim().toLowerCase();
            } else if (attrName === 'style') {
               inlineStyleText += INLINE_STYLE_PREFIX;
               inlineStyleMappings.push(
                  createMapping(
                     value.offset,
                     inlineStyleText.length,
                     value.text.length,
                     inlineStyleFeatures
                  )
               );
               inlineStyleText += value.text + INLINE_STYLE_SUFFIX;
            }
            break;
         }
         case TokenType.Styles: {
            const content = scanner.getTokenText();
            embeddedCodes.push({
               id: `style_${embeddedCodes.length}`,
               languageId: 'css',
               snapshot: createSnapshot(content),
               mappings: [
                  createMapping(scanner.getTokenOffset(), 0, content.length, fullFeatures),
               ],
            });
            break;
         }
         case TokenType.Script: {
            if (!JS_SCRIPT_TYPES.has(scriptType)) break;
            const content = scanner.getTokenText();
            embeddedCodes.push({
               id: `script_${embeddedCodes.length}`,
               languageId: 'javascript',
               snapshot: createSnapshot(content),
               mappings: [
                  createMapping(scanner.getTokenOffset(), 0, content.length, fullFeatures),
               ],
            });
            break;
         }
      }
      token = scanner.scan();
   }

   if (inlineStyleMappings.length) {
      embeddedCodes.push({
         id: 'inline_style',
         languageId: 'css',
         snapshot: createSnapshot(inlineStyleText),
         mappings: inlineStyleMappings,
      });
   }

   return {
      id: 'root',
      languageId: 'html',
      snapshot: createSnapshot(text),
      mappings: [createMapping(0, 0, text.length, fullFeatures)],
      embeddedCodes,
   };
};

export const createHtmlLanguagePlugin = (
   typescript: typeof ts
): LanguagePlugin<URI> => {
   const plugin: LanguagePlugin<URI> = {
      getLanguageId(uri) {
         if (/\.html?$/i.test(uri.path)) return 'html';
      },
      createVirtualCode(_uri, languageId, snapshot) {
         if (languageId !== 'html') return;
         return createHtmlVirtualCode(snapshot.getText(0, snapshot.getLength()));
      },
      updateVirtualCode(_uri, _code, snapshot) {
         return createHtmlVirtualCode(snapshot.getText(0, snapshot.getLength()));
      },
   };
   // typescript 字段由 @volar/typescript 的模块增强声明，应用侧类型里看不到
   return Object.assign(plugin, {
      typescript: {
         extraFileExtensions: [
            {
               extension: 'html',
               isMixedContent: true,
               scriptKind: typescript.ScriptKind.Deferred,
            },
         ],
         getServiceScript() {
            return undefined;
         },
         getExtraServiceScripts(fileName: string, root: VirtualCode) {
            return (root.embeddedCodes ?? [])
               .filter((code) => code.languageId === 'javascript')
               .map((code) => ({
                  fileName: `${fileName}.${code.id}.js`,
                  code,
                  extension: '.js',
                  scriptKind: typescript.ScriptKind.JS,
               }));
         },
      },
   });
};
