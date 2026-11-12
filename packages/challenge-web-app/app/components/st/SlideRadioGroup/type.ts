export const TOGGLE_SLIDE_RADIO_INJECT_KEY = Symbol(
   'toggle-slide-radio-inject-key'
);

export interface ISlideRadioGroupOption {
   label: string;
   value: any;
   color: string;
   /** 选中态按 WCAG 对比度选择文字颜色（浅色主题色也会配深色文字），默认沿用全站的亮度阈值 */
   contrastText?: boolean;
}
