// Gate compartido entre photo-card-studio.tsx, /api/generate-card y /api/wall.
// Centralizado para evitar duplicación y asegurar comportamiento consistente.

const DEFAULT_EVENT_UNLOCK_AT = "2026-05-25T18:30:00-05:00"; // 25 mayo 2026 06:30 PM Perú (UTC-5)
const EVENT_UNLOCK_AT = process.env.NEXT_PUBLIC_EVENT_UNLOCK_AT ?? DEFAULT_EVENT_UNLOCK_AT;
export const DEV_UNLOCK_COOKIE = "neura_dev_unlock";

export function getEventUnlockTime(): number {
  const t = Date.parse(EVENT_UNLOCK_AT);
  return Number.isNaN(t) ? Date.parse(DEFAULT_EVENT_UNLOCK_AT) : t;
}

// Server-side: lee el header Cookie de la request
export function hasDevUnlockCookie(request: Request): boolean {
  return (
    request.headers.get("cookie")?.split("; ").some((c) => c === `${DEV_UNLOCK_COOKIE}=1`) ?? false
  );
}

export function isEventGateOpen(request: Request): boolean {
  return Date.now() >= getEventUnlockTime() || hasDevUnlockCookie(request);
}

// Client-side: lee document.cookie directamente
export function hasCookieClient(name: string): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

export function setDevUnlockCookieClient(): void {
  document.cookie = `${DEV_UNLOCK_COOKIE}=1; path=/; max-age=2592000; SameSite=Lax`;
}

export function clearDevUnlockCookieClient(): void {
  document.cookie = `${DEV_UNLOCK_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
