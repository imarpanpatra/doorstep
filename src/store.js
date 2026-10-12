import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DATA = process.env.DOORSTEP_DATA || join(process.cwd(), 'data', 'doorstep.json');
export const MAP_FILE = process.env.DOORSTEP_MAP || join(process.cwd(), 'data', 'map.json');

const EMPTY = { reach: 200, outings: [], created: null };
let cache = null;

export async function load() {
  if (cache) return cache;
  if (!existsSync(DATA)) { cache = { ...EMPTY, created: new Date().toISOString() }; await save(); return cache; }
  try { cache = JSON.parse(await readFile(DATA, 'utf8')); } catch { cache = { ...EMPTY, created: new Date().toISOString() }; }
  cache.outings ||= [];
  cache.reach ??= 200;
  return cache;
}

export async function save() {
  await mkdir(dirname(DATA), { recursive: true });
  const tmp = `${DATA}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2));
  await rename(tmp, DATA);
}

export async function getReach() { return (await load()).reach; }

export async function setReach(metres) {
  const db = await load();
  db.reach = Math.max(20, Math.min(5000, Math.round(Number(metres) || 0)));
  await save();
  return db.reach;
}

export async function recordOuting({ place, because, reach, degraded }) {
  const db = await load();
  const o = {
    id: `o_${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    place_id: place.id,
    place: place.name || place.kind,
    metres: place.metres,
    reach,
    because,
    degraded: !!degraded,
    went: null,     // true | false, answered later
    note: null,
  };
  db.outings.unshift(o);
  if (db.outings.length > 400) db.outings.length = 400;
  await save();
  return o;
}

export async function recordWent(id, went, note) {
  const db = await load();
  const o = db.outings.find((x) => x.id === id);
  if (!o) return null;
  o.went = !!went;
  if (typeof note === 'string') o.note = note.slice(0, 200);
  await save();
  return o;
}

export async function recent(n = 30) { return (await load()).outings.slice(0, n); }

/* Deliberately NOT a streak.
 *
 * Streaks punish bad days, and bad days are not a failure of will here, they
 * are the condition. What this counts instead is how often going out happened
 * at all, over a window long enough that one hard week does not erase it.
 */
export async function stats() {
  const db = await load();
  const answered = db.outings.filter((o) => o.went !== null);
  const went = answered.filter((o) => o.went);
  const last30 = db.outings.filter((o) => Date.now() - new Date(o.at) < 30 * 864e5);
  const reaches = last30.filter((o) => o.went).map((o) => o.reach);
  return {
    reach: db.reach,
    suggested: db.outings.length,
    went: went.length,
    daysOut30: new Set(last30.filter((o) => o.went).map((o) => o.at.slice(0, 10))).size,
    usualReach: reaches.length ? Math.round(reaches.reduce((a, b) => a + b, 0) / reaches.length) : null,
  };
}
