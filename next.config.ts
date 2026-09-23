import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
/** Vercel preview deployments inject the Vercel toolbar from vercel.live. */
const isPreview = process.env.VERCEL_ENV === 'preview';

const CLOUDINARY = 'https://res.cloudinary.com';
/** The Upload API, and the S3 bucket multipart parts go to (presigned URLs from multipart/start). */
const UPLOADCARE = ['https://upload.uploadcare.com', 'https://uploadcare.s3-accelerate.amazonaws.com'];
const VERCEL_LIVE = isPreview ? ['https://vercel.live'] : [];

/**
 * Content-Security-Policy, the "without nonces" variant from the Next.js
 * guide. `script-src` has to allow `'unsafe-inline'`: the App Router streams
 * its RSC payload in inline scripts and next-themes sets the theme class with
 * one before hydration, and neither can be hashed ahead of time. The nonce
 * alternative renders every page per request — none could be prerendered —
 * which costs more than it buys for an app that renders no user HTML. So the
 * policy's value is everything else: scripts, fetches and media only from
 * this origin and the named hosts (Uploadcare for uploads, Cloudinary for
 * media), no plugins, no `<base>` hijacking, no framing, forms post here only.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${VERCEL_LIVE.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${CLOUDINARY} ${VERCEL_LIVE.join(' ')}`,
  `media-src 'self' blob: ${CLOUDINARY}`,
  "font-src 'self'",
  `connect-src 'self' ${[...UPLOADCARE, ...VERCEL_LIVE].join(' ')}`,
  `frame-src ${isPreview ? VERCEL_LIVE.join(' ') : "'none'"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((directive) => directive.trim())
  .join('; ');

/**
 * Response headers applied to every route. `Strict-Transport-Security` is
 * left to Vercel, which sets it on every HTTPS deployment.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
