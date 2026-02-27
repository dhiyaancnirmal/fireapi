export const firecrawlTheme = {
  color: {
    primary: '#FF4C00',
    accent: '#FF4C00',
    background: '#F9F9F9',
    surface: '#FFFFFF',
    mutedSurface: '#EFEFEF',
    text: '#262626',
    link: '#FF4D00',
  },
  typography: {
    family: {
      heading:
        "'Suisse', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      body:
        "'Suisse', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
    },
    size: {
      h1: '60px',
      h2: '52px',
      body: '16px',
    },
  },
  spacing: {
    unit: 4,
    radius: {
      sm: '5px',
      md: '10px',
    },
  },
  shadow: {
    buttonPrimary:
      'color(display-p3 0.9804 0.1127 0.098 / 0.2) 0px -6px 12px 0px inset, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 2px 4px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 1px 1px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.16) 0px 0.5px 0.5px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.2) 0px 0.25px 0.25px 0px',
  },
} as const;

export type FirecrawlTheme = typeof firecrawlTheme;
