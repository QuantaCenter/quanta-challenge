import type { editor } from 'monaco-editor';
import type { ThemeRegistrationRaw } from 'shiki';
import ayuDarkTheme from 'shiki/themes/ayu-dark.mjs';

import langVue from 'shiki/langs/vue.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langJsx from 'shiki/langs/jsx.mjs';
import langScss from 'shiki/langs/scss.mjs';
import langSass from 'shiki/langs/sass.mjs';
import langLess from 'shiki/langs/less.mjs';
import langStylus from 'shiki/langs/stylus.mjs';
import langPostcss from 'shiki/langs/postcss.mjs';

export const langRegistrations = [
   langVue,
   langTsx,
   langJsx,
   langScss,
   langSass,
   langLess,
   langStylus,
   langPostcss,
];

/**
 * 交给 Shiki 高亮的语言。Monaco 自带的语言（css / scss / less 等）已登记扩展名，
 * 其余需要在这里补上，否则对应文件会被当成纯文本。
 */
export const langs: { id: string; extensions?: string[] }[] = [
   { id: 'javascript' },
   { id: 'typescript' },
   { id: 'html' },
   { id: 'css' },
   { id: 'scss' },
   { id: 'less' },
   { id: 'sass', extensions: ['.sass'] },
   { id: 'stylus', extensions: ['.styl', '.stylus'] },
   { id: 'postcss', extensions: ['.pcss', '.postcss'] },
   { id: 'json' },
   { id: 'vue' },
];

export const editorThemeRegistration: ThemeRegistrationRaw = ayuDarkTheme;

export const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions =
   {
      theme: 'ayu-dark',
      automaticLayout: true,
      fontSize: 16,
      fontFamily: 'FiraCode Nerd Font Mono, monospace',
      autoClosingBrackets: 'languageDefined',
      tabSize: 2,
      minimap: { enabled: false },
      cursorSmoothCaretAnimation: 'on',
      autoClosingQuotes: 'languageDefined',
      linkedEditing: true,
      stickyScroll: {
         enabled: false,
      },
   };
