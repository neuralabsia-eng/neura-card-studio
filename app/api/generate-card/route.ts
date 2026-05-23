import { readFile } from "node:fs/promises";
import path from "node:path";
import { isEventGateOpen } from "../../lib/event-gate";

export const runtime = "nodejs";

const DEFAULT_GATEWAY_MODEL = "google/gemini-3-pro-image";
const DEFAULT_OPENAI_MODEL = "gpt-image-1";
const MAX_IMAGE_LENGTH = 10 * 1024 * 1024;
const AI_GENERATION_COOLDOWN_MS = 60_000;
const generationCooldowns = new Map<string, number>();

const prompt = `
Transform the provided selfie into a futuristic AI agent portrait for a vertical collectible card.
Preserve the person's likeness, face shape, hair, expression, pose, and skin tone relationships — they must remain clearly recognizable.

Style: digital AI persona / neural avatar. Think holographic agent profile in a sci-fi HUD. Not anime, not Disney, not photorealistic.

Visual treatment:
- Subtle scan-line texture and faint neural network overlays around the silhouette
- Soft glowing rim light in violet (#7C3AED) and magenta (#C026D3) outlining head and shoulders
- Cool dark background fading to deep navy (#0A0E1A) with a faint hexagonal or circuit grid
- Skin retains natural midtones bathed in subtle violet ambient light
- Eyes catch a small violet highlight suggesting activation
- Optional: faint HUD tick marks or brackets framing the bust (very subtle)

Composition:
- Centered bust portrait, frontal, slight headroom
- Visible shoulders, empty lower third for a card overlay (do NOT draw text/labels there)
- Clean negative space around the silhouette

Constraints:
- Do NOT add text, logos, dates, captions, labels, borders, or other people
- Avoid yellow tones (deliberate departure from source style)
- Avoid full photorealism, painterly brushstrokes, anime, chibi, cartoon, 3D-render-clay
- Output must feel like a digital agent persona / synthetic intelligence portrait
`.trim();

type GenerateRequest = {
  imageDataUrl?: unknown;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

function getClientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "local"
  );
}

function isValidImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IMAGE_LENGTH &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)
  );
}

async function getStyleReferenceDataUrl() {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "style-reference.png"));

    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

function findDataImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const dataUrl = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/);

    if (dataUrl) {
      return dataUrl[0];
    }

    const markdownUrl = value.match(/https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp)(?:\?[^\s)"']*)?/i);

    return markdownUrl?.[0] ?? null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findDataImageUrl(item);

      if (result) {
        return result;
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.b64_json === "string") {
      return `data:image/png;base64,${record.b64_json}`;
    }

    if (typeof record.base64 === "string") {
      const mediaType = typeof record.mediaType === "string" ? record.mediaType : "image/png";

      return `data:${mediaType};base64,${record.base64}`;
    }

    if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) {
      return record.url;
    }

    if (record.image_url && typeof record.image_url === "object") {
      const imageUrl = record.image_url as Record<string, unknown>;

      if (typeof imageUrl.url === "string") {
        return imageUrl.url;
      }
    }

    for (const nested of Object.values(record)) {
      const result = findDataImageUrl(nested);

      if (result) {
        return result;
      }
    }
  }

  return null;
}

async function remoteImageToDataUrl(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not fetch generated image URL");
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);

  return response.blob();
}

async function generateWithOpenAI(imageDataUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const formData = new FormData();
  const imageBlob = await dataUrlToBlob(imageDataUrl);

  formData.append("model", process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_MODEL);
  formData.append("image", imageBlob, "selfie.png");
  formData.append("prompt", prompt);
  formData.append("size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1536");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(typeof data.error?.message === "string" ? data.error.message : "OpenAI image generation failed");
  }

  const imageUrl = findDataImageUrl(data);

  if (!imageUrl) {
    throw new Error("OpenAI did not return an image");
  }

  return imageUrl.startsWith("http") ? remoteImageToDataUrl(imageUrl) : imageUrl;
}

async function generateWithAiGateway(imageDataUrl: string) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    return null;
  }

  const styleReference = await getStyleReferenceDataUrl();
  const imageContent = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imageDataUrl } },
    ...(styleReference ? [{ type: "image_url", image_url: { url: styleReference } }] : []),
  ];
  const baseUrl = process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_GATEWAY_IMAGE_MODEL ?? DEFAULT_GATEWAY_MODEL,
      messages: [
        {
          role: "user",
          content: imageContent,
        },
      ],
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(typeof data.error?.message === "string" ? data.error.message : "AI Gateway image generation failed");
  }

  const assistantMessage = data.choices?.[0]?.message ?? data;
  const imageUrl = findDataImageUrl(assistantMessage);

  if (!imageUrl) {
    throw new Error("AI Gateway did not return an image");
  }

  return imageUrl.startsWith("http") ? remoteImageToDataUrl(imageUrl) : imageUrl;
}

export async function POST(request: Request) {
  let body: GenerateRequest;

  if (!isEventGateOpen(request)) {
    return jsonResponse(
      {
        error: "La generación estará disponible cuando inicie el taller.",
      },
      { status: 403 },
    );
  }

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return jsonResponse({ error: "Request JSON inválido." }, { status: 400 });
  }

  if (!isValidImageDataUrl(body.imageDataUrl)) {
    return jsonResponse({ error: "La imagen enviada no es válida o es demasiado grande." }, { status: 400 });
  }

  const clientKey = getClientKey(request);
  const cooldownUntil = generationCooldowns.get(clientKey) ?? 0;

  if (Date.now() < cooldownUntil) {
    return jsonResponse(
      {
        error: `Podrás generar otra imagen en ${Math.ceil((cooldownUntil - Date.now()) / 1000)}s.`,
      },
      { status: 429 },
    );
  }

  try {
    const imageDataUrl = (await generateWithAiGateway(body.imageDataUrl)) ?? (await generateWithOpenAI(body.imageDataUrl));

    if (!imageDataUrl) {
      return jsonResponse(
        {
          configured: false,
          error:
            "Falta configurar AI_GATEWAY_API_KEY para Vercel AI Gateway u OPENAI_API_KEY como alternativa. La card base sigue disponible.",
        },
        { status: 501 },
      );
    }

    generationCooldowns.set(clientKey, Date.now() + AI_GENERATION_COOLDOWN_MS);

    return jsonResponse({ imageDataUrl });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "No pude generar el retrato con IA.",
      },
      { status: 502 },
    );
  }
}
