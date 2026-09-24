/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH — edit this file and the whole site follows,
 *  including astro.config.ts (canonical URLs) and the sitemap.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SITE = {
  /** Shown in the header, footer, <title> and Open Graph tags. */
  name: 'Yashas Power Systems',

  /** Canonical origin. Must be the real production URL, no trailing slash. */
  domain: 'https://yashaspowersystems.com',

  /**
   * ⚠️ PLACEHOLDER — replace with your real one-line description.
   * This was inferred from the business name; it is NOT a confirmed claim.
   */
  tagline: 'UPS systems, sales and service.',

  /** Public contact address. Used on home + privacy policy. */
  email: 'ypsapcups@gmail.com',

  /**
   * Public contact phone. ⚠️ EMPTY — the privacy policy omits the line entirely
   * while this is blank. Fill it before publishing.
   */
  phone: '',

  /**
   * Public business address. ⚠️ EMPTY — the privacy policy omits the line
   * entirely while this is blank. Fill it before publishing.
   */
  address: '',

  /**
   * Who is legally responsible for the site (privacy policy "data controller").
   * Update if the registered legal name differs from the trading name.
   */
  legalEntity: 'Yashas Power Systems',

  /** Governing jurisdiction named in the privacy policy. */
  country: 'India',

  /** Shown as "Last updated" on the privacy policy. Bump it when you edit it. */
  privacyUpdated: '2026-09-24',
} as const;

/** Nav links rendered in the header and footer.
 *  NOTE: Astro builds pages to directory format (privacy/index.html), so the
 *  canonical URL carries a trailing slash. Linking to "/privacy" would cost an
 *  extra 301 redirect on Cloudflare Pages — keep the slashes. */
export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/privacy/', label: 'Privacy' },
] as const;
