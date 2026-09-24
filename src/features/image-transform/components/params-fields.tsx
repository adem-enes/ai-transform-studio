'use client';

import { InfoIcon } from 'lucide-react';
import { type Control, Controller, type UseFormSetValue, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_MODELS,
  IMAGE_PROMPT_MAX_LENGTH,
  type ImageModel,
  type ImageResolution,
} from '@/schemas';
import {
  ASPECT_RATIO_LABELS,
  describeCost,
  EXAMPLE_PROMPTS,
  IMAGE_MODEL_INFO,
  RESOLUTION_LABELS,
} from '../config/models';
import { reconcileResolution, supportedResolutions } from '../lib/resolution';

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

/**
 * `default` stays valid (older history uses it) but isn't offered: Magic Hour
 * resolves it to a model the free tier can't use, which fails with a 402.
 */
const SELECTABLE_IMAGE_MODELS = IMAGE_MODELS.filter((model) => model !== 'default');

export type ImageFormValues = {
  prompt: string;
  model: ImageModel;
  aspect_ratio: ImageAspectRatio;
  resolution: ImageResolution;
};

type FieldProps = { control: Control<ImageFormValues>; disabled?: boolean };

const describedBy = (...ids: (string | false | null | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

export function PromptField({
  control,
  disabled,
  setValue,
}: FieldProps & { setValue: UseFormSetValue<ImageFormValues> }) {
  return (
    <Controller
      name="prompt"
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="prompt">Prompt</FieldLabel>
          <Textarea
            {...field}
            id="prompt"
            rows={4}
            disabled={disabled}
            maxLength={IMAGE_PROMPT_MAX_LENGTH}
            placeholder="Describe the change you want, e.g. “make it a snowy winter scene”"
            aria-invalid={fieldState.invalid}
            aria-describedby={describedBy(
              'prompt-hint',
              'prompt-count',
              fieldState.invalid && 'prompt-error',
            )}
            className="min-h-24"
          />
          <div className="flex items-start justify-between gap-3">
            <FieldDescription id="prompt-hint">
              Say what should change; the rest of the image is kept.
            </FieldDescription>
            <p id="prompt-count" className="shrink-0 text-xs text-muted-foreground tabular-nums">
              <span className="sr-only">Characters used: </span>
              {field.value.length.toLocaleString('en')} / {IMAGE_PROMPT_MAX_LENGTH.toLocaleString('en')}
            </p>
          </div>
          {fieldState.invalid ? <FieldError id="prompt-error" errors={[fieldState.error]} /> : null}
          <div className="space-y-1.5">
            <p id="prompt-examples" className="text-xs font-medium text-muted-foreground">
              Try an example
            </p>
            <ul aria-labelledby="prompt-examples" className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((example) => (
                <li key={example}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    className="h-auto min-h-7 whitespace-normal text-left"
                    onClick={() =>
                      setValue('prompt', example, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      })
                    }
                  >
                    {example}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Field>
      )}
    />
  );
}

export function ModelField({
  control,
  disabled,
  onModelChange,
}: FieldProps & { onModelChange: (model: ImageModel) => void }) {
  return (
    <Controller
      name="model"
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="model">Model</FieldLabel>
          <Select
            name={field.name}
            value={field.value}
            disabled={disabled}
            onValueChange={(value) => {
              field.onChange(value);
              onModelChange(value as ImageModel);
            }}
          >
            <SelectTrigger
              id="model"
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              aria-describedby={describedBy('model-hint', fieldState.invalid && 'model-error')}
              className="h-10 w-full data-[size=default]:h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-80">
              {SELECTABLE_IMAGE_MODELS.map((model) => (
                <SelectItem key={model} value={model}>
                  <span>{IMAGE_MODEL_INFO[model].label}</span>
                  <span className="text-muted-foreground">· {describeCost(model)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id="model-hint">Models differ in style, speed and cost.</FieldDescription>
          {fieldState.invalid ? <FieldError id="model-error" errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );
}

/** A small box with the ratio's proportions, drawn inside a fixed 28px square. */
function RatioShape({ ratio }: { ratio: ImageAspectRatio }) {
  if (ratio === 'auto') {
    return (
      <span
        aria-hidden="true"
        className="block size-6 rounded-[3px] border-2 border-dashed border-current opacity-70"
      />
    );
  }
  const [w = 1, h = 1] = ratio.split(':').map(Number);
  const scale = 24 / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="block rounded-[3px] border-2 border-current"
      style={{ width: `${Math.round(w * scale)}px`, height: `${Math.round(h * scale)}px` }}
    />
  );
}

export function AspectRatioField({ control, disabled }: FieldProps) {
  return (
    <Controller
      name="aspect_ratio"
      control={control}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid}>
          <FieldLegend variant="label">Aspect ratio</FieldLegend>
          <FieldDescription id="aspect-hint">“Auto” keeps the shape of your image.</FieldDescription>
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
            aria-describedby={describedBy('aspect-hint', fieldState.invalid && 'aspect-error')}
            className="grid grid-cols-4 gap-2"
          >
            {IMAGE_ASPECT_RATIOS.map((ratio) => (
              <label
                key={ratio}
                htmlFor={`aspect-${ratio.replace(':', '-')}`}
                className={cn(
                  'flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs transition-colors hover:bg-muted',
                  'has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                  'has-data-checked:border-primary has-data-checked:bg-primary/5',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <RadioGroupItem id={`aspect-${ratio.replace(':', '-')}`} value={ratio} className="sr-only" />
                <span className="flex size-7 items-center justify-center">
                  <RatioShape ratio={ratio} />
                </span>
                <span className="font-medium">{ratio === 'auto' ? 'Auto' : ratio}</span>
                {ratio === 'auto' ? null : (
                  <span className="text-muted-foreground">{ASPECT_RATIO_LABELS[ratio]}</span>
                )}
              </label>
            ))}
          </RadioGroup>
          {fieldState.invalid ? <FieldError id="aspect-error" errors={[fieldState.error]} /> : null}
        </FieldSet>
      )}
    />
  );
}

export function ResolutionField({ control, disabled, resetNote }: FieldProps & { resetNote: string | null }) {
  const model = useWatch({ control, name: 'model' });
  const options = supportedResolutions(model);
  return (
    <Controller
      name="resolution"
      control={control}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid}>
          <FieldLegend variant="label">Resolution</FieldLegend>
          <FieldDescription id="resolution-hint">
            Longest edge of the result. Only sizes the selected model supports are shown.
          </FieldDescription>
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
            aria-describedby={describedBy(
              'resolution-hint',
              resetNote && 'resolution-note',
              fieldState.invalid && 'resolution-error',
            )}
            className="flex flex-wrap gap-2"
          >
            {options.map((resolution) => (
              <label
                key={resolution}
                htmlFor={`resolution-${resolution}`}
                className={cn(
                  'flex h-10 min-w-16 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted',
                  'has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                  'has-data-checked:border-primary has-data-checked:bg-primary/5',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <RadioGroupItem id={`resolution-${resolution}`} value={resolution} className="sr-only" />
                {RESOLUTION_LABELS[resolution]}
              </label>
            ))}
          </RadioGroup>
          {resetNote ? (
            <p id="resolution-note" role="status" className="flex gap-1.5 text-sm text-muted-foreground">
              <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {resetNote}
            </p>
          ) : null}
          {fieldState.invalid ? <FieldError id="resolution-error" errors={[fieldState.error]} /> : null}
        </FieldSet>
      )}
    />
  );
}

/** The inline note shown when a model change forced a different resolution, or `null`. */
export function resolutionResetNote(
  model: ImageModel,
  current: ImageResolution,
): { next: ImageResolution; note: string | null } {
  const { resolution, changed } = reconcileResolution(model, current);
  return {
    next: resolution,
    note: changed
      ? `${IMAGE_MODEL_INFO[model].label} doesn’t support ${RESOLUTION_LABELS[current]}, so resolution was set to ${RESOLUTION_LABELS[resolution]}.`
      : null,
  };
}
