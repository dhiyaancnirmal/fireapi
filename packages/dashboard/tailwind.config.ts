import firecrawlPreset from '../../design-system/tailwind.firecrawl.preset';

const config = {
  presets: [firecrawlPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};

export default config;
