export function parseRepository(input: string) {
   let value = input.trim();

   if (!value.startsWith('https://')) {
      value = `https://github.com/${value}`;
   }

   const url = new URL(value);
   const parts = url.pathname
      .replace(/\/$/, '')
      .replace(/\.git$/, '')
      .split('/')
      .slice(1);
   const validParts = parts.every((part) => {
      return /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..';
   });

   if (
      url.origin !== 'https://github.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2 ||
      !validParts
   ) {
      throw new Error('请填写 GitHub 仓库链接或 owner/repository');
   }

   return parts.map(encodeURIComponent).join('/');
}
