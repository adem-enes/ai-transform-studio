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

/**
 * Media is served and resized by Cloudinary through a custom loader
 * (src/lib/media/cloudinary-loader.ts), so Vercel's image optimizer — and its
 * quota — is never involved. `remotePatterns` still names the one origin
 * images may come from, scoped to this app's cloud when its name is known at
 * build time.
 */
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

const nextConfig: NextConfig = {
  // The version banner is free reconnaissance and buys nothing.
  poweredByHeader: false,

  images: {
    loader: 'custom',
    loaderFile: './src/lib/media/cloudinary-loader.ts',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: cloudName ? `/${cloudName}/**` : '/**',
      },
    ],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
