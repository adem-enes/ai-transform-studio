import 'server-only';
import { ObjectId } from 'mongodb';
import { canTransition, isTerminalStatus, type MediaKind, type TransformationStatus } from '@/schemas';
import { type TransformationDoc, transformationDoc, type UploadDoc } from '@/server/db/models';
import { AppError } from '@/server/errors';
import { silentLogger } from '@/server/logger';
import type {
  ProjectStatus,
  StoredAsset,
  SubmittedProject,
  UploadFromUrlOptions,
  VerifiedFile,
} from '@/server/services';
import type { AppDeps, TransformationStore } from './deps';
import type { Defer } from './handle-webhook-event';

/**
 * In-memory stand-ins for every dependency of the application layer, for
 * unit tests. The transformation store reproduces the repository's
 * semantics — conditional transitions checked against
 * `ALLOWED_TRANSITIONS`, the reconciliation claim — so workflow tests
 * exercise the same state machine the database enforces.
 */

/** A detached copy. (`structuredClone` would turn `ObjectId`s into plain objects.) */
function clone(doc: TransformationDoc): TransformationDoc {
  return transformationDoc.parse(doc);
}

export class FakeClock {
  constructor(public current = new Date('2026-01-01T00:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeTransformationStore implements TransformationStore {
  readonly docs = new Map<string, TransformationDoc>();

  constructor(private readonly clock: FakeClock) {}

  async create(input: Parameters<TransformationStore['create']>[0]): Promise<TransformationDoc> {
    const now = this.clock.now();
    const doc = transformationDoc.parse({
      ...input,
      _id: new ObjectId(),
      status: 'queued',
      provider: { projectId: null, creditsCharged: null, rawError: null },
      output: null,
      error: null,
      createdAt: now,
      submittedAt: null,
      completedAt: null,
      lastReconciledAt: null,
      updatedAt: now,
    });
    this.docs.set(doc._id.toHexString(), doc);
    return clone(doc);
  }

  /** Seeds a document directly, e.g. one already submitted. */
  insert(doc: TransformationDoc): TransformationDoc {
    this.docs.set(doc._id.toHexString(), clone(doc));
    return doc;
  }

  get(id: ObjectId): TransformationDoc | undefined {
    const doc = this.docs.get(id.toHexString());
    return doc ? clone(doc) : undefined;
  }

  async delete(id: ObjectId): Promise<void> {
    this.docs.delete(id.toHexString());
  }

  async findById(id: ObjectId): Promise<TransformationDoc | null> {
    return this.get(id) ?? null;
  }

  async findByIdForUser(id: string, userId: string): Promise<TransformationDoc | null> {
    const doc = this.docs.get(id);
    return doc && doc.userId === userId ? clone(doc) : null;
  }

  async findByProjectId(projectId: string): Promise<TransformationDoc | null> {
    const doc = [...this.docs.values()].find((candidate) => candidate.provider.projectId === projectId);
    return doc ? clone(doc) : null;
  }

  async markSubmitted(
    id: ObjectId,
    {
      projectId,
      creditsCharged,
      submittedAt,
    }: { projectId: string; creditsCharged: number; submittedAt: Date },
  ): Promise<TransformationDoc | null> {
    const doc = this.docs.get(id.toHexString());
    if (doc?.status !== 'queued' || doc.provider.projectId !== null) {
      return null;
    }
    doc.provider = { ...doc.provider, projectId, creditsCharged };
    doc.submittedAt = submittedAt;
    return clone(doc);
  }

  async transition(
    id: ObjectId,
    from: readonly TransformationStatus[],
    to: TransformationStatus,
    patch: Parameters<TransformationStore['transition']>[3] = {},
  ): Promise<TransformationDoc | null> {
    const doc = this.docs.get(id.toHexString());
    if (!doc || !from.includes(doc.status) || !canTransition(doc.status, to)) {
      return null;
    }
    doc.status = to;
    doc.provider = { ...doc.provider, ...patch.provider };
    if (patch.output !== undefined) {
      doc.output = patch.output;
    }
    if (patch.error !== undefined) {
      doc.error = patch.error;
    }
    if (patch.completedAt !== undefined) {
      doc.completedAt = patch.completedAt;
    } else if (isTerminalStatus(to)) {
      doc.completedAt = this.clock.now();
    }
    doc.updatedAt = this.clock.now();
    return clone(doc);
  }

  async listActiveByUser(userId: string): Promise<TransformationDoc[]> {
    return [...this.docs.values()]
      .filter((doc) => doc.userId === userId && !isTerminalStatus(doc.status))
      .map((doc) => clone(doc));
  }

  async countActiveByUser(userId: string): Promise<number> {
    return (await this.listActiveByUser(userId)).length;
  }

  async claimReconciliation(
    id: ObjectId,
    now: Date,
    minIntervalMs: number,
  ): Promise<TransformationDoc | null> {
    const doc = this.docs.get(id.toHexString());
    if (!doc || (isTerminalStatus(doc.status) && doc.status !== 'timed_out')) {
      return null;
    }
    if (doc.lastReconciledAt && doc.lastReconciledAt.getTime() > now.getTime() - minIntervalMs) {
      return null;
    }
    doc.lastReconciledAt = now;
    return clone(doc);
  }

  async listByUser({ userId, kind, limit }: { userId: string; kind?: MediaKind; limit: number }) {
    const items = [...this.docs.values()]
      .filter((doc) => doc.userId === userId && (!kind || doc.kind === kind))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((doc) => clone(doc));
    return { items, nextCursor: null };
  }
}

export class FakeUploadStore {
  readonly docs = new Map<string, UploadDoc>();

  async create(input: Omit<UploadDoc, '_id' | 'createdAt'>): Promise<UploadDoc> {
    const doc: UploadDoc = { ...input, _id: new ObjectId(), createdAt: new Date() };
    this.docs.set(doc._id.toHexString(), doc);
    return doc;
  }

  async findByIdForUser(id: string, userId: string): Promise<UploadDoc | null> {
    const doc = this.docs.get(id);
    return doc && doc.userId === userId ? doc : null;
  }
}

/** Records every copy; set `fail` to make the next copies throw. */
export class FakeStorage {
  readonly calls: { url: string; options: UploadFromUrlOptions }[] = [];
  fail = false;

  async uploadFromUrl(url: string, options: UploadFromUrlOptions): Promise<StoredAsset> {
    this.calls.push({ url, options });
    if (this.fail) {
      throw new Error('Cloudinary is down');
    }
    const publicId = `ai-transform-studio/${options.folder}/${options.kind}/${options.publicId ?? 'generated'}`;
    return {
      publicId,
      secureUrl: `https://res.cloudinary.com/demo/${options.kind}/upload/${publicId}.${options.kind === 'image' ? 'png' : 'mp4'}`,
      bytes: 1234,
      format: options.kind === 'image' ? 'png' : 'mp4',
      width: 640,
      height: 480,
      durationSeconds: options.kind === 'video' ? 4 : null,
      frameRate: options.kind === 'video' ? 24 : null,
    };
  }
}

/** Uploadcare. Serves the files in `files`; records deletes; set `failDelete` to make them throw. */
export class FakeUploadInbox {
  readonly files = new Map<string, VerifiedFile>();
  readonly deleted: string[] = [];
  failDelete = false;

  async getVerifiedFile(uuid: string, kind: MediaKind): Promise<VerifiedFile> {
    const file = this.files.get(uuid);
    if (!file || file.kind !== kind) {
      throw new AppError('UPLOAD_NOT_FOUND');
    }
    return file;
  }

  async deleteFile(uuid: string): Promise<void> {
    if (this.failDelete) {
      throw new Error('Uploadcare is down');
    }
    this.deleted.push(uuid);
  }
}

/** Magic Hour. `submit` and `status` are replaceable per test. */
export class FakeProvider {
  readonly submissions: { kind: MediaKind; sourceUrl: string }[] = [];
  statusCalls = 0;
  submit: () => Promise<SubmittedProject> = async () => ({ projectId: 'proj_1', creditsCharged: 5 });
  status: (kind: MediaKind, projectId: string) => Promise<ProjectStatus> = async (_kind, projectId) => ({
    projectId,
    status: 'rendering',
    creditsCharged: 5,
    downloads: [],
    error: null,
  });

  async submitImage({ sourceUrl }: { sourceUrl: string }): Promise<SubmittedProject> {
    this.submissions.push({ kind: 'image', sourceUrl });
    return this.submit();
  }

  async submitVideo({ sourceUrl }: { sourceUrl: string }): Promise<SubmittedProject> {
    this.submissions.push({ kind: 'video', sourceUrl });
    return this.submit();
  }

  async getProjectStatus(kind: MediaKind, projectId: string): Promise<ProjectStatus> {
    this.statusCalls += 1;
    return this.status(kind, projectId);
  }
}

/** Stands in for `after()`: holds deferred tasks until the test runs them. */
export class DeferQueue {
  readonly tasks: (() => Promise<void>)[] = [];
  readonly defer: Defer = (task) => {
    this.tasks.push(task);
  };

  /** Runs every queued task (including any they queue), in order. */
  async runAll(): Promise<void> {
    for (let task = this.tasks.shift(); task; task = this.tasks.shift()) {
      await task();
    }
  }
}

export type FakeDeps = AppDeps & {
  defer: Defer;
  deferred: DeferQueue;
  clock: FakeClock;
  transformations: FakeTransformationStore;
  uploads: FakeUploadStore;
  storage: FakeStorage;
  uploadcare: FakeUploadInbox;
  provider: FakeProvider;
};

export function createFakeDeps(): FakeDeps {
  const clock = new FakeClock();
  const deferred = new DeferQueue();
  return {
    clock,
    deferred,
    defer: deferred.defer,
    transformations: new FakeTransformationStore(clock),
    uploads: new FakeUploadStore(),
    storage: new FakeStorage(),
    uploadcare: new FakeUploadInbox(),
    provider: new FakeProvider(),
    // A fresh object per call, so a test can spy on it without affecting others.
    logger: { ...silentLogger },
  };
}

export const USER_ID = '6f1c2f8e-4a4b-4c1e-9d7a-1f2e3d4c5b6a';

/** A transformation already submitted to Magic Hour, in `status`. */
export function seedSubmitted(
  deps: FakeDeps,
  {
    kind = 'image',
    status = 'queued',
    projectId = 'proj_1',
    submittedAt = deps.clock.now(),
  }: {
    kind?: MediaKind;
    status?: TransformationStatus;
    projectId?: string | null;
    submittedAt?: Date | null;
  } = {},
): TransformationDoc {
  const now = deps.clock.now();
  const common = {
    _id: new ObjectId(),
    userId: USER_ID,
    uploadId: new ObjectId(),
    source: {
      secureUrl: 'https://res.cloudinary.com/demo/image/upload/source.png',
      mime: kind === 'image' ? 'image/png' : 'video/mp4',
      width: 640,
      height: 480,
      durationSeconds: kind === 'video' ? 4 : null,
      frameRate: kind === 'video' ? 24 : null,
    },
    status,
    provider: { projectId, creditsCharged: projectId ? 5 : null, rawError: null },
    output: null,
    error: null,
    createdAt: now,
    submittedAt: projectId ? submittedAt : null,
    completedAt: null,
    lastReconciledAt: null,
    updatedAt: now,
  };
  const doc = transformationDoc.parse(
    kind === 'image'
      ? { ...common, kind, params: { prompt: 'make it blue', model: 'flux-2-klein', resolution: '640px' } }
      : { ...common, kind, params: { start_seconds: 0, end_seconds: 2, art_style: 'Clay' } },
  );
  return deps.transformations.insert(doc);
}
