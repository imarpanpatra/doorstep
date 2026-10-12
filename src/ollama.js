const HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
export const MODEL = process.env.DOORSTEP_MODEL || 'gemma3:4b';

export async function isUp() {
  try {
    const r = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { up: false, reason: `HTTP ${r.status}` };
    const { models = [] } = await r.json();
    const names = models.map((m) => m.name);
    return { up: true, models: names, hasModel: names.some((n) => n.replace(/:latest$/, '') === MODEL) };
  } catch (e) {
    return { up: false, reason: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

export async function chatJSON({ system, user, timeoutMs = 90000 }) {
  const started = Date.now();
  const r = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: 'json',
      keep_alive: '15m',
      options: { temperature: 0.4, num_predict: 160, num_thread: 8, num_ctx: 4096 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const body = await r.json();
  const raw = body?.message?.content ?? '';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  return { raw, parsed, ms: Date.now() - started };
}
