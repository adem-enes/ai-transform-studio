import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { TransformSpec } from '@/schemas';
import type { UploadDoc } from '@/server/db/models';
import { AppError } from '@/server/errors';
import { mapProviderFailure, providerFailure } from '@/server/services/magic-hour-errors';
import { createTransformation } from './create-transformation';
import { createFakeDeps, type FakeDeps, seedSubmitted, USER_ID } from './testing';

function seedUpload(
  deps: FakeDeps,
  kind: 'image' | 'video' = 'image',
  durationSeconds: number | null = null,
) {
  const upload: UploadDoc = {
    _id: new ObjectId(),
    userId: USER_ID,
    kind,
    uploadcareUuid: '0b8e6a52-9f7a-4f7b-9d8a-3c2b1a0f9e8d',
    originalFilename: kind === 'image' ? 'cat.png' : 'clip.mp4',
    mime: kind === 'image' ? 'image/png' : 'video/mp4',
    bytes: 1000,
    width: 640,
    height: 480,
    durationSeconds,
    frameRate: kind === 'video' ? 30 : null,
    cloudinary: {
      publicId: 'ai-transform-studio/sources/x',
      secureUrl: `https://res.cloudinary.com/demo/${kind}/upload/x.${kind === 'image' ? 'png' : 'mp4'}`,
      resourceType: kind,
    },
    createdAt: new Date(),
  };
  deps.uploads.docs.set(upload._id.toHexString(), upload);
  return upload;
}

const IMAGE_SPEC: TransformSpec = {
  kind: 'image',
  params: { prompt: 'make it blue', model: 'flux-2-klein', aspect_ratio: 'auto', resolution: '640px' },
};

function videoSpec(endSeconds: number): TransformSpec {
  return {
    kind: 'video',
    params: {
      start_seconds: 0,
      end_seconds: endSeconds,
      fps_resolution: 'HALF',
      art_style: 'Clay',
      model: 'default',
      version: 'default',
      prompt_type: 'default',
      prompt: null,
    },
  };
}

describe('createTransformation', () => {
  it('creates the job queued, submits once and saves the project id', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps);

    const view = await createTransformation(
      { userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC },
      deps,
    );

    expect(view.status).toBe('queued');
    expect(deps.provider.submissions).toEqual([{ kind: 'image', sourceUrl: upload.cloudinary.secureUrl }]);
    const doc = deps.transformations.get(new ObjectId(view.id));
    expect(doc?.provider).toMatchObject({ projectId: 'proj_1', creditsCharged: 5 });
    expect(doc?.submittedAt).toEqual(deps.clock.now());
  });

  it('marks the job failed with INSUFFICIENT_CREDITS and rethrows when Magic Hour answers 402', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps);
    deps.provider.submit = async () => {
      throw mapProviderFailure(
        providerFailure(402, { code: 'insufficient_credits', message: 'Out of credits' }),
      );
    };

    const error = await createTransformation(
      { userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC },
      deps,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'INSUFFICIENT_CREDITS', httpStatus: 402 });
    const [doc] = deps.transformations.docs.values();
    expect(doc?.status).toBe('failed');
    expect(doc?.error?.code).toBe('INSUFFICIENT_CREDITS');
    expect(doc?.provider.rawError).toEqual({
      status: 402,
      code: 'insufficient_credits',
      message: 'Out of credits',
    });
    expect(deps.provider.submissions).toHaveLength(1);
  });

  it('rejects with TOO_MANY_ACTIVE_JOBS when two jobs are already in flight, without submitting', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps);
    seedSubmitted(deps, { status: 'processing', projectId: 'proj_a' });
    seedSubmitted(deps, { status: 'queued', projectId: 'proj_b' });

    await expect(
      createTransformation({ userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC }, deps),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ACTIVE_JOBS', httpStatus: 429 });
    expect(deps.provider.submissions).toHaveLength(0);
    expect(deps.transformations.docs.size).toBe(2);
  });

  it('frees a slot when an active job turns out to be finished at the provider', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps);
    seedSubmitted(deps, { status: 'processing', projectId: 'proj_a' });
    seedSubmitted(deps, { status: 'processing', projectId: 'proj_b' });
    deps.provider.status = async (_kind, projectId) => ({
      projectId,
      status: projectId === 'proj_a' ? 'canceled' : 'rendering',
      creditsCharged: 0,
      downloads: [],
      error: null,
    });

    const view = await createTransformation(
      { userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC },
      deps,
    );
    expect(view.status).toBe('queued');
  });

  it('rejects a video end time past the source duration with a field-level message', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps, 'video', 3.5);

    const error = await createTransformation(
      { userId: USER_ID, uploadId: upload._id.toHexString(), ...videoSpec(4) },
      deps,
    ).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', httpStatus: 400 });
    expect((error as AppError).details).toEqual({
      'params.end_seconds': ['The end time must not exceed the video length (3.5 s).'],
    });
    expect(deps.transformations.docs.size).toBe(0);
  });

  it('accepts a video end time equal to the source duration', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps, 'video', 4);
    await expect(
      createTransformation({ userId: USER_ID, uploadId: upload._id.toHexString(), ...videoSpec(4) }, deps),
    ).resolves.toMatchObject({ status: 'queued', kind: 'video' });
  });

  it('rejects an upload of another user or kind', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps, 'video', 4);
    await expect(
      createTransformation(
        { userId: 'someone-else', uploadId: upload._id.toHexString(), ...IMAGE_SPEC },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
    await expect(
      createTransformation({ userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC }, deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('logs the project id when it cannot be saved after a successful submission', async () => {
    const deps = createFakeDeps();
    const upload = seedUpload(deps);
    const logError = vi.spyOn(deps.logger, 'error');
    deps.transformations.markSubmitted = async () => {
      throw new Error('primary stepped down');
    };

    await expect(
      createTransformation({ userId: USER_ID, uploadId: upload._id.toHexString(), ...IMAGE_SPEC }, deps),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(logError).toHaveBeenCalledWith(
      'Magic Hour project submitted but its id could not be saved',
      expect.objectContaining({ projectId: 'proj_1', transformationId: expect.any(ObjectId) }),
    );
    expect(deps.provider.submissions).toHaveLength(1);
  });
});
