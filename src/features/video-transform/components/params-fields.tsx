'use client';

import { ChevronsUpDownIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { type Control, Controller, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  VIDEO_FPS_RESOLUTIONS,
  VIDEO_MODELS,
  VIDEO_PROMPT_MAX_LENGTH,
  VIDEO_PROMPT_TYPES,
  VIDEO_VERSIONS,
  type VideoTransformParams,
} from '@/schemas';
import {
  FPS_OPTIONS,
  PROMPT_TYPE_OPTIONS,
  VIDEO_MODEL_LABELS,
  VIDEO_VERSION_LABELS,
} from '../config/options';
import type { VideoFormContext, VideoFormValues } from '../lib/video-form';

type FieldProps = {
  control: Control<VideoFormValues, VideoFormContext, VideoTransformParams>;
  disabled?: boolean;
};

const describedBy = (...ids: (string | false | null | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

const optionCard = (disabled?: boolean) =>
  cn(
    'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted',
    'has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
    'has-data-checked:border-primary has-data-checked:bg-primary/5',
    disabled && 'cursor-not-allowed opacity-50',
  );

/**
 * The required art style: a searchable list of the API's 75 styles. The
 * trigger is a combobox button that always shows the current choice; the
 * popup is filtered as you type and navigated with the arrow keys; Enter
 * picks, Escape closes, and focus returns to the trigger either way.
 */
/** Warms the list's chunk when the user heads for the trigger, so opening rarely shows the fallback. */
const preloadArtStyleList = () => void import('./art-style-list');

const ArtStyleList = dynamic(() => import('./art-style-list').then((module) => module.ArtStyleList), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-3 text-sm text-muted-foreground">
      Loading styles…
    </p>
  ),
});

export function ArtStyleField({ control, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const listId = 'art-style-list';
  return (
    <Controller
      name="art_style"
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="art_style">
            Art style <span className="text-muted-foreground">(required)</span>
          </FieldLabel>
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                field.onBlur();
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id="art_style"
                ref={field.ref}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-haspopup="listbox"
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy('art-style-hint', fieldState.invalid && 'art-style-error')}
                disabled={disabled}
                onPointerEnter={preloadArtStyleList}
                onFocus={preloadArtStyleList}
                className={cn(
                  'h-10 w-full justify-between font-normal',
                  !field.value && 'text-muted-foreground',
                )}
              >
                <span className="truncate">{field.value || 'Choose a style…'}</span>
                <ChevronsUpDownIcon aria-hidden="true" className="opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
              <ArtStyleList
                listId={listId}
                value={field.value}
                onSelect={(style) => {
                  field.onChange(style);
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <FieldDescription id="art-style-hint">
            The look applied to every frame. Type to filter the list.
          </FieldDescription>
          {fieldState.invalid ? <FieldError id="art-style-error" errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );
}

function SelectField<N extends 'model' | 'version'>({
  control,
  disabled,
  name,
  label,
  hint,
  options,
  labels,
}: FieldProps & {
  name: N;
  label: string;
  hint: string;
  options: readonly VideoFormValues[N][];
  labels: Record<VideoFormValues[N], string>;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select name={field.name} value={field.value} disabled={disabled} onValueChange={field.onChange}>
            <SelectTrigger
              id={name}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              aria-describedby={describedBy(`${name}-hint`, fieldState.invalid && `${name}-error`)}
              className="h-10 w-full data-[size=default]:h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-80">
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={`${name}-hint`}>{hint}</FieldDescription>
          {fieldState.invalid ? <FieldError id={`${name}-error`} errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );
}

export function ModelField(props: FieldProps) {
  return (
    <SelectField
      {...props}
      name="model"
      label="Model"
      hint="“Default” picks the model recommended for the art style. Dreamshaper suits animation and realism; Absolute Reality leans realistic; Flat 2D Anime gives flat illustration."
      options={VIDEO_MODELS}
      labels={VIDEO_MODEL_LABELS}
    />
  );
}

export function VersionField(props: FieldProps) {
  return (
    <SelectField
      {...props}
      name="version"
      label="Version"
      hint="“Default” uses the version recommended for the art style. v1 follows the prompt more closely; v2 is faster and less noisy."
      options={VIDEO_VERSIONS}
      labels={VIDEO_VERSION_LABELS}
    />
  );
}

/**
 * Prompt type and, only for Custom or Append, the prompt itself (required
 * then). With Default the textarea is removed and the submit mapping drops
 * whatever it held.
 */
export function PromptFields({ control, disabled }: FieldProps) {
  const promptType = useWatch({ control, name: 'prompt_type' });
  return (
    <>
      <Controller
        name="prompt_type"
        control={control}
        render={({ field }) => (
          <FieldSet>
            <FieldLegend variant="label">Prompt</FieldLegend>
            <RadioGroup
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
              className="grid gap-2"
            >
              {VIDEO_PROMPT_TYPES.map((type) => (
                <label key={type} htmlFor={`prompt-type-${type}`} className={optionCard(disabled)}>
                  <RadioGroupItem
                    id={`prompt-type-${type}`}
                    value={type}
                    aria-labelledby={`prompt-type-${type}-label`}
                    aria-describedby={`prompt-type-${type}-hint`}
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span id={`prompt-type-${type}-label`} className="block font-medium">
                      {PROMPT_TYPE_OPTIONS[type].label}
                    </span>
                    <span id={`prompt-type-${type}-hint`} className="block text-muted-foreground">
                      {PROMPT_TYPE_OPTIONS[type].description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </FieldSet>
        )}
      />
      {promptType === 'default' ? null : (
        <Controller
          name="prompt"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="prompt">
                {promptType === 'custom' ? 'Your prompt' : 'Prompt to add'}{' '}
                <span className="text-muted-foreground">(required)</span>
              </FieldLabel>
              <Textarea
                {...field}
                id="prompt"
                rows={3}
                disabled={disabled}
                maxLength={VIDEO_PROMPT_MAX_LENGTH}
                placeholder="e.g. “neon city at night, rain, cinematic lighting”"
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy(
                  'prompt-hint',
                  'prompt-count',
                  fieldState.invalid && 'prompt-error',
                )}
                className="min-h-20"
              />
              <div className="flex items-start justify-between gap-3">
                <FieldDescription id="prompt-hint">
                  {promptType === 'custom'
                    ? 'Describe the look in your own words.'
                    : 'Added in front of the art style’s own prompt.'}
                </FieldDescription>
                <p id="prompt-count" className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  <span className="sr-only">Characters used: </span>
                  {field.value.length.toLocaleString('en')} / {VIDEO_PROMPT_MAX_LENGTH.toLocaleString('en')}
                </p>
              </div>
              {fieldState.invalid ? <FieldError id="prompt-error" errors={[fieldState.error]} /> : null}
            </Field>
          )}
        />
      )}
    </>
  );
}

export function FpsField({ control, disabled }: FieldProps) {
  return (
    <Controller
      name="fps_resolution"
      control={control}
      render={({ field }) => (
        <FieldSet>
          <FieldLegend variant="label">Frame rate</FieldLegend>
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
            className="grid gap-2 sm:grid-cols-2"
          >
            {VIDEO_FPS_RESOLUTIONS.map((fps) => (
              <label key={fps} htmlFor={`fps-${fps}`} className={optionCard(disabled)}>
                <RadioGroupItem
                  id={`fps-${fps}`}
                  value={fps}
                  aria-labelledby={`fps-${fps}-label`}
                  aria-describedby={`fps-${fps}-hint`}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span id={`fps-${fps}-label`} className="block font-medium">
                    {FPS_OPTIONS[fps].label}
                  </span>
                  <span id={`fps-${fps}-hint`} className="block text-muted-foreground">
                    {FPS_OPTIONS[fps].description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
    />
  );
}
