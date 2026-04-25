import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const DEFAULT_GATEWAY_MODEL = "google/gemini-3-pro-image";
const DEFAULT_OPENAI_MODEL = "gpt-image-1";
const MAX_IMAGE_LENGTH = 10 * 1024 * 1024;
const AI_GENERATION_COOLDOWN_MS = 60_000;
const DEFAULT_EVENT_UNLOCK_AT = "2026-04-30T00:00:00-04:00";
const EVENT_UNLOCK_AT = process.env.NEXT_PUBLIC_EVENT_UNLOCK_AT ?? DEFAULT_EVENT_UNLOCK_AT;
const DEV_UNLOCK_COOKIE = "js_chile_dev_unlock";
const generationCooldowns = new Map<string, number>();

const prompt = `
Transform the provided selfie into a premium 16-bit pixel portrait for a vertical collectible trading card.
Preserve the person's likeness, face shape, hair, expression, pose, skin tone relationships, and main identifying features.
The output must look like intentionally hand-crafted 16-bit pixel art, not a filtered photograph.
Use chunky pixel shapes, crisp stair-stepped edges, simplified facial features, graphic clusters of light and shadow, and controlled dithering.
Use a constrained JavaScript-inspired palette: black, white, warm gray, dark gray, and JavaScript yellow #f7df1e.
Make it a centered bust portrait with a clean simple background, strong silhouette, enough headroom, visible shoulders, and empty lower space for an event overlay.
Do not add text, logos, dates, captions, labels, borders, or extra people.
Avoid photorealism, smooth gradients, painterly brush strokes, anime style, 3D render, and realistic camera blur.
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

function getEventUnlockTime() {
  const configuredTime = Date.parse(EVENT_UNLOCK_AT);

  return Number.isNaN(configuredTime) ? Date.parse(DEFAULT_EVENT_UNLOCK_AT) : configuredTime;
}

function hasDevUnlockCookie(request: Request) {
  return request.headers.get("cookie")?.split("; ").some((cookie) => cookie === `${DEV_UNLOCK_COOKIE}=1`) ?? false;
}

function isEventGateOpen(request: Request) {
  return Date.now() >= getEventUnlockTime() || hasDevUnlockCookie(request);
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
        error: "La generación estará disponible el 30 de abril.",
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
