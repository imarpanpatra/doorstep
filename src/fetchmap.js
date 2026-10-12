/* One network call, once.
 *
 *   node src/fetchmap.js <lat> <lon> [radius-metres]
 *
 * After this, nothing in Doorstep touches the internet again.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fetchMap } from './overpass.js';
import { MAP_FILE } from './store.js';

const [lat, lon, radius] = process.argv.slice(2);
if (!lat || !lon) {
  console.error('usage: node src/fetchmap.js <lat> <lon> [radius-metres]');
  process.exit(2);
}

const r = Number(radius) || 1200;
console.log(`Fetching everything within ${r}m of ${lat}, ${lon} ...`);

let map;
try {
  map = await fetchMap({ lat: Number(lat), lon: Number(lon), radius: r });
} catch (e) {
  console.error(`\nCould not reach OpenStreetMap: ${e.message}`);
  console.error('Overpass is free and often busy. Wait a minute and try again.');
  process.exit(1);
}

// An empty result is a failed fetch, not an empty neighbourhood. Saving it
// would tell someone there is nowhere within reach of their door, which is
// both wrong and the single most discouraging thing this app could say.
if (!map.places.length) {
  console.error('\nOverpass returned nothing, so the map has not been saved.');
  console.error('That is almost certainly a busy server rather than an empty area.');
  console.error('Wait a minute and try again, or widen the radius.');
  process.exit(1);
}

await mkdir(dirname(MAP_FILE), { recursive: true });
await writeFile(MAP_FILE, JSON.stringify(map, null, 2));

const byKind = {};
for (const p of map.places) byKind[p.kind] = (byKind[p.kind] || 0) + 1;

console.log(`\nSaved ${map.places.length} places to ${MAP_FILE}`);
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

const near = map.places.slice(0, 6);
console.log(`\nNearest:`);
for (const p of near) console.log(`  ${String(p.metres).padStart(5)}m  ${p.name || p.kind}${p.sit ? '  (somewhere to sit)' : ''}`);

const within200 = map.places.filter((p) => p.metres <= 200).length;
console.log(`\nWithin 200m: ${within200} place${within200 === 1 ? '' : 's'}`);
if (!within200) {
  console.log('Nothing that close. Doorstep will say so plainly rather than inventing something.');
}
console.log('\nFrom here on, nothing needs the internet.');
