import type { TransformationView } from '@/schemas';

/**
 * Width ÷ height of a finished result's frame: the output's real dimensions,
 * recorded when it was stored, so nothing shifts when it loads. Results
 * stored before those were recorded fall back to the source's shape; 1:1
 * when neither is known.
 */
export function resultRatio(transformation: Pick<TransformationView, 'output' | 'source'>): number {
  const { output, source } = transformation;
  if (output?.width && output.height) {
    return output.width / output.height;
  }
  if (source.width && source.height) {
    return source.width / source.height;
  }
  return 1;
}
