import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { transformationDoc } from '@/server/db/models';
import { toTransformationView } from '@/server/views';
import { finalizeTransformation, toStoredOutput } from './finalize-transformation';
import { createFakeDeps, seedSubmitted } from './testing';

const DOWNLOAD_URL = 'https://videos.magichour.ai/proj_1/output.mp4';

describe('finalizeTransformation — output dimensions', () => {
  it('stores the width, height and duration Cloudinary reports for a video output', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { kind: 'video', status: 'processing' });

    const done = await finalizeTransformation(job, { downloadUrl: DOWNLOAD_URL }, deps);

    expect(done.status).toBe('completed');
    expect(done.output).toMatchObject({ width: 640, height: 480, durationSeconds: 4 });
    expect(toTransformationView(done).output).toEqual({
      url: done.output?.secureUrl,
      width: 640,
      height: 480,
      durationSeconds: 4,
    });
  });

  it('stores no duration for an image output', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { kind: 'image', status: 'processing' });

    const done = await finalizeTransformation(job, { downloadUrl: DOWNLOAD_URL }, deps);

    expect(done.output).toMatchObject({ width: 640, height: 480, durationSeconds: null });
  });
});

describe('finalizeTransformation — credits', () => {
  it('records the final credits figure when the provider reports one', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { kind: 'video', status: 'processing' });

    const done = await finalizeTransformation(job, { downloadUrl: DOWNLOAD_URL, creditsCharged: 38 }, deps);

    expect(done.provider.creditsCharged).toBe(38);
    expect(toTransformationView(done).creditsCharged).toBe(38);
  });

  it('keeps the up-front figure when none is reported', async () => {
    const deps = createFakeDeps();
    const job = seedSubmitted(deps, { status: 'processing' });

    const done = await finalizeTransformation(job, { downloadUrl: DOWNLOAD_URL }, deps);

    expect(done.provider.creditsCharged).toBe(5);
  });
});

describe('toStoredOutput', () => {
  it('keeps unknown dimensions as null', () => {
    expect(
      toStoredOutput({
        publicId: 'p',
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/p.mp4',
        bytes: 1,
        format: 'mp4',
        width: null,
        height: null,
        durationSeconds: null,
        frameRate: null,
      }),
    ).toEqual({
      publicId: 'p',
      secureUrl: 'https://res.cloudinary.com/demo/video/upload/p.mp4',
      width: null,
      height: null,
      durationSeconds: null,
    });
  });
});

describe('stored documents written before dimensions were recorded', () => {
  it('read with null output dimensions and frame rate, and view as such', () => {
    const deps = createFakeDeps();
    const current = seedSubmitted(deps, { kind: 'video', status: 'completed' });
    const { frameRate: _frameRate, ...legacySource } = current.source;
    const legacy = transformationDoc.parse({
      ...current,
      _id: new ObjectId(),
      source: legacySource,
      output: { publicId: 'old', secureUrl: 'https://res.cloudinary.com/demo/video/upload/old.mp4' },
    });

    const view = toTransformationView(legacy);

    expect(view.source.frameRate).toBeNull();
    expect(view.output).toEqual({
      url: 'https://res.cloudinary.com/demo/video/upload/old.mp4',
      width: null,
      height: null,
      durationSeconds: null,
    });
  });
});
