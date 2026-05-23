// Source of truth para tokens de color usados desde canvas API.
// Mantener sincronizado con app/globals.css.
// Canvas ignora Tailwind — necesita hex literals directamente.

export const BRAND = {
  brand:      "#7C3AED",
  brandGlow:  "#A855F7",
  brandDeep:  "#C026D3",
  brandSoft:  "#1A1230",
  bg:         "#0A0E1A",
  surface:    "#0F131F",
  surface2:   "#161B2B",
  text:       "#F8FAFC",
  textMuted:  "#94A3B8",
  textFaint:  "#475569",
} as const;

// Stops para createLinearGradient en canvas
export const BRAND_GRADIENT_STOPS: Array<[number, string]> = [
  [0,    BRAND.brand],
  [0.5,  BRAND.brandGlow],
  [1,    BRAND.brandDeep],
];

// Paleta de quantización para el fallback canvas (drawNeuralVideo)
export const NEURAL_PALETTE = {
  ink:       BRAND.bg,
  midtone:   BRAND.textFaint,
  highlight: BRAND.text,
  glow:      BRAND.brandGlow,
  brand:     BRAND.brand,
} as const;
