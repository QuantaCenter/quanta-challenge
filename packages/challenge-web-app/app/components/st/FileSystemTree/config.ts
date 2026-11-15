const iconRules = {
   '/icons/babel.png': ['.babelrc', '.babel.js', '.babel.json'],
   '/icons/certificate.png': [
      '.pem',
      '.crt',
      '.cert',
      '.cer',
      '.p12',
      '.pfx',
      'LICENSE',
   ],
   '/icons/changelog.png': [
      'CHANGELOG',
      'CHANGELOG.md',
      'CHANGELOG.txt',
      'HISTORY.md',
   ],
   '/icons/console.png': [
      '.sh',
      '.bash',
      '.zsh',
      '.fish',
      '.ps1',
      '.cmd',
      '.bat',
   ],
   '/icons/css.png': ['.css'],
   '/icons/document.png': ['.txt', '.rtf', '.doc', '.docx'],
   '/icons/favicon.png': ['favicon.ico', 'favicon.png', 'favicon.svg'],
   '/icons/font.png': ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
   '/icons/git.png': [
      '.gitignore',
      '.gitattributes',
      '.gitmodules',
      '.gitkeep',
   ],
   '/icons/html.png': ['.html', '.htm', '.xhtml'],
   '/icons/image.png': [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.ico',
      '.tiff',
      '.webp',
   ],
   '/icons/in.png': ['.i18n.json', '.i18n.js', '.i18n.ts'],
   '/icons/javascript.png': ['.js', '.mjs', '.cjs'],
   '/icons/json.png': ['.json', '.jsonc', '.json5'],
   '/icons/key.png': ['.key', '.pkey', '.pub'],
   '/icons/less.png': ['.less'],
   '/icons/log.png': ['.log', '.logs'],
   '/icons/markdown.png': ['.md', '.markdown', '.mdown', '.mkd'],
   '/icons/nodejs.png': ['package.json', 'package-lock.json', '.nvmrc'],
   '/icons/npm.png': ['.npmrc', '.npmignore'],
   '/icons/nuxt.png': ['nuxt.config.js', 'nuxt.config.ts'],
   '/icons/postcss.png': ['postcss.config.js', '.postcssrc', '.postcssrc.json'],
   '/icons/react.png': ['.jsx'],
   '/icons/react_ts.png': ['.tsx'],
   '/icons/readme.png': ['README', 'README.md', 'README.txt'],
   '/icons/robot.png': ['robots.txt'],
   '/icons/routing.png': ['router.js', 'routes.js', 'routing.js'],
   '/icons/sass.png': ['.scss', '.sass'],
   '/icons/stylelint.png': ['.stylelintrc', 'stylelint.config.js'],
   '/icons/stylus.png': ['.styl', '.stylus'],
   '/icons/svelte.png': ['.svelte'],
   '/icons/svg.png': ['.svg'],
   '/icons/tailwindcss.png': ['tailwind.config.js', 'tailwind.config.ts'],
   '/icons/todo.png': ['TODO', 'TODO.md', 'TODO.txt'],
   '/icons/typescript.png': ['.ts'],
   '/icons/typescript-def.png': ['.d.ts'],
   '/icons/vue.png': ['.vue'],
   '/icons/webassembly.png': ['.wasm', '.wat'],
   '/icons/webpack.png': ['webpack.config.js', 'webpack.config.ts'],
   '/icons/yaml.png': ['.yml', '.yaml'],
   '/icons/yarn.png': ['yarn.lock', '.yarnrc', 'yarn.config.js'],
   '/icons/eslint.png': [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
      'eslint.config.js',
   ],
   '/icons/vite.png': ['vite.config.js', 'vite.config.ts'],
   '/icons/tsconfig.png': ['tsconfig.json', 'tsconfig.ts'],
   '/icons/jsconfig.png': ['jsconfig.json', 'jsconfig.ts'],
   '/icons/tune.png': [
      '.env',
      '.env.production',
      '.env.development',
      '.env.local',
      '.env.test',
      '.env.example',
      '.env.prod',
      '.env.dev',
   ],
   '/icons/pnpm.png': ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
};

export const extensionIconMapping = new Map(
   Object.entries(iconRules).flatMap(([icon, exts]) => {
      return exts.map((ext) => [ext, icon]);
   })
);

/** Shared by the explorer, quick open and Monaco search result headers. */
export const getFileIconPath = (path: string) => {
   const name = path.split('/').at(-1) ?? path;
   const segments = name.split('.');
   for (let index = -1; index < segments.length; index++) {
      const extension = index === -1 ? name : `.${segments.slice(index).join('.')}`;
      const icon = extensionIconMapping.get(extension) || extensionIconMapping.get(name);
      if (icon) return icon;
   }
   return undefined;
};
