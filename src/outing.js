import { chatJSON } from './ollama.js';

/* The model is allowed to choose WHICH. It is never allowed to choose HOW FAR.
 *
 * Every fitness app treats distance as a target to beat. For someone whose
 * range is set by their body rather than their motivation, distance is a
 * ceiling, and the cost of getting it wrong is not a missed goal: it is
 * somebody stranded two streets from home.
 *
 * So the radius is enforced in code, before the model sees anything. By the
 * time it is asked, every option on the list is already safe. The worst it can
 * do is pick a dull one.
 */
const SYSTEM = `You help someone choose one short outing. They have limited mobility and today's distance is already decided: every place on the list is within their range.

Pick exactly ONE place and say why it is worth going there TODAY.

Rules:
- Never mention distance, metres, steps, pace, exercise, streaks or progress.
- Never suggest going further, trying harder, or beating yesterday.
- Never mention their health, pain, recovery or limitations.
- Write like a friend who noticed something, not a coach. One sentence, under 20 words.
- Prefer somewhere to sit, or shade, when it is hot or they went out recently.
- If they did not get out yesterday, do not refer to it at all.

Reply with JSON only:
{"place_id":"<exact id from the list>","because":"<one short sentence>"}`;

export async function pickOuting({ places, reach, context, history = [] }) {
  // The filter that matters. Nothing beyond today's reach is ever offered,
  // whatever the model would have liked to say.
  const eligible = places.filter((p) => p.metres <= reach);
  if (!eligible.length) return { ok: false, reason: 'nothing within reach' };

  // Keep the prompt small: nearest 12 is plenty, and a short list is a list a
  // 4B model actually reads.
  const shortlist = eligible.slice(0, 12);

  const recent = history.slice(0, 3).map((h) => h.place_id);
  const lines = shortlist
    .map((p) => `- (${p.id}) ${p.name ? `${p.name}, ` : ''}${p.kind}${p.sit ? ', somewhere to sit' : ''}${p.shade ? ', shaded' : ''}${recent.includes(p.id) ? ' [went here recently]' : ''}`)
    .join('\n');

  const user = `PLACES, all within reach today:
${lines}

TIME: ${context?.localTime || 'unknown'}
WEATHER: ${context?.weather || 'not known'}

Choose one.`;

  let parsed = null, ms = 0;
  try { ({ parsed, ms } = await chatJSON({ system: SYSTEM, user })); }
  catch (e) { return fallback(shortlist, 'model unreachable: ' + e.message, 0); }

  const chosen = shortlist.find((p) => p.id === parsed?.place_id);
  // A place that is not on the list is not a suggestion, it is a hallucination,
  // and acting on one would send someone somewhere that may not exist.
  if (!chosen) return fallback(shortlist, 'model named a place that was not offered', ms);

  const because = String(parsed?.because || '').trim();
  if (!because) return fallback(shortlist, 'no reason given', ms);

  return { ok: true, place: chosen, because: because.slice(0, 160), ms };
}

/* When the model fails, the app still has to work. Somebody is standing at
 * their door waiting to be told where to go, and "try again later" is not an
 * answer. Nearest place to sit, or just nearest.
 */
function fallback(shortlist, reason, ms) {
  const place = shortlist.find((p) => p.sit) || shortlist[0];
  return {
    ok: true,
    degraded: true,
    reason,
    place,
    because: place.sit ? 'Somewhere to sit, close by.' : 'The closest one today.',
    ms,
  };
}
