/* The map, fetched once.
 *
 * Overpass is the only network call this project ever makes, and it happens
 * one time, during setup. After that the neighbourhood lives in a JSON file
 * and everything works with the radio off. That matters more here than it
 * looks: the people this is for are often going out alone, on a phone that
 * may not have data, and an app that needs a connection to tell them where a
 * bench is will fail them on exactly the day it is needed.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPOINT = process.env.OVERPASS || null;

// What counts as a destination when you can only go a little way. Not
// landmarks -- somewhere to sit, something alive, a bit of shade.
/* What counts as a destination when you can only go a little way.
 *
 * The obvious list -- benches, trees, drinking fountains -- is the list you
 * write if you have only ever looked at a European map. Two test fetches 300km
 * apart returned 299 places with 24 benches, and 23 places with none at all.
 * OpenStreetMap is volunteer-mapped, so its street furniture layer tracks
 * where mappers live rather than where benches are, and an app that depends on
 * mapped benches simply stops working in half the places that need it.
 *
 * So this list is what actually exists on the map here. Temples and mandirs
 * are mapped everywhere and are reliably shaded, quiet and somewhere you may
 * sit. Markets, chowks and small shops are mapped because people care about
 * them. Those are the real landmarks of a short walk.
 */
const WANTED = [
  // mapped nearly everywhere, and usually shaded and sittable
  ['amenity', 'place_of_worship', 'a temple or quiet building'],
  ['leisure', 'park', 'a park'],
  ['leisure', 'garden', 'a garden'],
  ['amenity', 'marketplace', 'a market'],
  ['leisure', 'playground', 'a playground'],
  ['leisure', 'pitch', 'a maidan or ground'],
  ['amenity', 'cafe', 'a cafe'],
  ['shop', 'convenience', 'a corner shop'],
  ['shop', 'general', 'a shop'],
  ['shop', 'bakery', 'a bakery'],
  ['tourism', 'viewpoint', 'a view'],
  ['historic', 'memorial', 'a memorial'],
  ['amenity', 'library', 'a library'],
  // the European-map list, kept because where it exists it is the best answer
  ['amenity', 'bench', 'a bench'],
  ['natural', 'tree', 'a tree'],
  ['natural', 'water', 'water'],
  ['amenity', 'drinking_water', 'drinking water'],
  ['amenity', 'shelter', 'a shelter'],
  ['amenity', 'fountain', 'a fountain'],
];

// `nwr` matches nodes, ways and relations in one statement. Writing them out
// separately doubled the query and started drawing 504s from a free service.
function query(lat, lon, radius) {
  const parts = WANTED
    .map(([k, v]) => `nwr["${k}"="${v}"](around:${radius},${lat},${lon});`)
    .join('\n  ');
  return `[out:json][timeout:60];\n(\n  ${parts}\n);\nout center tags;`;
}

// Overpass is free, volunteer-run, and frequently busy. One mirror timing out
// is normal rather than exceptional, so a failed setup should try the next one
// instead of telling the user to come back later.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

// Metres between two coordinates. Haversine, because the whole product is a
// promise about distance and "close enough" is not good enough when the cost
// of being wrong is someone in pain walking an extra hundred metres.
export function metresBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function fetchMap({ lat, lon, radius = 1200, file }) {
  const body = 'data=' + encodeURIComponent(query(lat, lon, radius));
  const endpoints = ENDPOINT ? [ENDPOINT, ...MIRRORS.filter((m) => m !== ENDPOINT)] : MIRRORS;

  let elements = null, lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          // Overpass answers 406 to anonymous clients, and it is a free service
          // run by volunteers, so identifying the caller is the price of entry.
          'user-agent': 'doorstep/0.1 (https://github.com/imarpanpatra/doorstep)',
        },
        body,
        signal: AbortSignal.timeout(75000),
      });
      if (!r.ok) { lastErr = new Error(`${new URL(url).host} -> ${r.status}`); continue; }
      const json = await r.json().catch(() => null);
      // A 200 carrying no elements array is a failed mirror, not an empty
      // neighbourhood. Treating the two as the same silently writes an empty
      // map and tells someone there is nowhere to go.
      if (!json || !Array.isArray(json.elements)) {
        lastErr = new Error(`${new URL(url).host} -> 200 but no elements`);
        continue;
      }
      elements = json.elements;
      break;
    } catch (e) {
      lastErr = new Error(`${new URL(url).host} -> ${e.message}`);
    }
  }
  if (!elements) throw new Error(`every Overpass mirror failed (${lastErr?.message})`);

  const home = { lat, lon };
  const label = new Map(WANTED.map(([k, v, human]) => [`${k}=${v}`, human]));

  const places = elements
    .map((e) => {
      const p = e.center || e;
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return null;
      const tags = e.tags || {};
      const hit = WANTED.find(([k, v]) => tags[k] === v);
      if (!hit) return null;
      return {
        id: `${e.type}/${e.id}`,
        kind: label.get(`${hit[0]}=${hit[1]}`) || 'somewhere',
        name: tags.name || null,
        lat: p.lat,
        lon: p.lon,
        metres: metresBetween(home, { lat: p.lat, lon: p.lon }),
        shade: ['tree','water'].includes(tags.natural) || ['park','garden'].includes(tags.leisure) || ['shelter','place_of_worship','library','cafe'].includes(tags.amenity),
        sit: ['bench','shelter','place_of_worship','library','cafe'].includes(tags.amenity) || ['park','garden'].includes(tags.leisure),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.metres - b.metres);

  const map = { home, radius, fetched: new Date().toISOString(), places };
  if (file) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(map, null, 2));
  }
  return map;
}

export async function loadMap(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
