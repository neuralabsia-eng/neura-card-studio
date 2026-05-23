// Strings centralizados del evento — cambiar acá impacta studio + muro + API.
// Para el próximo evento: actualizar estas constantes y NEXT_PUBLIC_EVENT_UNLOCK_AT en .env.local

export const EVENT_COPY = {
  // Branding
  brandLabel:        "NEURA.LAB",
  universityName:    "UNIV. SAN PABLO",
  eventShortName:    "TALLER · UNIV. SAN PABLO",
  eventFullName:     "Construye tu primer Agente IA desde cero",
  eventDateBadge:    "25MAY26",

  // Metadata del sitio
  pageTitle:         "Neura.Lab · AI Agent Portrait Studio",
  pageDescription:   "Construye tu primer Agente IA desde cero — Taller virtual Neura.Lab × Universidad San Pablo. Captura tu retrato neural y compártelo en el muro del evento.",

  // Studio (/)
  heroChip:          "NEURA.LAB × UNIV. SAN PABLO",
  heroTitle:         "Activa tu agente IA",
  heroSubtitle:      "Captura una selfie, genera tu retrato neural con IA y compártelo en el muro del taller.",
  statusDefault:     "Toca Activar cámara para que el navegador solicite permiso.",
  generating:        "Activando agente neural... esto puede tardar unos segundos.",
  generatingLabel:   "GENERANDO AGENTE",
  generatedSuccess:  "Retrato neural generado. Podrás generar otro en 60s.",
  cameraReady:       "Cámara lista. Centra tu cara y captura tu agente.",
  downloadFilename:  "neura-agent-card.png",

  // Muro (/muro)
  wallTitle:         "MURO DE AGENTES",
  wallSubtitle:      "TALLER · UNIV. SAN PABLO",
  wallCounterLabel:  "agentes en el muro",
  wallEmpty:         "Aún no hay agentes en el muro",
  wallEmptyHelp:     "Cuando alguien autorice compartir su retrato neural, aparecerá aquí.",
  wallConfigError:   "Falta configurar Supabase para cargar el muro.",
  wallHudLabel:      "NEURA.LAB // AGENT WALL",
  qrAlt:             "QR para generar tu retrato neural",

  // Share dialog
  shareDialogChip:   "Confirmación",
  shareDialogTitle:  "Enviar al muro",
  shareDialogBody:   "¿Autorizas compartir tu retrato neural en el muro del taller? Solo se almacena la imagen generada — tu selfie original nunca sale de tu dispositivo.",
  shareConfirm:      "Sí, enviar",
  shareCancel:       "Cancelar",
  shareSending:      "Enviando...",
  shareSuccess:      "Retrato enviado al muro. ¡Gracias por participar!",

  // Gate countdown
  gateBadge:         "NEURA.LAB · TALLER SAN PABLO",
  gateTitle:         "El taller empieza pronto",
  gateSubtitle:      "La cámara y generación de retratos se habilitarán automáticamente al iniciar el taller.",
  gateApiMessage:    "La generación estará disponible cuando inicie el evento.",

  // Footer / créditos
  footerOriginal:    "Original por",
  footerOriginalUrl: "https://erasmoh.dev",
  footerOriginalHandle: "@ErasmoHernandez",
  footerRebrand:     "Rebrand por",
  footerRebrandUrl:  "https://neuralab.lat",
  footerRebrandName: "Neura.Lab",

  // Canvas chrome
  canvasTagline:     "NEURA.LAB",
  canvasEventLabel:  "TALLER · UNIV. SAN PABLO",
} as const;
