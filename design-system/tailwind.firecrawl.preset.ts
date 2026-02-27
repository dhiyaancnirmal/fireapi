export const firecrawlPreset = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#FF4C00',
          accent: '#FF4C00',
          text: '#262626',
          background: '#F9F9F9',
          surface: '#FFFFFF',
          muted: '#EFEFEF',
          link: '#FF4D00',
        },
      },
      fontFamily: {
        sans: [
          'Suisse',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
        heading: [
          'Suisse',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
      },
      fontSize: {
        'display-1': ['60px', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-2': ['52px', { lineHeight: '1.06', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        sm: '5px',
        md: '10px',
      },
      boxShadow: {
        'brand-button':
          'color(display-p3 0.9804 0.1127 0.098 / 0.2) 0px -6px 12px 0px inset, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 2px 4px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 1px 1px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.16) 0px 0.5px 0.5px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.2) 0px 0.25px 0.25px 0px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },
    },
  },
} as const;

export default firecrawlPreset;
