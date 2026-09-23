import { describe, expect, it, vi } from 'vitest';
import type { VerifiedFile } from '@/server/services';
import { createFakeDeps, type FakeDeps, USER_ID } from './testing';
import { uploadMedia } from './upload-media';

const UUID = '0b8e6a52-9f7a-4f7b-9d8a-3c2b1a0f9e8d';

function withFile(deps: FakeDeps, kind: 'image' | 'video' = 'video'): VerifiedFile {
  const file: VerifiedFile = {
    uuid: UUID,
    kind,
    cdnUrl: `https://ucarecdn.com/${UUID}/`,
    originalFilename: kind === 'image' ? 'cat.png' : 'clip.mp4',
    mime: kind === 'image' ? 'image/png' : 'video/mp4',
    bytes: 1000,
    width: 320,
    height: 240,
    durationSeconds: kind === 'video' ? 4000 : null,
  };
  deps.uploadcare.files.set(UUID, file);
  return file;
}

describe('uploadMedia', () => {
  it('copies to Cloudinary, records the upload, then deletes the Uploadcare file', async () => {
    const deps = createFakeDeps();
    withFile(deps);
    const deleteSpy = vi.spyOn(deps.uploadcare, 'deleteFile');

    const view = await uploadMedia({ userId: USER_ID, kind: 'video', uploadcareUuid: UUID }, deps);

    expect(deps.storage.calls).toEqual([
      { url: `https://ucarecdn.com/${UUID}/`, options: { kind: 'video', folder: 'sources' } },
    ]);
    expect(deps.uploads.docs.size).toBe(1);
    expect(deps.uploadcare.deleted).toEqual([UUID]);
    // The delete happens only after the record is saved.
    const saved = [...deps.uploads.docs.values()][0];
    expect(saved?.uploadcareUuid).toBe(UUID);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    // Cloudinary's figures win over Uploadcare's.
    expect(view).toMatchObject({ width: 640, height: 480, durationSeconds: 4, frameRate: 24 });
  });

  it('still succeeds, and logs a warning, when the Uploadcare delete fails', async () => {
    const deps = createFakeDeps();
    withFile(deps);
    deps.uploadcare.failDelete = true;
    const warn = vi.spyOn(deps.logger, 'warn');

    const view = await uploadMedia({ userId: USER_ID, kind: 'video', uploadcareUuid: UUID }, deps);

    expect(view.id).toMatch(/^[a-f\d]{24}$/);
    expect(deps.uploads.docs.size).toBe(1);
    expect(deps.uploadcare.deleted).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Could not delete a copied file from Uploadcare',
      expect.objectContaining({ uploadcareUuid: UUID }),
    );
  });

  it('keeps the Uploadcare file when the Cloudinary copy fails', async () => {
    const deps = createFakeDeps();
    withFile(deps);
    deps.storage.fail = true;

    await expect(
      uploadMedia({ userId: USER_ID, kind: 'video', uploadcareUuid: UUID }, deps),
    ).rejects.toThrow();

    expect(deps.uploads.docs.size).toBe(0);
    expect(deps.uploadcare.deleted).toEqual([]);
  });

  it('stores no frame rate or duration for an image', async () => {
    const deps = createFakeDeps();
    withFile(deps, 'image');

    const view = await uploadMedia({ userId: USER_ID, kind: 'image', uploadcareUuid: UUID }, deps);

    expect(view).toMatchObject({ kind: 'image', durationSeconds: null, frameRate: null });
    expect(deps.uploadcare.deleted).toEqual([UUID]);
  });
});
