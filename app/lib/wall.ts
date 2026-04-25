import { Buffer } from "node:buffer";

export type WallImageRecord = {
  id: string;
  image_url: string;
  storage_path: string;
  image_hash: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseWallConfig = {
  url: string;
  apiKey: string;
  bucket: string;
};

export type SupabaseBrowserConfig = {
  url: string;
  publishableKey: string;
};

const WALL_TABLE = "wall_images";
const DEFAULT_WALL_BUCKET = "wall-images";

export class SupabaseWallConfigError extends Error {
  constructor() {
    super("Falta configurar SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY.");
    this.name = "SupabaseWallConfigError";
  }
}

function getSupabaseWallConfig(): SupabaseWallConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !apiKey) {
    throw new SupabaseWallConfigError();
  }

  return {
    url,
    apiKey,
    bucket: process.env.SUPABASE_WALL_BUCKET ?? DEFAULT_WALL_BUCKET,
  };
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
  };
}

function getAuthHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function assertWallImageRecord(value: unknown): WallImageRecord {
  const record = value as Partial<WallImageRecord>;

  if (
    typeof record.id !== "string" ||
    typeof record.image_url !== "string" ||
    typeof record.storage_path !== "string" ||
    (typeof record.image_hash !== "string" && record.image_hash !== null) ||
    typeof record.created_at !== "string" ||
    typeof record.updated_at !== "string"
  ) {
    throw new Error("Supabase respondió con un registro inválido.");
  }

  return record as WallImageRecord;
}

function assertWallImageRecords(value: unknown): WallImageRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Supabase respondió con una lista inválida.");
  }

  return value.map(assertWallImageRecord);
}

async function readSupabaseError(response: Response) {
  const text = await response.text();

  try {
    const data = JSON.parse(text) as { message?: string; error?: string };

    return data.message ?? data.error ?? text;
  } catch {
    return text;
  }
}

export async function listWallImages() {
  const { url, apiKey } = getSupabaseWallConfig();
  const searchParams = new URLSearchParams({
    select: "id,image_url,storage_path,image_hash,created_at,updated_at",
    order: "updated_at.desc",
  });
  const response = await fetch(`${url}/rest/v1/${WALL_TABLE}?${searchParams}`, {
    headers: getAuthHeaders(apiKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  return assertWallImageRecords(await response.json());
}

export async function findWallImageByHash(imageHash: string) {
  const { url, apiKey } = getSupabaseWallConfig();
  const searchParams = new URLSearchParams({
    select: "id,image_url,storage_path,image_hash,created_at,updated_at",
    image_hash: `eq.${imageHash}`,
    limit: "1",
  });
  const response = await fetch(`${url}/rest/v1/${WALL_TABLE}?${searchParams}`, {
    headers: getAuthHeaders(apiKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const records = assertWallImageRecords(await response.json());

  return records[0] ?? null;
}

export async function uploadWallImage(buffer: Buffer, contentType: string, extension: string) {
  const { url, apiKey, bucket } = getSupabaseWallConfig();
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const encodedPath = encodeStoragePath(storagePath);
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(apiKey),
      "Content-Type": contentType,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  return {
    path: storagePath,
    publicUrl: `${url}/storage/v1/object/public/${bucket}/${encodedPath}`,
  };
}

export async function createWallImageRecord(imageUrl: string, storagePath: string, imageHash: string) {
  const { url, apiKey } = getSupabaseWallConfig();
  const response = await fetch(`${url}/rest/v1/${WALL_TABLE}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(apiKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      storage_path: storagePath,
      image_hash: imageHash,
    }),
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const data = await response.json();

  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Supabase no devolvió el registro creado.");
  }

  return assertWallImageRecord(data[0]);
}

export function shuffleWallImages(images: WallImageRecord[]) {
  const shuffled = [...images];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}
