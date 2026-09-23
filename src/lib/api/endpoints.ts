import {
  type HistoryResponse,
  historyResponse,
  type MediaKind,
  type TransformationView,
  type TransformRequest,
  transformResponse,
  type UploadView,
  uploadResponse,
} from '@/schemas';
import { apiRequest } from './client';

/** Typed wrappers over the API routes. Every one throws `ApiError` on failure. */

export async function registerUpload(
  input: { uploadcareUuid: string; kind: MediaKind },
  signal?: AbortSignal,
): Promise<UploadView> {
  const { upload } = await apiRequest('/api/upload', uploadResponse, { method: 'POST', body: input, signal });
  return upload;
}

export async function createTransformation(input: TransformRequest): Promise<TransformationView> {
  const { transformation } = await apiRequest('/api/transform', transformResponse, {
    method: 'POST',
    body: input,
  });
  return transformation;
}

export async function getTransformation(id: string, signal?: AbortSignal): Promise<TransformationView> {
  const { transformation } = await apiRequest(
    `/api/transformations/${encodeURIComponent(id)}`,
    transformResponse,
    { signal },
  );
  return transformation;
}

export async function listHistory(
  { kind, cursor }: { kind?: MediaKind; cursor?: string },
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (kind) {
    params.set('kind', kind);
  }
  if (cursor) {
    params.set('cursor', cursor);
  }
  const query = params.size > 0 ? `?${params}` : '';
  return apiRequest(`/api/history${query}`, historyResponse, { signal });
}
