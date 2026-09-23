import type { NextConfig } from 'next';

/**
 * Response headers applied to every route. Carried over from the reference
 * storefront minus its route-specific exceptions.
 *
 * No `Content-Security-Policy` yet: a useful one for the App Router is
 * nonce-based, and it belongs with the phase that adds the Uploadcare widget
 * and Cloudinary/Magic Hour media origins, whose hosts it has to name.
 * `Strict-Transport-Security` is left to Vercel, which sets it on every
 * HTTPS deployment.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // The version banner is free reconnaissance and buys nothing.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
