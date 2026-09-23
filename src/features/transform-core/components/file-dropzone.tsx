'use client';

import { FileImageIcon, FileVideoIcon, UploadIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MEDIA_LIMITS, type MediaKind, type UploadView } from '@/schemas';
import { type UploadPhase, useFileUpload } from '../hooks/use-file-upload';
import { getErrorPresentation } from '../lib/error-presentation';
import { acceptAttribute, describeAllowedTypes } from '../lib/file-validation';
import { formatBytes } from '../lib/format';
import { type SourceMedia, sourceFromUpload } from '../lib/source';
import { MediaFrame } from './media-frame';
import { TransformationError } from './transformation-error';

type FileDropzoneProps = {
  kind: MediaKind;
  /** The chosen source, owned by the parent. Shown as the "ready" state. */
  value: SourceMedia | null;
  onChange: (source: SourceMedia | null, upload?: UploadView) => void;
  /** Id of the heading that names this upload step. */
  labelledBy: string;
  disabled?: boolean;
};

/** Preview box shared by every state, so switching between them never changes the height. */
const PREVIEW_CLASS = 'aspect-[16/10]';

/**
 * Choose, drop or paste a file; it is validated locally, uploaded with real
 * progress (cancellable) and stored, then handed to the parent. Knows nothing
 * about transformation parameters.
 */
