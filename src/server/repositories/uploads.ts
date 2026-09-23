import 'server-only';
import { ObjectId } from 'mongodb';
import { uploadsCollection } from '@/server/db/collections';
import { type UploadDoc, uploadDoc } from '@/server/db/models';
import { parseObjectId } from './cursor';

export type NewUpload = Omit<UploadDoc, '_id' | 'createdAt'>;

export async function createUpload(input: NewUpload): Promise<UploadDoc> {
  const doc = uploadDoc.parse({ ...input, _id: new ObjectId(), createdAt: new Date() });
  await (await uploadsCollection()).insertOne(doc);
  return doc;
}

/** `null` when the id is malformed, missing, or belongs to another user — callers cannot tell which. */
export async function findUploadByIdForUser(id: string, userId: string): Promise<UploadDoc | null> {
  const _id = parseObjectId(id);
  if (!_id) {
    return null;
  }
  const doc = await (await uploadsCollection()).findOne({ _id, userId });
  return doc ? uploadDoc.parse(doc) : null;
}
