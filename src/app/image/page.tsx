import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Image to Image' };

export default function ImagePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Image to Image</h1>
      <p className="text-muted-foreground">Upload an image and transform it with AI. Coming soon.</p>
    </div>
  );
}
