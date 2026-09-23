import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Video to Video' };

export default function VideoPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Video to Video</h1>
      <p className="text-muted-foreground">Upload a short video and restyle it with AI. Coming soon.</p>
    </div>
  );
}
