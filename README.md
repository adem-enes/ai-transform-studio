# AI Transform Studio

Upload an image or a short video, describe or pick a style, and get an AI-transformed version back from the [Magic Hour API](https://docs.magichour.ai). Jobs run asynchronously: the browser uploads straight to Uploadcare, the server stores everything in Cloudinary and MongoDB, Magic Hour reports back by signed webhook, and the page polls until the result is ready. Every visitor gets a history of their transformations without signing up.

**Live:** https://ai-transform-studio.vercel.app

## Contents

- [Note on API credits](#note-on-api-credits)
- [Screenshots](#screenshots)
- [Requirements coverage](#requirements-coverage)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [How the webhook and async processing workflow operates](#how-the-webhook-and-async-processing-workflow-operates)
- [API](#api)
- [Optional enhancements (bonus)](#optional-enhancements-bonus)
- [Webhook setup and security](#webhook-setup-and-security)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Known limitations](#known-limitations)
- [Features](#features)
- [Tech stack](#tech-stack)

## Note on API credits

Video-to-video is fully implemented on `/video`, using the same upload, webhook and history pipeline as images. Image-to-image is the primary flow because video costs far more credits: a 5 s clip at a full 24 fps costs about 240 credits, while an image starts at 5. The case allows this.

> **Verified in production with real credits:** Video-to-video (a 5-second clip at half frame rate; the pre-submit estimate of ~150 credits matched the 150 credits charged) and image-to-image.

## Screenshots

<!-- Image files go in docs/screenshots/. -->
### Video to Video
| Parameter form | Processing status | Result |
| --- | --- | --- |
| ![Image-to-image page with an uploaded photo, a prompt, and the model, aspect ratio and resolution fields](docs/screenshots/parameter-form.png) | ![Status panel of a running transformation showing the queued, processing and finalizing steps with an elapsed timer](docs/screenshots/processing-status.png) | ![Finished transformation showing the original and the AI result side by side, with download and copy-link actions](docs/screenshots/result.png) |

### Image to Image

![Image result: before and after comparison slider with the prompt and model used](docs/screenshots/result_image.png)

## Requirements coverage

Each item from the case, in its order and wording, with how it is met and where it lives.

| Requirement | How it is met | Where |
| --- | --- | --- |
| **Video Input** (Uploadcare, format and size validation) | The browser uploads straight to Uploadcare with `@uploadcare/upload-client` behind a custom dropzone. Uploads are signed, multipart above 10 MB, and show real progress with a cancel button. MP4 and MOV up to 50 MB. The type and size are checked in the browser before any network call, then again on the server against Uploadcare's content-sniffed MIME type, so a renamed file is caught. The clip is at most 5 s and must end within the video. | [use-file-upload.ts](src/features/transform-core/hooks/use-file-upload.ts), [file-validation.ts](src/features/transform-core/lib/file-validation.ts), [uploadcare-file-check.ts](src/server/services/uploadcare-file-check.ts), [media.ts](src/schemas/media.ts), [clip-selector.tsx](src/features/video-transform/components/clip-selector.tsx) |
| Image input (the image equivalent) | Same path and checks. JPEG, PNG and WebP up to 10 MB, sent in a single request. | same files |
| **Parameter Selection**: image | `prompt` (up to 15,000 characters), `model` (13 values, including `default`), `aspect_ratio` (8 values, including `auto`), `resolution` (`640px`, `1k`, `2k`, `4k`, limited to what the chosen model supports) | [transform-params.ts](src/schemas/transform-params.ts), [image params-fields.tsx](src/features/image-transform/components/params-fields.tsx) |
| **Parameter Selection**: video | `start_seconds` and `end_seconds` (clip of up to 5 s), `fps_resolution` (`HALF`, `FULL`), `art_style` (all 75), `model` (8 values), `version` (`default`, `v1`, `v2`), `prompt_type` (`default`, `custom`, `append_default`), `prompt` (required unless `prompt_type` is `default`, up to 2,000 characters). A cost estimate updates as they change. | [transform-params.ts](src/schemas/transform-params.ts), [video params-fields.tsx](src/features/video-transform/components/params-fields.tsx), [cost.ts](src/features/video-transform/lib/cost.ts) |
| **Parameter Selection**: deliberately not exposed | `image_count` is fixed at 1, because each transformation stores one output.<br>`resolution: "auto"` (image) is deprecated in the SDK ("mapped server-side from your subscription tier").<br>`assets.image_file_path` (image) is deprecated in favour of `image_file_paths`, which is what the app sends.<br>`style.model` (image) is deprecated in favour of the top-level `model`.<br>`width` and `height` (video) are deprecated and no longer affect the output.<br>`name` is set by the server to `transformation <id>`, so a Magic Hour project can be traced back to its document.<br>`video_source: "youtube"` and `youtube_url` are not offered, because the case is about uploaded videos; the app always sends `file`. | [magic-hour.ts](src/server/services/magic-hour.ts), [transform-params.ts](src/schemas/transform-params.ts); SDK types in `node_modules/magic-hour/dist/types/v1-ai-image-editor-create-body*.d.ts` and `v1-video-to-video-create-body*.d.ts` |
| **History View** (Source URL, Transformation Parameters, Generated URL) | `/history` lists every transformation for this browser, newest first, filterable by kind, with "Load more" pagination. The details sheet shows the Source URL and Generated URL (each with copy and open buttons), every transformation parameter, the status, timestamps and credits. Active entries update live. | [history-details.tsx](src/features/history/components/history-details.tsx), [history-view.tsx](src/features/history/components/history-view.tsx), `GET /api/history` |
| **Error Handling**: invalid video URLs | Users upload files rather than paste URLs, so the URLs that can be invalid are the ones the server and Magic Hour fetch. There are three checks. (1) `POST /api/upload` looks up the Uploadcare file with the secret key. A malformed, unknown or deleted uuid gives 404 `UPLOAD_NOT_FOUND`; a file not yet stored gives 409 `FILE_NOT_READY`; a failed lookup gives 502 `STORAGE_FAILED`. (2) Cloudinary fetches the file from Uploadcare's URL; if it can't, the request fails with 502 `STORAGE_FAILED`. (3) Magic Hour fetches the Cloudinary URL. A rejection at submission (400 or 422) becomes 422 `PROVIDER_REJECTED`; a failure while rendering arrives as an `errored` webhook, and the job ends `failed` with `TRANSFORMATION_FAILED`. A `POST /api/transform` naming an upload that isn't the visitor's gives 404 `UPLOAD_NOT_FOUND`. | [uploadcare.ts](src/server/services/uploadcare.ts), [cloudinary.ts](src/server/services/cloudinary.ts), [magic-hour-errors.ts](src/server/services/magic-hour-errors.ts), [handle-webhook-event.ts](src/server/application/handle-webhook-event.ts) |
| **Error Handling**: incorrect formats | The browser check stops a wrong type or size before upload (`INVALID_FILE_TYPE`, `FILE_TOO_LARGE`), and the server repeats it: 415 `INVALID_FILE_TYPE`, 413 `FILE_TOO_LARGE`. Invalid parameters give 400 `VALIDATION_FAILED` with per-field `details`: a missing prompt, a clip over 5 s or past the end of the video, a resolution the model doesn't support, or a video upload submitted as an image. | [file-validation.ts](src/features/transform-core/lib/file-validation.ts), [uploadcare-file-check.ts](src/server/services/uploadcare-file-check.ts), [transform-params.ts](src/schemas/transform-params.ts), [create-transformation.ts](src/server/application/create-transformation.ts) |
| **Error Handling**: API failures | Magic Hour failures are mapped as follows. 402 becomes `INSUFFICIENT_CREDITS`, or `PLAN_UPGRADE_REQUIRED` when the plan is the problem. 400 or 422 becomes `PROVIDER_REJECTED`. 408, 429, any 5xx and no response at all become 503 `PROVIDER_UNAVAILABLE`. 401 and 403 (a wrong API key) become 500 `INTERNAL`. Create calls are never retried, and a rejected job is recorded as `failed`. Cloudinary and Uploadcare failures become `STORAGE_FAILED`. In the browser, `NETWORK_ERROR` and `UPLOAD_FAILED` cover requests that never got an answer. Every code has its own message and a next step (retry, choose another file, edit settings, open History). | [magic-hour-errors.ts](src/server/services/magic-hour-errors.ts), [errors.ts](src/schemas/errors.ts), [error-presentation.ts](src/features/transform-core/lib/error-presentation.ts) |
| **Error Handling**: webhook timeouts | If no final webhook arrives within 5 min (image) or 20 min (video) of submission, the job becomes `timed_out` with `WEBHOOK_TIMEOUT`. The UI says it may still finish, and the page keeps watching for 2 more minutes. Lost webhooks are covered by reconciliation: status polls ask Magic Hour directly, at most every 15 s per job. A timed-out job is still recovered for 24 h, by a late webhook or by reconciliation. | [reconcile-transformation.ts](src/server/application/reconcile-transformation.ts), [config.ts](src/server/application/config.ts), [polling.ts](src/lib/api/polling.ts) |
| **Cloud Storage Integration** | Cloudinary is the storage of record. Sources go under `ai-transform-studio/sources/<kind>`, results under `ai-transform-studio/outputs/<kind>/<transformation id>`. Both are copied by remote URL, so Cloudinary fetches the bytes and no function streams them. The Uploadcare transit copy is deleted afterwards. MongoDB stores the Cloudinary URLs, dimensions and durations. | [cloudinary.ts](src/server/services/cloudinary.ts), [upload-media.ts](src/server/application/upload-media.ts), [finalize-transformation.ts](src/server/application/finalize-transformation.ts) |
| **Magic Hour API Integration** | Through the official `magic-hour` SDK: `v1.aiImageEditor.create` and `v1.videoToVideo.create` to submit, and `v1.imageProjects.get` and `v1.videoProjects.get` for reconciliation. Create calls are fire-and-forget, with a 30 s timeout and no retries. The API has no per-request callback-URL parameter, so the webhook URL is registered once in the Magic Hour Developer Hub (see [Webhook setup](#webhook-setup-and-security)). The credits charged are recorded, and corrected when the job finishes. | [magic-hour.ts](src/server/services/magic-hour.ts), [create-transformation.ts](src/server/application/create-transformation.ts) |
| **Webhook Handling** | `POST /api/webhook` verifies an HMAC-SHA256 signature on the raw body within a 5-minute replay window, then validates the event with zod. It applies the event as a conditional status change and answers 200 quickly. The result copy runs in `after()`. Duplicate and out-of-order events change nothing, and an event for a project not saved yet gets 503 so it is redelivered. | [webhook-handler.ts](src/server/http/webhook-handler.ts), [verify-signature.ts](src/server/webhooks/verify-signature.ts), [handle-webhook-event.ts](src/server/application/handle-webhook-event.ts); [how it works](#how-the-webhook-and-async-processing-workflow-operates) |
| **UI/UX**: responsive, loading states, mobile-friendly | Layouts go from two columns to one at phone width; the History grid goes from three columns to two to one. Loading states: skeletons while a page or History loads, an upload progress bar with cancel, and a status timeline (queued, processing, finalizing, done) with an elapsed timer. Changes are announced through live regions. Mobile Lighthouse scores Accessibility 100 on every page. Light and dark themes. | [status-timeline.tsx](src/features/transform-core/components/status-timeline.tsx), [file-dropzone.tsx](src/features/transform-core/components/file-dropzone.tsx), [history-view.tsx](src/features/history/components/history-view.tsx) |
| **API endpoints**: the four required | `POST /api/upload`, `POST /api/transform`, `POST /api/webhook`, `GET /api/history`, plus two supporting endpoints (`GET /api/transformations/[id]`, `GET /api/upload/signature`) | [src/app/api/](src/app/api/); [API](#api) |
| **Documentation** | This README | — |
| **Deployment** | Vercel, with functions in `fra1` next to the Atlas cluster. Live at https://ai-transform-studio.vercel.app | [vercel.json](vercel.json) |
| **Bonus**: performance optimization | Uploads, API calls and retrieval, with measured Lighthouse scores and bundle sizes | [Performance optimization](#performance-optimization) |
| **Bonus**: security best practices | Webhook signature validation, Origin check, signed uploads, CSP, log redaction and more | [Security best practices](#security-best-practices) |

## Running locally

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

The three services the case names come first: Magic Hour (`MAGIC_HOUR_*`), Cloudinary (`CLOUDINARY_*`) and MongoDB (`MONGODB_URI`). Uploadcare and the app's own origin follow.

| Name | Used by | Where to get it |
| --- | --- | --- |
| `MAGIC_HOUR_API_KEY` | server | Magic Hour Developer Hub → API Keys |
| `MAGIC_HOUR_WEBHOOK_SECRET` | server | Magic Hour Developer Hub → Webhooks, from the endpoint pointing at `/api/webhook` |
| `CLOUDINARY_CLOUD_NAME` | server (also read by `next.config.ts` to scope image URLs) | Cloudinary Console → Settings → API Keys |
| `CLOUDINARY_API_KEY` | server | same page |
| `CLOUDINARY_API_SECRET` | server | same page |
| `MONGODB_URI` | server | Atlas → Connect → Drivers. Put the database name in the path: `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/ai-transform-studio?retryWrites=true&w=majority`. A URI without one is rejected. |
| `UPLOADCARE_SECRET_KEY` | server | Uploadcare Dashboard → API keys. Verifies and deletes uploads and signs browser uploads, so "Signed uploads" can be required in the project's settings. |
| `NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY` | client, inlined at build time | Uploadcare Dashboard → API keys. On Vercel it must be set before the build. |
| `APP_URL` | server | This app's public origin: `http://localhost:3000` locally, `https://ai-transform-studio.vercel.app` in production. Used for the Origin check. |

## How the webhook and async processing workflow operates

### In plain language

1. **You choose a file.** The page checks its type and size immediately, before anything is sent.
2. **The file goes straight to Uploadcare,** an upload service, with a progress bar. It never passes through our server.
3. **Our server checks the file and keeps a copy.** It looks at the uploaded file itself instead of trusting the browser, copies it into Cloudinary, where every file is kept, and removes it from Uploadcare.
4. **You pick your settings and press Transform.** The server writes down the job as "queued" and sends it to Magic Hour, once. It answers right away; the work happens in the background.
5. **Magic Hour reports back.** When it starts the job, and again when it finishes or fails, it calls a URL on our server (the webhook) with a signed message. The server checks the signature and updates the job.
6. **The result is saved.** When the job is done, the server copies the result from Magic Hour into Cloudinary, because Magic Hour's own links expire after about a day, and marks the job completed.
7. **Meanwhile, the page keeps asking.** Every 2.5 seconds it asks the server how the job is going and shows each step with a timer. If a message from Magic Hour got lost, these check-ins also ask Magic Hour directly, so the job still finishes.
8. **You see the result** next to the original. Every job, with its settings and links, stays in History.

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

### What happens when things go wrong

- **The webhook arrives twice.** The second copy finds the job already moved on, so it changes nothing and gets a plain "OK, nothing to do" (`200 { result: "noop" }`). Every status change only applies if the job is still in the state it expects, and the result is always saved under the same name. This makes the handling *idempotent*: repeating it has no further effect.
- **The webhook never arrives.** The page's status check-ins also ask Magic Hour directly, at most once every 15 seconds per job, and apply whatever it says: finished, failed, or cancelled (Magic Hour sends no event for cancellations). This is *reconciliation*, the safety net that doesn't depend on webhooks.
- **The webhook arrives before we saved the job.** Magic Hour can be faster than our own write of its project id. The server doesn't recognise the project yet, so it answers "try again later" (503), and Magic Hour sends the event again, by which time the id is saved. Retryable 503 plus *redelivery*, with reconciliation as a backstop.
- **The job takes too long.** After 5 minutes for an image or 20 minutes for a video, the job is marked as timed out. The user is told it may still finish, and the job no longer counts against their limit of two running jobs. The *timeout* is applied during reconciliation, with the error code `WEBHOOK_TIMEOUT`.
- **The job finishes after we gave up on it.** "Timed out" is only our guess, so it isn't final. A late "completed" webhook still finishes the job, and without one, reconciliation checks with Magic Hour for up to 24 hours. `timed_out` is a *recoverable state* in the lifecycle below.
- **Copying the result fails.** The job stays in "finalizing", and the next status check-in tries the copy again from Magic Hour's download link, which stays valid for about a day. The copy overwrites the same Cloudinary asset (named after the job), so retries never leave duplicates. *Idempotent finalize*, retried by reconciliation.

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

## Optional enhancements (bonus)

### Performance optimization

**Uploads**

- Direct browser-to-Uploadcare uploads. No file passes through a serverless function, and files above 10 MB go up in parallel 5 MB parts, each retried on its own: `MULTIPART_MIN_FILE_SIZE` in [use-file-upload.ts](src/features/transform-core/hooks/use-file-upload.ts).
- Cloudinary copies by remote URL: Cloudinary fetches the file itself, so no bytes stream through our functions. `uploadFromUrl` in [cloudinary.ts](src/server/services/cloudinary.ts).
- Type and size are validated in the browser before any network call: `validateFile` in [file-validation.ts](src/features/transform-core/lib/file-validation.ts).

**API calls**

- Functions are pinned to `fra1`, next to the Atlas cluster, since every request makes several database round trips: [vercel.json](vercel.json).
- One MongoDB connection per process, reused across requests and dev reloads: [db/client.ts](src/server/db/client.ts).
- Polling pauses while the tab is hidden and stops at terminal states (with a 2-minute grace after `timed_out`): `useTransformation` in [hooks.ts](src/lib/api/hooks.ts), `shouldPoll` in [polling.ts](src/lib/api/polling.ts).
- Reconciliation is throttled to one Magic Hour status call per job per 15 s, claimed atomically so concurrent polls don't all call out: `claimReconciliation` in [transformations.ts](src/server/repositories/transformations.ts), `reconcileIntervalMs` in [config.ts](src/server/application/config.ts).
- Webhooks are acknowledged fast. The route answers after one conditional write, and the Cloudinary copy runs in `after()`: [api/webhook/route.ts](src/app/api/webhook/route.ts), [handle-webhook-event.ts](src/server/application/handle-webhook-event.ts).

**Retrieval**

- Images are resized on Cloudinary's CDN with `f_auto,q_auto` and a width per `srcset` entry (`c_limit`, never upscaled), through a custom `next/image` loader, so Vercel's image optimizer is never used: [cloudinary-loader.ts](src/lib/media/cloudinary-loader.ts), `imageUrl` in [cloudinary.ts](src/lib/media/cloudinary.ts).
- Every video player has a Cloudinary poster frame and `preload="metadata"`, so no video downloads before play: [video-player.tsx](src/features/transform-core/components/video-player.tsx), `videoPosterUrl` in [cloudinary.ts](src/lib/media/cloudinary.ts).
- History uses cursor pagination on `(createdAt, _id)`: [cursor.ts](src/server/repositories/cursor.ts). A new or updated job is written into the cached lists instead of triggering a refetch: [history-cache.ts](src/lib/api/history-cache.ts).
- Heavy components load lazily. The art-style palette and its search library (cmdk) load through `next/dynamic` and are preloaded on hover or focus: [video params-fields.tsx](src/features/video-transform/components/params-fields.tsx). zod is imported as a namespace (`import * as z`) so its ~50 locales stay out of the browser bundle.

**Measured results.** Lighthouse 12, mobile, against a local production build (`next build` then `next start`) on commit `4f8b86b`:

| Page | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| `/` | 97 | 100 | 100 | 100 |
| `/image` | 94 | 100 | 100 | 100 |
| `/video` | 93 | 100 | 100 | 100 |
| `/history` | 95 | 100 | 100 | 100 |

First-load JavaScript per route, gzipped. Next 16 no longer prints per-route sizes, so this is the sum of every `<script src>` in each prerendered page, excluding the `noModule` legacy polyfill that modern browsers skip:

| Route | First-load JS (gzip) |
| --- | --- |
| `/` | 170 KB |
| `/image` | 278 KB |
| `/video` | 287 KB |
| `/history` | 229 KB |

### Security best practices

- **Webhook signature validation.** Every webhook is verified before its body is parsed: HMAC-SHA256 over `"<timestamp>.<raw body>"` with the endpoint's signing secret, a timing-safe comparison, a 5-minute replay window and a 1 MB body limit. Details in [Webhook setup and security](#webhook-setup-and-security).
- **Origin check.** `POST /api/upload`, `POST /api/transform` and `GET /api/upload/signature` refuse a request whose `Origin` header is present and differs from `APP_URL`, with 403 `FORBIDDEN_ORIGIN`, so other sites can't ride the visitor's cookie or obtain upload signatures: [origin.ts](src/server/http/origin.ts).
- **Signed Uploadcare uploads.** The browser gets a 30-minute signature from `GET /api/upload/signature`, so the public key alone cannot store files: [uploadcare-signature.ts](src/server/services/uploadcare-signature.ts).
- **Cookie flags.** The anonymous `uid` cookie is `httpOnly`, `SameSite=Lax` and `Secure` in production: [identity.ts](src/server/identity.ts).
- **CSP and headers.** A Content-Security-Policy limits scripts, fetches and media to this origin, Uploadcare and Cloudinary, and blocks plugins and framing. It comes with `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`, and `poweredByHeader` is off: [next.config.ts](next.config.ts).
- **Secrets only on the server.** Server modules import `server-only`, and the only variable in the browser bundle is `NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY`. SDK errors, which carry API keys in their request data, are reduced to status and message before they are kept.
- **Log redaction.** The logger replaces any credential-like key (auth, secret, token, API key, cookie, signature, headers) with `[redacted]`: [logger.ts](src/server/logger.ts).
- **HTTPS everywhere.** Vercel serves every deployment over HTTPS and sets `Strict-Transport-Security`. The Cloudinary client is configured with `secure: true`, and every third-party call uses HTTPS.
- **Abuse limit.** Each visitor can have at most two jobs running at once (429 `TOO_MANY_ACTIVE_JOBS`), which caps credit spend per browser.

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
