import { createTheme, rem } from '@mantine/core';

export const httpReqTheme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 5 },
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
  defaultRadius: 'md',
  spacing: { xs: rem(8), sm: rem(10), md: rem(14), lg: rem(20), xl: rem(28) },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    Input: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Tabs: { defaultProps: { keepMounted: false } },
    Tooltip: { defaultProps: { openDelay: 450 } },
  },
  focusRing: 'auto',
});
