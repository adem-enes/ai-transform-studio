# AI Transform Studio

Upload an image or a short video, describe or pick a style, and get an AI-transformed version back from the [Magic Hour API](https://docs.magichour.ai). Jobs run asynchronously: the browser uploads straight to Uploadcare, the server stores everything in Cloudinary and MongoDB, Magic Hour reports back by signed webhook, and the page polls until the result is ready. Every visitor gets a history of their transformations without signing up.

**Live:** https://ai-transform-studio.vercel.app

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [API](#api)
- [Webhook setup and security](#webhook-setup-and-security)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Known limitations](#known-limitations)

## Features

- **Image to Image** (`/image`), the primary flow: prompt, model, aspect ratio and resolution, via Magic Hour's AI Image Editor. Before/after comparison with a side-by-side view and a slider.
- **Video to Video** (`/video`), fully implemented: pick a clip of up to 5 s, one of 70+ art styles, model, version, prompt mode and frame rate. Image is the primary flow because video credits are expensive (a 5 s clip at 24 fps costs about 240 credits, an image from 5); the case allows this.
- **Direct uploads** with real progress and cancel. Files go from the browser to Uploadcare (signed, multipart above 10 MB), never through a serverless function. Images: JPEG, PNG, WebP up to 10 MB. Videos: MP4, MOV up to 50 MB.
- **Live status**: queued, processing, finalizing, then the result, with an elapsed timer. The job id is in the URL (`?t=`), so a refresh or a shared link restores it.
- **Cost**: the estimate before submitting, and what Magic Hour actually charged once it did.
- **History** (`/history`): every transformation for this browser, filterable by kind, with a details sheet (status, source and result URLs, all parameters, timestamps, cost). Active entries update live.
- **Error handling** for every failure the user can hit (wrong type, too large, provider rejected, out of credits, timeout, network), each with a specific next step.
- Accessible (Lighthouse Accessibility 100 on every page), light and dark themes, works at phone width.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Route Handlers, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui on Radix, lucide icons, sonner |
| Client data | TanStack Query (polling, history pagination), react-hook-form |
| Validation | zod 4, shared by client and server (`src/schemas`) |
| Database | MongoDB Atlas via the native driver |
| Media | Uploadcare (upload transit), Cloudinary (storage and delivery) |
| AI | Magic Hour API through its official SDK (`magic-hour`) |
| Hosting | Vercel (functions pinned to `fra1`, next to the Atlas cluster) |
| Tooling | Biome, Vitest, lefthook, commitlint |

## Architecture

### Request flow

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant UC as Uploadcare
    participant API as Next.js API (Vercel)
    participant DB as MongoDB
    participant CL as Cloudinary
    participant MH as Magic Hour

    B->>API: GET /api/upload/signature
    API-->>B: signature, expire (30 min)
    B->>UC: upload file (signed, multipart above 10 MB)
    UC-->>B: file uuid
    B->>API: POST /api/upload (uploadcareUuid, kind)
    API->>UC: verify type, size, stored (secret key)
    API->>CL: copy from the Uploadcare CDN URL
    API->>DB: insert upload
    API->>UC: delete the transit copy (best effort)
    API-->>B: 201 upload

    B->>API: POST /api/transform (uploadId, kind, params)
    API->>DB: insert transformation (queued)
    API->>MH: create project, exactly once
    API->>DB: save project id and credits charged
    API-->>B: 202 transformation

    loop every 2.5 s while the job is active
        B->>API: GET /api/transformations/[id]
        opt at most every 15 s per job
            API->>MH: project status (reconciliation)
        end
        API-->>B: 200 transformation
    end

    MH->>API: POST /api/webhook (started, completed or errored)
    API->>API: verify signature on the raw body
    API->>DB: conditional status transition
    API-->>MH: 200, well within 10 s
    Note over API,CL: completed only, in after(), once the response is sent
    API->>CL: copy the result (public_id = transformation id)
    API->>DB: finalizing to completed, with the output URL
```

### Transformation lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued: POST /api/transform
    queued --> processing: started webhook, or reconcile sees rendering
    queued --> finalizing: completed webhook (fast images skip started)
    processing --> finalizing: completed webhook, or reconcile sees complete
    finalizing --> completed: result copied to Cloudinary
    queued --> failed: create rejected, errored webhook, reconcile sees error or canceled, no project id after 2 min
    processing --> failed: errored webhook, or reconcile sees error or canceled
    queued --> timed_out: still running 5 min (image) or 20 min (video) after submission
    processing --> timed_out: same timeout, checked by reconcile
    timed_out --> finalizing: late completed webhook, or reconcile within 24 h
    timed_out --> failed: late errored webhook, or reconcile sees error or canceled
    completed --> [*]
    failed --> [*]
```

`completed` and `failed` are final. `timed_out` is terminal for the UI (the job no longer holds one of the user's two active slots), but it is only our guess, so it can still recover. The allowed moves live in one table, `ALLOWED_TRANSITIONS` in [src/schemas/transformation.ts](src/schemas/transformation.ts), and the repository enforces it in the database query itself.

### Reliability design

- **Atomic conditional transitions.** Every status change is one `findOneAndUpdate` filtered on the current status (`transition()` in [src/server/repositories/transformations.ts](src/server/repositories/transformations.ts)). If two writers race, exactly one wins and the other gets `null` and reads the latest state. Nothing reads, decides and then writes.
- **Duplicate and out-of-order webhooks are no-ops.** A second `completed`, a `started` after `completed`, an `errored` after `completed`: each is a transition the table does not allow, so it answers 200 `{ result: "noop" }` and changes nothing. An event whose project id is not saved yet (the webhook beat the create call's response) gets a 503, so Magic Hour redelivers it.
- **Idempotent finalize.** The result is copied to Cloudinary under a deterministic `public_id`, the transformation's own id, with `overwrite: true`. A repeated or concurrent copy replaces the same asset rather than creating a second one. The move to `completed` is conditional, like every other.
- **Fast webhook acknowledgement.** Magic Hour asks for a response within 10 s, and copying a video can take minutes. The webhook therefore does only the quick part synchronously: verify, look up, move to `finalizing`, answer 200. The Cloudinary copy and the move to `completed` run in `after()` from `next/server`, within the route's `maxDuration`. If that copy fails, the job simply stays `finalizing`.
- **Reconciliation, the webhook-independent safety net.** Each status poll of an active job may ask Magic Hour for the project's status: at most once per 15 s per job, claimed atomically so parallel polls don't all call out. It finishes a `finalizing` job whose background copy failed, catches lost webhooks and cancellations (Magic Hour sends no event for those), applies the timeouts, and recovers `timed_out` jobs for 24 h. The same pass runs before rejecting a user at the two-active-jobs limit, so a dead job can't hold a slot forever. Status requests never fail because of it; errors are logged and the last known state is returned.
- **Create calls are never retried.** Magic Hour's create endpoints spend credits and take no idempotency key. After a lost response a retry could bill twice for one job, so the SDK's retries stay off and a failed submission fails the transformation. The document is written as `queued` before the call, so every submission leaves a trace.

## API

All routes return JSON with `Cache-Control: no-store`. Every error uses one envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some of the submitted values are invalid.", "details": { "params.prompt": ["Describe the change you want."] } } }
```

`code` is one of the values in [src/schemas/errors.ts](src/schemas/errors.ts). `details` appears only on field-level validation errors. Messages are safe to show and never include provider text. Browser routes identify the visitor by an anonymous `uid` cookie, which is set on first contact.

### The four endpoints from the case

| Endpoint | Request | Success | Notable errors |
| --- | --- | --- | --- |
| `POST /api/upload` | `{ uploadcareUuid, kind: "image" \| "video" }` | `201 { upload }`: id, kind, filename, mime, bytes, width, height, durationSeconds, frameRate, url (Cloudinary), createdAt | 403 `FORBIDDEN_ORIGIN`, 404 `UPLOAD_NOT_FOUND`, 409 `FILE_NOT_READY`, 413 `FILE_TOO_LARGE`, 415 `INVALID_FILE_TYPE`, 502 `STORAGE_FAILED` |
| `POST /api/transform` | `{ uploadId, kind, params }`, where params are, for images, `{ prompt, model, aspect_ratio, resolution }` and, for videos, `{ start_seconds, end_seconds, fps_resolution, art_style, model, version, prompt_type, prompt }` | `202 { transformation }`, usually `queued` | 400 `VALIDATION_FAILED`, 402 `INSUFFICIENT_CREDITS`, 403 `FORBIDDEN_ORIGIN`, 404 `UPLOAD_NOT_FOUND`, 422 `PROVIDER_REJECTED`, 429 `TOO_MANY_ACTIVE_JOBS`, 503 `PROVIDER_UNAVAILABLE` |
| `POST /api/webhook` | Magic Hour event, signed (see below) | `200 { received: true, result: "applied" \| "noop" \| "ignored", status? }` | 400 malformed, 401 `INVALID_SIGNATURE`, 413 over 1 MB, 503 retryable (Magic Hour redelivers) |
| `GET /api/history` | query `kind?`, `cursor?`, `limit?` (1–50, default 20) | `200 { items: transformation[], nextCursor }`, newest first | 400 `VALIDATION_FAILED` |

A `transformation` is `{ id, uploadId, kind, status, source, output, error, creditsCharged, params, createdAt, completedAt }`. `output` holds the Cloudinary URL and its dimensions once the job is `completed`. Provider ids, raw provider errors and storage keys are never sent.

### Additional endpoints

| Endpoint | Why it exists | Success |
| --- | --- | --- |
| `GET /api/transformations/[id]` | What the page polls. The case's endpoints can start a job and list history, but nothing returns one job's current state. This is also where reconciliation runs. | `200 { transformation }`, or 404 `NOT_FOUND` for another visitor's id |
| `GET /api/upload/signature` | Signed uploads. It returns a 30-minute Uploadcare signature, computed with the secret key, which never leaves the server. | `200 { signature, expire }` |

## Webhook setup and security

**Registration.** Magic Hour's create endpoints have no callback-URL parameter; webhooks are registered once per account in the Magic Hour Developer Hub (Webhooks), not per request. Create an endpoint with the URL `https://<your-domain>/api/webhook` and subscribe to:

`image.started`, `image.completed`, `image.errored`, `video.started`, `video.completed`, `video.errored`

Other event types (e.g. audio) are acknowledged with 200 and ignored. There is no `canceled` event; reconciliation notices cancellations. Copy the endpoint's signing secret into `MAGIC_HOUR_WEBHOOK_SECRET`.

**Verification** ([src/server/webhooks/verify-signature.ts](src/server/webhooks/verify-signature.ts), [src/server/http/webhook-handler.ts](src/server/http/webhook-handler.ts)):

1. Bodies over 1 MB are refused, by `Content-Length` first and then by actual size.
2. The raw body is read as text before any parsing; re-serialised JSON would not match the signature.
3. The expected signature is `hex(HMAC-SHA256(secret, "<timestamp>.<raw body>"))`, with the timestamp and signature taken from the `magic-hour-event-timestamp` and `magic-hour-event-signature` headers. Both headers are format-checked, and the comparison uses `crypto.timingSafeEqual`.
4. Timestamps more than 5 minutes in the past or in the future are rejected (replay window).
5. Only then is the JSON parsed and validated with zod.

Failures are logged with their error code only, never the body or headers. The route doesn't touch cookies and is exempt from the Origin check.

**Other protections.** POST routes that act on the visitor's cookie refuse a request whose `Origin` header is present and differs from `APP_URL` (403 `FORBIDDEN_ORIGIN`), and the cookie is `httpOnly`, `SameSite=Lax` and `Secure` in production. Every response carries a Content-Security-Policy (scripts, fetches and media only from this origin, Uploadcare and Cloudinary; no plugins, no framing, `form-action 'self'`), plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. The CSP's `script-src` allows `'unsafe-inline'`, because the App Router's streamed RSC payload and the theme script are inline; the nonce alternative would make every page render per request. The server logger redacts credential-like keys and never serialises SDK error objects, which carry API keys in their request data.

## Getting started

Prerequisites: Node.js 24+ and npm; accounts for MongoDB Atlas, Cloudinary, Uploadcare and Magic Hour (all have free tiers; Magic Hour jobs spend credits).

```bash
git clone https://github.com/adem-enes/ai-transform-studio.git
cd ai-transform-studio
npm install
cp .env.example .env.local      # then fill in the values, see below
npm run check:services          # verifies every credential with free, read-only calls
npm run dev                     # http://localhost:3000
```

The app checks its configuration at startup. A malformed value always stops it; a missing one stops production and only warns in development. The MongoDB indexes are created on first use.

Magic Hour cannot reach `localhost`, so to exercise the webhook locally, send one yourself with `npm run webhook:replay` (see [Scripts](#scripts)), or expose the dev server through a tunnel and register that URL. Reconciliation completes local jobs even without a webhook, from the status polls.

## Environment variables

`.env.example` lists all of them with the same notes. Server variables are read lazily at runtime, so `next build` needs only the `NEXT_PUBLIC_` one.

| Name | Used by | Where to get it |
| --- | --- | --- |
| `MONGODB_URI` | server | Atlas → Connect → Drivers. Put the database name in the path: `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/ai-transform-studio?retryWrites=true&w=majority`. A URI without one is rejected. |
| `CLOUDINARY_CLOUD_NAME` | server (also read by `next.config.ts` to scope image URLs) | Cloudinary Console → Settings → API Keys |
| `CLOUDINARY_API_KEY` | server | same page |
| `CLOUDINARY_API_SECRET` | server | same page |
| `UPLOADCARE_SECRET_KEY` | server | Uploadcare Dashboard → API keys. Verifies and deletes uploads and signs browser uploads, so "Signed uploads" can be required in the project's settings. |
| `MAGIC_HOUR_API_KEY` | server | Magic Hour Developer Hub → API Keys |
| `MAGIC_HOUR_WEBHOOK_SECRET` | server | Magic Hour Developer Hub → Webhooks, from the endpoint pointing at `/api/webhook` |
| `APP_URL` | server | This app's public origin: `http://localhost:3000` locally, `https://ai-transform-studio.vercel.app` in production. Used for the Origin check. |
| `NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY` | client, inlined at build time | Uploadcare Dashboard → API keys. On Vercel it must be set before the build. |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Vitest, all unit and route tests |
| `npm run lint` | Biome (lint and format check); `lint:fix` applies fixes |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:services` | Checks MongoDB, Cloudinary, Uploadcare and Magic Hour credentials with free, read-only calls |
| `npm run webhook:replay -- --event image.completed --project <projectId> [--url <downloadUrl>] [--base http://localhost:3000] [--bad-signature]` | Sends a correctly signed Magic Hour-style webhook to the app; `--bad-signature` expects a 401. The way to test the webhook locally: submit a job, take its project id from the Magic Hour dashboard or the logs, and replay `completed` for it. |
| `npm run e2e:image -- --file <image> [--base <url>] --spend-credits` | End-to-end image flow against a running app (signature, signed upload, `/api/upload`, `/api/transform`, polling). Spends credits (cheapest model, 640 px), so it refuses to run without `--spend-credits`. |
| `npm run cleanup:uploadcare -- [--dry-run] [--confirm]` | Deletes Uploadcare files older than an hour (abandoned uploads, failed transit deletes). Dry run unless `--confirm`. |

Git hooks (lefthook): Biome on staged files before a commit, typecheck and tests before a push, and conventional commit messages.

## Testing

```bash
npm test
```

Vitest covers:

- **Workflow** (`src/server/application`): create, upload, webhook handling, finalize and reconciliation. It runs against in-memory fakes that enforce the same transition table as the database, and covers duplicate, out-of-order and late webhooks, the deferred copy and its failure, recovery through reconciliation, timeouts, `timed_out` recovery, the active-job limit and the lost-project-id window.
- **HTTP layer**: webhook route status codes (signature, size, malformed and unknown events, 503 redelivery, acknowledgement before the copy), the error envelope, Origin check, cookie identity.
- **Security primitives**: webhook signature (tampering, re-serialised body, wrong secret, swapped timestamp, stale and future timestamps), Uploadcare upload signatures, log redaction.
- **Services and schemas**: Magic Hour error mapping, Uploadcare file checks, Cloudinary parsing, request and param schemas, history cursors.
- **Client logic**: polling hook and cache updates, file validation, error copy for every code, clip and cost maths, form resolvers, result framing.

MongoDB and the third-party APIs are not called in tests. Against real services, use `check:services` (free) and `e2e:image` (spends credits).

## Project structure

```text
src/
├── app/                      Pages and route handlers (thin: parse, identify, call the workflow)
│   ├── api/                  upload, upload/signature, transform, transformations/[id], history, webhook
│   ├── image/ video/ history/
│   └── layout.tsx page.tsx
├── features/                 UI by feature
│   ├── transform-core/       Shared transform flow: dropzone, status panel, timeline, compare view, hooks
│   ├── image-transform/      Image page, model and resolution config
│   ├── video-transform/      Video page, clip selector, art styles, cost estimate
│   └── history/              History grid, cards, details sheet
├── schemas/                  zod schemas shared by client and server: API shapes, params, statuses, error codes
├── lib/                      Client-safe code: typed API client and hooks, env, Cloudinary URL helpers
├── components/               Layout and shadcn/ui primitives
├── server/                   Server-only code
│   ├── application/          The workflow: create, upload, webhook, finalize, reconcile; timing config; test fakes
│   ├── repositories/         MongoDB access, conditional transitions
│   ├── services/             Magic Hour, Cloudinary and Uploadcare adapters
│   ├── webhooks/             Event schema and signature verification
│   ├── http/                 Response envelope, webhook handler, Origin check
│   ├── db/                   Client, collections, indexes, document schemas
│   └── identity.ts logger.ts errors.ts views.ts
scripts/                      check-services, webhook-replay, e2e-image, cleanup-uploadcare
```

The application layer takes its dependencies as a parameter (`appDeps()` in production, fakes in tests), so the whole workflow is tested without a database or network.

## Design decisions and trade-offs

- **Anonymous cookie identity instead of auth.** Each browser gets a random UUID in an `httpOnly` cookie, and every query is scoped to it. It gives per-visitor history without a sign-up flow the case doesn't ask for. The trade-off: clearing cookies loses the history, and the cookie is the only credential.
- **Uploadcare as transit, Cloudinary as the storage of record.** Uploadcare takes the browser upload directly (signed, resumable multipart, real progress), so large files never pass through a serverless function with its body-size limits. The server then copies the file into Cloudinary and deletes it from Uploadcare. Cloudinary holds sources and results with stable URLs, which Magic Hour fetches and the UI resizes on the fly (images through a custom `next/image` loader, video posters and clips through URL transformations).
- **A custom dropzone instead of the Uploadcare widget.** The page needs validation messages, previews, errors and focus handling consistent with the rest of the form, and a much smaller bundle. `@uploadcare/upload-client` does the transfer underneath.
- **The native MongoDB driver with zod instead of Mongoose.** Zod schemas already define the API; the stored documents use the same tool, and every read is parsed, so a drifted document fails loudly. The workflow depends on atomic conditional updates (`findOneAndUpdate` with a status filter), which the driver expresses directly.
- **Polling instead of WebSockets or SSE.** Vercel functions are short-lived and don't hold connections, so pushing webhook results to a browser would need a separate realtime service. A 2.5 s poll of one small document is cheap. It stops as soon as the job settles. It also drives reconciliation, which makes the system correct even when webhooks are lost.

## Known limitations

- **An unavoidable orphan window at submission.** If Magic Hour accepts a job but its response never arrives (timeout, crash), the job runs and costs credits, yet no document knows its project id. Without an idempotency key this can't be closed. The attempt is logged, and after 2 minutes reconciliation marks the transformation `failed`.
- **Costs are estimates before submission.** They come from Magic Hour's published rates (per model for images, 2 credits per rendered frame for video). The charged figure is Magic Hour's own and is corrected when the job finishes.
- **Cloudinary delivery URLs are public but unguessable.** Magic Hour needs a URL it can fetch, so sources and results are ordinary public Cloudinary assets under random or ObjectId-based names. Anyone with a link can open it.
- **Atlas network access is open to `0.0.0.0/0`.** Vercel functions have no static egress IPs on the Hobby plan. Access relies on the database user's credentials and TLS.
- **A failed background copy is recovered only on the next poll.** If the deferred Cloudinary copy after a `completed` webhook fails, the job stays `finalizing` until someone polls it (the result page or an open History page). That works as long as Magic Hour's download URL is valid, about 24 hours. A job nobody looks at within that time loses its result.
- **Preview deployments** have their own origins; with `APP_URL` set to the production URL, their uploads and submissions get 403 `FORBIDDEN_ORIGIN`. Set `APP_URL` for the Preview environment to test there.
