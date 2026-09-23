'use client';

import { imageUrl } from './cloudinary';

/**
 * The app-wide `next/image` loader (`images.loaderFile` in next.config.ts).
 * Cloudinary URLs get a Cloudinary resize for each `srcset` width; anything
 * else is returned unchanged. Vercel's image optimizer is never used.
 */
export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return imageUrl(src, { width, quality });
}
