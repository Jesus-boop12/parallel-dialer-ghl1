# Orbit Studio

A Higgsfield-style AI creative studio: generate images from text, then turn any
image into a short cinematic clip by picking a camera motion preset (Crash Zoom,
Dolly In, 360 Orbit, Bullet Time, FPV Drone, Crane Up, Whip Pan, Snorricam and
more). Everything you make lands in a library you can browse, re-use and delete.

No build step. Node + Express on the back end, plain HTML/CSS/JS on the front end.

## Run locally

```bash
cd orbit-studio
npm install
npm start
# open http://localhost:4000
```

With no API keys set the app runs in **mock mode**: image prompts render as
stylised posters and video jobs become animated motion previews of the
reference image, so the whole workflow is usable offline.

## Connect the Higgsfield Cloud API

1. Copy `.env.example` to `.env`.
2. Fill in `HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_SECRET` from your Higgsfield
   platform account.
3. Set `BASE_URL` to the public URL of this server. In live mode the video
   provider fetches uploaded reference images from `BASE_URL/uploads/...`, so it
   must be reachable from the internet (Railway, Render, a tunnel, etc.).
4. Restart. The sidebar pill switches from "Mock mode" to "Live".

The adapter lives in `lib/provider-higgsfield.js`. It targets the documented
request shape (`hf-api-key` / `hf-secret` headers, `POST /v1/text2image/soul`,
`POST /v1/image2video/dop`, `GET /v1/request/{id}`, `GET /v1/motions`). Endpoint
paths and field names were written from the public docs without a live key to
verify against, so compare them with the current API reference before shipping.
`HIGGSFIELD_API_BASE` overrides the host.

## Features

- **Image**: prompt, aspect ratio (9:16, 1:1, 4:3, 16:9, 3:4), style presets
  (Cinematic, Film Noir, Anime, Y2K, Polaroid, Editorial, Cyberpunk, Vintage
  Film), 1 to 4 results per run, prompt suggestions, `Cmd/Ctrl+Enter` to run.
- **Video**: drag-and-drop, paste or browse a reference image, or send any
  generated image straight to the video tab with the Animate button. 22 camera
  motion presets with animated thumbnails, grouped by Zoom, Dolly, Orbit,
  Aerial, Pan, Character and Basic. Duration and model selectors, optional
  motion prompt.
- **Library**: all jobs with status badges, live progress, lightbox with
  per-result navigation, download, reuse prompt, delete.
- **Jobs**: polled every 2.5 s while anything is pending, persisted in
  `data/jobs.json`, capped at 500. Uploaded references and mock outputs live
  under `data/uploads` and `data/outputs` (both git-ignored).
- Responsive down to phone width with a bottom tab bar.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/config` | Mode plus motion, style, aspect, model and duration presets |
| POST | `/api/upload` | `{ dataUrl, name }` image data URL, max 12 MB |
| POST | `/api/generate/image` | `{ prompt, aspectRatio, style, count }` |
| POST | `/api/generate/video` | `{ imageUrl, motionId, model, duration, prompt }` |
| GET | `/api/jobs` | All jobs, refreshing pending ones from the provider |
| GET | `/api/jobs/:id` | One job |
| DELETE | `/api/jobs/:id` | Remove a job and its local outputs |
| GET | `/api/health` | `{ ok, mode }` |

## Tests

```bash
npm test
```

Spins the server up in mock mode on a random port and exercises config,
validation, image generation, upload, video generation and deletion.

## Deploy to Railway

The service config lives in `railway.json` (Nixpacks build, `npm start`,
health check on `/api/health`).

1. In Railway, create a new service from this GitHub repo.
2. Service settings → Source → set **Root Directory** to `orbit-studio`.
3. Variables: add `HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_SECRET` (leave them
   out to run in mock mode). Railway sets `PORT` itself.
4. Settings → Networking → Generate Domain, then add a `BASE_URL` variable
   with that `https://...` domain so live-mode video jobs can fetch uploads.
5. Optional: add a Volume mounted at `/app/data` so jobs and uploads survive
   redeploys, and set `DATA_DIR=/app/data`.
6. Deploy. The health check turns green once the server answers.
