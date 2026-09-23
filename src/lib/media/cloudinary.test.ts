import { describe, expect, it } from 'vitest';
import { attachmentUrl, imageUrl, videoPosterUrl } from './cloudinary';

const IMAGE = 'https://res.cloudinary.com/demo/image/upload/v1712/ai-transform-studio/outputs/image/abc.png';
const VIDEO = 'https://res.cloudinary.com/demo/video/upload/v1712/ai-transform-studio/sources/video/clip.mp4';

describe('cloudinary delivery URLs', () => {
  it('inserts a width-limited, auto-format rendition after /upload/', () => {
    expect(imageUrl(IMAGE, { width: 640 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,c_limit,w_640,q_auto/v1712/ai-transform-studio/outputs/image/abc.png',
    );
  });

  it('uses an explicit quality when given', () => {
    expect(imageUrl(IMAGE, { width: 320, quality: 75 })).toContain('/upload/f_auto,c_limit,w_320,q_75/');
  });

  it('leaves non-Cloudinary URLs untouched', () => {
    expect(imageUrl('https://example.com/a.png', { width: 640 })).toBe('https://example.com/a.png');
    expect(imageUrl('blob:http://localhost/123', { width: 640 })).toBe('blob:http://localhost/123');
  });

  it('builds an attachment URL with a sanitised file name', () => {
    expect(attachmentUrl(IMAGE, 'ai transform/1')).toContain('/upload/fl_attachment:ai-transform-1/v1712/');
  });

  it('builds a JPEG poster frame for a video', () => {
    expect(videoPosterUrl(VIDEO)).toBe(
      'https://res.cloudinary.com/demo/video/upload/so_0/v1712/ai-transform-studio/sources/video/clip.jpg',
    );
  });
});
