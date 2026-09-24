import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { SITE } from './src/site.config';

// https://astro.build/config
export default defineConfig({
  // Pulled from src/site.config.ts — edit it there, not here.
  // Drives canonical URLs and the generated sitemap.
  site: SITE.domain,

  // Pure static: every route is prerendered to real HTML at build time.
  // The Cloudflare adapter is kept so on-demand routes can be added later
  // by opting a page in with `export const prerender = false`.
  output: 'static',

  trailingSlash: 'ignore',

  integrations: [sitemap()],

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
