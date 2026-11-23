// Opslag van sessies/scores: Supabase als het geconfigureerd is, anders localStorage.
// Er worden NOOIT beelden opgeslagen of verstuurd — enkel getallen.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const LS_KEY = "wakkerwacht.sessions";
let supabase = null;

export async function initStorage() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return "local";
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return "supabase";
  } catch (e) {
    console.warn("Supabase laden mislukt, lokale modus", e);
    return "local";
  }
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}

export async function saveSession(session) {
  if (supabase) {
    const { error } = await supabase.from("sessions").insert(session);
    if (!error) return true;
    console.error("Supabase insert", error);
  }
  try {
    const all = readLocal();
    all.push({ ...session, id: Date.now(), created_at: new Date().toISOString() });
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {}
  return !supabase;
}

// Sessies (nieuwste eerst). player = null → alle spelers; anders hoofdletterongevoelig.
export async function getSessions(player = null, n = 50) {
  if (supabase) {
    let q = supabase.from("sessions").select("*").order("created_at", { ascending: false }).limit(n);
    if (player) q = q.ilike("player", player.replace(/[%_\\]/g, "\\$&"));
    const { data, error } = await q;
    if (!error) return data;
    console.error("Supabase sessies", error);
  }
  const p = player?.toLowerCase();
  return readLocal()
    .filter((r) => !p || String(r.player).toLowerCase() === p)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, n);
}

// Top N spelers op basis van totaal aantal punten
export async function getLeaderboard(n = 10) {
  let rows = [];
  if (supabase) {
    const { data, error } = await supabase
      .from("leaderboard")
      .select("player,total_points,sessions,total_focus_sec")
      .limit(n);
    if (!error) return data;
    console.error("Supabase leaderboard", error);
  }
  rows = readLocal();
  const agg = {};
  for (const r of rows) {
    const a = (agg[r.player] ||= { player: r.player, total_points: 0, sessions: 0, total_focus_sec: 0 });
    a.total_points += r.points;
    a.sessions += 1;
    a.total_focus_sec += r.focus_sec;
  }
  return Object.values(agg).sort((a, b) => b.total_points - a.total_points).slice(0, n);
}
