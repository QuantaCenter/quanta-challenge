/** Emmet/Pug 在当前 Volar 浏览器构建中没有实现，不注册这些占位服务。 */
export const create = () => ({
   name: 'browser-disabled',
   capabilities: {},
   create: () => ({}),
});
