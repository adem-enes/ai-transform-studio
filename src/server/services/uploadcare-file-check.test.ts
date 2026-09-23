import type { FileInfo } from '@uploadcare/rest-client';
import { describe, expect, it } from 'vitest';
import { MEDIA_LIMITS } from '@/schemas';
import { AppError } from '@/server/errors';
import { verifyFileInfo } from './uploadcare-file-check';

const UUID = '0c1bbf8f-3a1e-4f6a-9a55-6b4d3f1a2b3c';

function imageInfo(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    uuid: UUID,
    datetimeRemoved: null,
    datetimeStored: '2026-09-23T10:00:01Z',
    datetimeUploaded: '2026-09-23T10:00:00Z',
    isImage: true,
    isReady: true,
    mimeType: 'image/jpeg',
    originalFileUrl: `https://demo.ucarecd.net/${UUID}/portrait.jpg`,
    originalFilename: 'portrait.jpg',
    size: 1_200_000,
    url: `https://api.uploadcare.com/files/${UUID}/`,
    variations: null,
    contentInfo: {
      mime: { mime: 'image/jpeg', type: 'image', subtype: 'jpeg' },
      image: {
        width: 1024,
        height: 768,
        format: 'JPEG',
        colorMode: 'RGB',
        geoLocation: null,
        datetimeOriginal: null,
        dpi: null,
        orientation: null,
        sequence: false,
      },
    },
    metadata: null,
    tags: null,
    appdata: null,
    ...overrides,
  };
}

function videoInfo(overrides: Partial<FileInfo> = {}): FileInfo {
  return imageInfo({
    isImage: false,
    mimeType: 'video/mp4',
    originalFileUrl: `https://demo.ucarecd.net/${UUID}/clip.mp4`,
    originalFilename: 'clip.mp4',
    size: 8_000_000,
    contentInfo: {
      mime: { mime: 'video/mp4', type: 'video', subtype: 'mp4' },
      video: {
        duration: 12_500,
        format: 'mp4',
        bitrate: 5_000,
        audio: null,
        video: { width: 1920, height: 1080, frameRate: 30, bitrate: 4_800, codec: 'h264' },
      },
    },
    ...overrides,
  });
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return undefined;
}

describe('verifyFileInfo', () => {
  it('returns a verified image', () => {
    expect(verifyFileInfo(imageInfo(), 'image')).toEqual({
      uuid: UUID,
      kind: 'image',
      cdnUrl: `https://demo.ucarecd.net/${UUID}/portrait.jpg`,
      originalFilename: 'portrait.jpg',
      mime: 'image/jpeg',
      bytes: 1_200_000,
      width: 1024,
      height: 768,
      durationSeconds: null,
    });
  });

  it('returns a verified video with its duration in seconds', () => {
    expect(verifyFileInfo(videoInfo(), 'video')).toMatchObject({
      kind: 'video',
      mime: 'video/mp4',
      width: 1920,
      height: 1080,
      durationSeconds: 12.5,
    });
  });

  it.each(['image/png', 'image/webp'])('accepts %s images', (mime) => {
    const info = imageInfo({ mimeType: mime, contentInfo: { mime: { mime, type: 'image', subtype: '' } } });
    expect(verifyFileInfo(info, 'image').mime).toBe(mime);
  });

  it('accepts quicktime videos', () => {
    const mime = 'video/quicktime';
    const info = videoInfo({
      mimeType: mime,
      contentInfo: { mime: { mime, type: 'video', subtype: 'quicktime' } },
    });
    expect(verifyFileInfo(info, 'video').mime).toBe(mime);
  });

  it('rejects a removed file', () => {
    expect(
      codeOf(() => verifyFileInfo(imageInfo({ datetimeRemoved: '2026-09-23T11:00:00Z' }), 'image')),
    ).toBe('UPLOAD_NOT_FOUND');
  });

  it.each([
    ['not ready', { isReady: false }],
    ['not stored', { datetimeStored: null }],
    ['without an original URL', { originalFileUrl: null }],
  ])('rejects a file that is %s', (_label, overrides) => {
    expect(codeOf(() => verifyFileInfo(imageInfo(overrides), 'image'))).toBe('FILE_NOT_READY');
  });

  it('rejects a disallowed image type', () => {
    const info = imageInfo({
      mimeType: 'image/gif',
      contentInfo: { mime: { mime: 'image/gif', type: 'image', subtype: 'gif' } },
    });
    expect(codeOf(() => verifyFileInfo(info, 'image'))).toBe('INVALID_FILE_TYPE');
  });

  it('trusts the sniffed MIME type over the declared one', () => {
    const info = imageInfo({
      mimeType: 'image/jpeg',
      contentInfo: {
        mime: { mime: 'application/x-msdownload', type: 'application', subtype: 'x-msdownload' },
      },
    });
    expect(codeOf(() => verifyFileInfo(info, 'image'))).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file of the other kind', () => {
    expect(codeOf(() => verifyFileInfo(videoInfo(), 'image'))).toBe('INVALID_FILE_TYPE');
    expect(codeOf(() => verifyFileInfo(imageInfo(), 'video'))).toBe('INVALID_FILE_TYPE');
  });

  it.each(['image', 'video'] as const)('enforces the %s size limit', (kind) => {
    const fixture = kind === 'image' ? imageInfo : videoInfo;
    const max = MEDIA_LIMITS[kind].maxBytes;
    expect(verifyFileInfo(fixture({ size: max }), kind).bytes).toBe(max);
    expect(codeOf(() => verifyFileInfo(fixture({ size: max + 1 }), kind))).toBe('FILE_TOO_LARGE');
  });

  it('falls back to the declared MIME type and null dimensions when content info is missing', () => {
    expect(verifyFileInfo(imageInfo({ contentInfo: null }), 'image')).toMatchObject({
      mime: 'image/jpeg',
      width: null,
      height: null,
    });
  });
});
