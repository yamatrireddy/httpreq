import { createTheme, rem } from '@mantine/core';

export const UI_FONT_FAMILY =
  "Poppins, 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
export const MONO_FONT_FAMILY =
  "'JetBrains Mono', 'Cascadia Code', 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const httpReqTheme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 5 },
  fontFamily: UI_FONT_FAMILY,
  fontFamilyMonospace: MONO_FONT_FAMILY,
  headings: { fontFamily: UI_FONT_FAMILY, fontWeight: '600' },
  // Poppins runs wide, so the desktop scale is a notch more compact than Mantine's defaults.
  fontSizes: { xs: rem(11.5), sm: rem(13), md: rem(14), lg: rem(16), xl: rem(18) },
  defaultRadius: 'sm',
  spacing: { xs: rem(8), sm: rem(10), md: rem(14), lg: rem(20), xl: rem(28) },
  components: {
    // Buttons sit one step below the inputs on Mantine's scale, which suits the dense desktop layout.
    Button: { defaultProps: { size: 'xs' } },
    Input: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Tabs: { defaultProps: { keepMounted: false } },
    Tooltip: { defaultProps: { openDelay: 450 } },
  },
  focusRing: 'auto',
});
