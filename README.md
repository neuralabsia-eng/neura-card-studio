# JS Chile Meetup Card

Webapp móvil para capturar una selfie, convertirla en una card vertical estilo comic/pixel con paleta JavaScript y descargar el PNG final.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## AI image generation

The app works without AI keys using the local canvas fallback. To enable the higher-quality AI portrait step, add one of these server-only variables to `.env.local`:

```bash
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
AI_GATEWAY_IMAGE_MODEL=google/gemini-3-pro-image
```

Alternative provider:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1536
```

Do not prefix these variables with `NEXT_PUBLIC_`; they must stay server-side.

For mobile camera testing, use `localhost`, HTTPS, or a deployed URL. Some mobile browsers block camera access on plain HTTP LAN URLs.

## Event gate

The app is locked until the configured event date:

```bash
NEXT_PUBLIC_EVENT_UNLOCK_AT=2026-04-30T00:00:00-04:00
```

For development, open `/?dev=1` to create the `js_chile_dev_unlock=1` cookie and bypass the countdown. Use `/?dev_lock=1` to clear it.

## Verification

```bash
npm run lint
npm run build
```

## Deploy

Set the same environment variables in the deployment environment when AI generation is enabled.
