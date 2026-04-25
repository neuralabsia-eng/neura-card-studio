import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  createWallImageRecord,
  findWallImageByHash,
  listWallImages,
  shuffleWallImages,
  SupabaseWallConfigError,
  uploadWallImage,
} from "../../lib/wall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WALL_IMAGE_BYTES = 12 * 1024 * 1024;

type ShareToWallRequest = {
  imageDataUrl?: unknown;
};

type ParsedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

function parseImageDataUrl(value: unknown): ParsedImage | null {
  if (typeof value !== "string" || value.length > MAX_WALL_IMAGE_BYTES * 2) {
    return null;
  }

  const match = value.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    return null;
  }

  const format = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_WALL_IMAGE_BYTES) {
    return null;
  }

  if (format === "png") {
    return { buffer, contentType: "image/png", extension: "png" };
  }

  if (format === "webp") {
    return { buffer, contentType: "image/webp", extension: "webp" };
  }

  return { buffer, contentType: "image/jpeg", extension: "jpg" };
}

function errorResponse(error: unknown, fallback: string, status = 500) {
  if (error instanceof SupabaseWallConfigError) {
    return Response.json(
      {
        configured: false,
        error: error.message,
      },
      { status: 503 },
    );
  }

  return Response.json(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    { status },
  );
}

function hashImage(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function GET() {
  try {
    const images = shuffleWallImages(await listWallImages());

    return Response.json({ images });
  } catch (error) {
    return errorResponse(error, "No pude cargar las imágenes del muro.");
  }
}

export async function POST(request: Request) {
  let body: ShareToWallRequest;

  try {
    body = (await request.json()) as ShareToWallRequest;
  } catch {
    return Response.json({ error: "Request JSON inválido." }, { status: 400 });
  }

  const image = parseImageDataUrl(body.imageDataUrl);

  if (!image) {
    return Response.json({ error: "La imagen generada no es válida o es demasiado grande." }, { status: 400 });
  }

  try {
    const imageHash = hashImage(image.buffer);
    const existingRecord = await findWallImageByHash(imageHash);

    if (existingRecord) {
      return Response.json({ duplicate: true, image: existingRecord }, { status: 200 });
    }

    const uploaded = await uploadWallImage(image.buffer, image.contentType, image.extension);
    const record = await createWallImageRecord(uploaded.publicUrl, uploaded.path, imageHash);

    return Response.json({ duplicate: false, image: record }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "No pude enviar la imagen al muro.");
  }
}
