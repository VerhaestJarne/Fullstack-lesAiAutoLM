// ---- Configuratie ----------------------------------------------------------

// Supabase: vul je eigen project-URL en de *anon/public* key in
// (Supabase dashboard → Project Settings → API). De anon key is publiek bedoeld;
// toegang wordt beperkt via Row Level Security (zie supabase/schema.sql).
// Laat leeg → de app werkt in "lokale modus" (localStorage).
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Beschikbare modellen (map met model.json + metadata.json + weights.bin).
// Voeg een tweede getraind model toe (bv. models/v2/) om ze te vergelijken.
export const MODELS = [
  { id: "v1", name: "v1 – eigen dataset", url: "./model/" },
  // { id: "v2", name: "v2 – meer licht/variatie", url: "./model-v2/" },
];

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
