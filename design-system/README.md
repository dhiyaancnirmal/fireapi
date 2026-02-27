# Firecrawl Brand Design System Snapshot

This folder was generated from Firecrawl's branding extraction endpoint for:

- Source: `https://www.firecrawl.dev/`
- Endpoint format: `branding`
- Goal: replicate Firecrawl visual style in this repository's future UI packages.

## Files

- `firecrawl-branding.snapshot.json`: raw extracted branding payload from Firecrawl.
- `firecrawl-brand.tokens.json`: normalized design tokens for implementation.
- `firecrawl-theme.css`: CSS custom properties and baseline component classes.
- `tailwind.firecrawl.preset.ts`: Tailwind preset you can extend in a UI package.
- `firecrawl-theme.ts`: TypeScript token object for React styling usage.

## Tailwind usage

Use this preset in a frontend package `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import firecrawlPreset from '../design-system/tailwind.firecrawl.preset';

const config: Config = {
  presets: [firecrawlPreset],
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
};

export default config;
```

## CSS usage

Import `firecrawl-theme.css` in your app entry and wrap UI in `.fc-theme`.

```tsx
import '../design-system/firecrawl-theme.css';

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="fc-theme">{children}</div>;
}
```

## React token usage

Use `firecrawl-theme.ts` for inline tokens where utility classes are not enough.

```tsx
import { firecrawlTheme } from '../design-system/firecrawl-theme';

export function HeroTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: firecrawlTheme.typography.family.heading,
        fontSize: firecrawlTheme.typography.size.h1,
        color: firecrawlTheme.color.text,
      }}
    >
      {children}
    </h1>
  );
}
```

## Notes

- The extracted primary brand color is `#FF4C00`.
- The extracted font family is `Suisse` with system fallbacks.
- The repo currently has no dashboard/frontend package implemented, so these files are placed as shared design assets ready for future UI work.
