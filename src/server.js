import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isUp, MODEL } from './ollama.js';
import { pickOuting } from './outing.js';
import { fetchMap, loadMap } from './overpass.js';
import * as store from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4788;

const app = express();
app.use(express.json({ limit: '128kb' }));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).json({ error: e.message }));

app.get('/api/health', wrap(async (_req, res) => {
  const map = await loadMap(store.MAP_FILE);
  res.json({ ok: true, model: MODEL, ollama: await isUp(), map: map ? { places: map.places.length, fetched: map.fetched, radius: map.radius } : null });
}));

app.get('/api/state', wrap(async (_req, res) => {
  const map = await loadMap(store.MAP_FILE);
  const reach = await store.getReach();
  res.json({
    reach,
    stats: await store.stats(),
    recent: await store.recent(12),
    map: map ? { places: map.places.length, fetched: map.fetched } : null,
    within: map ? map.places.filter((p) => p.metres <= reach).length : 0,
  });
}));

app.post('/api/reach', wrap(async (req, res) => res.json({ reach: await store.setReach(req.body?.metres) })));

// Setup only: the one time this project touches the network.
app.post('/api/map', wrap(async (req, res) => {
  const { lat, lon, radius } = req.body || {};
  if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ error: 'lat and lon required' });
  const map = await fetchMap({ lat, lon, radius: Number(radius) || 1200, file: store.MAP_FILE });
  res.json({ places: map.places.length, fetched: map.fetched });
}));

app.post('/api/outing', wrap(async (req, res) => {
  const map = await loadMap(store.MAP_FILE);
  if (!map) return res.status(400).json({ error: 'no map yet; run the setup first' });
  const reach = await store.getReach();
  const history = await store.recent(5);
  const context = { localTime: new Date().toLocaleTimeString(), ...(req.body?.context || {}) };

  const picked = await pickOuting({ places: map.places, reach, context, history });
  if (!picked.ok) return res.status(409).json({ error: picked.reason, reach });

  const o = await store.recordOuting({ ...picked, reach });
  res.json({ ...picked, outing_id: o.id, reach });
}));

app.post('/api/outings/:id/went', wrap(async (req, res) => {
  const o = await store.recordWent(req.params.id, req.body?.went, req.body?.note);
  o ? res.json(o) : res.status(404).json({ error: 'no such outing' });
}));

app.use(express.static(join(__dirname, '..', 'public')));
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Doorstep on http://127.0.0.1:${PORT}`);
  console.log(`model: ${MODEL}`);
});