export function FileDropzone({ kind, value, onChange, labelledBy, disabled = false }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLFieldSetElement>(null);
  const previousRef = useRef<SourceMedia | null>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const noun = kind === 'image' ? 'image' : 'video';

  const { state, start, cancel, reset } = useFileUpload(kind, {
    onStart: () => {
      previousRef.current = value ?? previousRef.current;
      onChange(null);
    },
    onUploaded: (upload) => {
      previousRef.current = null;
      onChange(sourceFromUpload(upload), upload);
    },
    onCancel: () => {
      onChange(previousRef.current);
      previousRef.current = null;
    },
  });

  const busy = state.phase === 'uploading' || state.phase === 'storing';

  function openPicker() {
    inputRef.current?.click();
  }

  function takeFiles(files: FileList | null | undefined) {
    const file = files?.[0];
    if (file && !disabled) {
      start(file);
    }
  }

  // Paste from the clipboard, anywhere on the page, when not mid-upload.
  useEffect(() => {
    if (busy || disabled) {
      return;
    }
    function onPaste(event: ClipboardEvent) {
      const file = event.clipboardData?.files[0];
      if (file) {
        event.preventDefault();
        start(file);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [busy, disabled, start]);

  // A file dropped just outside the zone would otherwise replace the page.
  useEffect(() => {
    function block(event: DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
    }
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  // The button that had focus disappears between states; hand focus to the
  // new state's main control, unless the user is focused elsewhere (e.g. pasted
  // while typing a prompt).
  const phaseKey = state.phase === 'idle' ? (value ? 'ready' : 'idle') : state.phase;
  const lastPhaseKey = useRef(phaseKey);
  useEffect(() => {
    if (lastPhaseKey.current === phaseKey) {
      return;
    }
    lastPhaseKey.current = phaseKey;
    const active = document.activeElement;
    if (active && active !== document.body && !zoneRef.current?.contains(active)) {
      return;
    }
    zoneRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [phaseKey]);

  const announcement = announce(state, value, noun);

  return (
    <fieldset
      ref={zoneRef}
      aria-labelledby={labelledBy}
      onDragEnter={(event) => {
        if (!busy && event.dataTransfer.types.includes('Files')) {
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (!busy && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) {
          takeFiles(event.dataTransfer.files);
        }
      }}
      className={cn(
        'min-w-0 rounded-xl border-2 border-dashed p-4 transition-colors sm:p-5',
        dragging ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute(kind)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          takeFiles(event.target.files);
          // Allow choosing the same file again after an error.
          event.target.value = '';
        }}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {state.phase === 'uploading' || state.phase === 'storing' ? (
        <InFlight state={state} kind={kind} onCancel={cancel} />
      ) : state.phase === 'error' ? (
        <div className="space-y-3">
          <TransformationError
            code={state.code}
            note={state.detail}
            actions={{ retry: state.retry ?? undefined, 'choose-file': openPicker }}
          >
            {getErrorPresentation(state.code).action === 'choose-file' ? null : (
              <Button type="button" variant="outline" onClick={openPicker}>
                Choose another file
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                if (previousRef.current) {
                  onChange(previousRef.current);
                  previousRef.current = null;
                }
              }}
            >
              Dismiss
            </Button>
          </TransformationError>
          {state.file ? <FileLine file={state.file} kind={kind} /> : null}
        </div>
      ) : value ? (
        <div className="space-y-3">
          <MediaFrame
            src={value.url}
            alt={value.filename ? `Uploaded ${noun}: ${value.filename}` : `Uploaded ${noun}`}
            aspectRatio={16 / 10}
            sizes="(min-width: 1024px) 480px, 100vw"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{value.filename ?? `Your earlier ${noun}`}</p>
              <p className="text-muted-foreground">
                {[
                  value.bytes === null ? null : formatBytes(value.bytes),
                  value.width && value.height ? `${value.width} × ${value.height}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Ready'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={openPicker}
              disabled={disabled}
              data-autofocus
              aria-describedby={hintId}
            >
              <UploadIcon aria-hidden="true" />
              Replace
            </Button>
          </div>
          <p id={hintId} className="sr-only">
            {hintText(kind)}
          </p>
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 py-4 text-center">
          <UploadIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-sm">
            <span className="hidden sm:inline">
              Drag and drop {noun === 'image' ? 'an image' : 'a video'} here, or
            </span>
            <span className="sm:hidden">
              Pick {noun === 'image' ? 'an image' : 'a video'} from your device
            </span>
          </p>
          <Button
            type="button"
            size="lg"
            onClick={openPicker}
            disabled={disabled}
            data-autofocus
            aria-describedby={hintId}
          >
            Choose {noun}
          </Button>
          <p id={hintId} className="max-w-xs text-xs text-muted-foreground">
            {hintText(kind)}
          </p>
        </div>
      )}
    </fieldset>
  );
}

function hintText(kind: MediaKind): string {
  const types = describeAllowedTypes(kind);
  const size = formatBytes(MEDIA_LIMITS[kind].maxBytes);
  return `${types}, up to ${size}.${kind === 'image' ? ' You can also paste an image.' : ''}`;
}

function InFlight({
  state,
  kind,
  onCancel,
}: {
  state: Extract<UploadPhase, { phase: 'uploading' | 'storing' }>;
  kind: MediaKind;
  onCancel: () => void;
}) {
  const percent =
    state.phase === 'uploading' && state.progress !== null ? Math.round(state.progress * 100) : null;
  return (
    <div className="space-y-3">
      <div className={cn('relative overflow-hidden rounded-lg bg-muted', PREVIEW_CLASS)}>
        {state.previewUrl ? (
          // A local blob URL: nothing for the loader to resize.
          <MediaFrame
            src={state.previewUrl}
            alt=""
            aspectRatio={16 / 10}
            sizes="480px"
            unoptimized
            className="opacity-60"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {kind === 'image' ? (
              <FileImageIcon aria-hidden="true" className="size-8 text-muted-foreground" />
            ) : (
              <FileVideoIcon aria-hidden="true" className="size-8 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="min-w-0 truncate font-medium">
            {state.phase === 'uploading' ? 'Uploading…' : 'Saving to secure storage…'}
          </p>
          {percent !== null ? (
            <p className="shrink-0 text-muted-foreground tabular-nums">{percent}%</p>
          ) : null}
        </div>
        {percent !== null ? (
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : (
          <div
            role="progressbar"
            aria-label={state.phase === 'uploading' ? 'Uploading' : 'Saving to secure storage'}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FileLine file={state.file} kind={kind} />
          {state.phase === 'uploading' ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} data-autofocus>
              <XIcon aria-hidden="true" />
              Cancel upload
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FileLine({ file, kind }: { file: File; kind: MediaKind }) {
  return (
    <p className="min-w-0 truncate text-sm text-muted-foreground">
      <span className="sr-only">{kind === 'image' ? 'Image' : 'Video'}: </span>
      {file.name} · {formatBytes(file.size)}
    </p>
  );
}

function announce(state: UploadPhase, value: SourceMedia | null, noun: string): string {
  switch (state.phase) {
    case 'uploading':
      return `Uploading ${state.file.name}.`;
    case 'storing':
      return 'Upload finished. Saving to secure storage.';
    case 'error':
      return '';
    case 'idle':
      return value
        ? `${noun === 'image' ? 'Image' : 'Video'} ready${value.filename ? `: ${value.filename}` : ''}.`
        : '';
  }
}
