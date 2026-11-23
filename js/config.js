// ---- Configuratie ----------------------------------------------------------

// Supabase: vul je eigen project-URL en de *anon/public* key in
// (Supabase dashboard → Project Settings → API). De anon key is publiek bedoeld;
// toegang wordt beperkt via Row Level Security (zie supabase/schema.sql).
// Laat leeg → de app werkt in "lokale modus" (localStorage).
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Beschikbare modellen (map met model.json + metadata.json + weights.bin).
// type "image" = @teachablemachine/image (ziet pixels → oogleden)
// type "pose"  = @teachablemachine/pose  (ziet enkel keypoints → geen oogleden)
// Het eerste model is de standaard.
export const MODELS = [
  { id: "v2-image", name: "v2 – image (standaard)", type: "image", url: "./model-image/" },
  { id: "v1", name: "v1 – pose", type: "pose", url: "./model/" },
];

// Labels die "geen persoon" betekenen (optionele 3e klasse in Teachable Machine)
export const LABEL_NONE = /geen|leeg|achtergrond|none|background/i;

// Klassenamen zoals in Teachable Machine
export const LABEL_OPEN = "ogen open";
export const LABEL_CLOSED = "ogen dicht";

// Spelregels
export const RULES = {
  stableMs: 600,          // voorspelling moet zo lang stabiel zijn voor ze telt
  alarmAfterMs: 3000,     // ogen langer dicht → alarm
  pointsPerInterval: 10,  // punten per volledige focusinterval
  alarmPenalty: 5,        // punten eraf bij alarm
  breakAfterSec: 20 * 60, // 20-20-20: na 20 min focus...
  breakDurationSec: 20,   // ...20 sec pauze (weg van het scherm)
  challengeEverySec: 90,  // anti-fop: elke 90 s een knipper-uitdaging
  challengeWindowSec: 8,  // tijd om de uitdaging te doen
  challengeHoldMs: 1000,  // ogen minstens 1 s dicht houden
  minKeypointScore: 0.5,  // neus + ogen moeten zichtbaar zijn
};
