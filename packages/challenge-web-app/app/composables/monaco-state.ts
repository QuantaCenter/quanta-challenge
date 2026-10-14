/** Monaco 的主题是全局单例，这里记录当前生效的主题名。 */
let activeTheme: string | null = null;

export const getActiveMonacoTheme = () => activeTheme;

export const markMonacoThemeActive = (theme: string) => {
   activeTheme = theme;
};
