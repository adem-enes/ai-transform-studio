'use client';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { VIDEO_ART_STYLES } from '@/schemas';
import type { VideoArtStyle } from '../lib/video-form';

/**
 * The searchable art-style list inside the style popover. Its own module so
 * cmdk loads when the popover is first opened, not with the page.
 */
export function ArtStyleList({
  listId,
  value,
  onSelect,
}: {
  listId: string;
  value: string;
  onSelect: (style: VideoArtStyle) => void;
}) {
  return (
    <Command defaultValue={value || undefined}>
      {/* Radix focuses the popover's first field on open; if this list arrived later, take focus on mount. */}
      <CommandInput
        autoFocus
        placeholder={`Search ${VIDEO_ART_STYLES.length} styles…`}
        aria-label="Search art styles"
      />
      <CommandList id={listId} aria-label="Art styles">
        <CommandEmpty>No style matches.</CommandEmpty>
        <CommandGroup>
          {VIDEO_ART_STYLES.map((style) => (
            <CommandItem
              key={style}
              value={style}
              data-checked={value === style}
              onSelect={() => onSelect(style)}
            >
              {style}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
