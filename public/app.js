const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const api = async (m, p, b) => {
  const r = await fetch('/api' + p, {
    method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `${p} ${r.status}`), { body: j });
  return j;
};

let state = null;

async function refresh() {
  try { state = await api('GET', '/state'); }
  catch (e) { $('#within').textContent = 'Cannot reach Doorstep: ' + e.message; return; }

  $('#reach').value = state.reach;
  $('#reachNum').textContent = state.reach;
  paintWithin();

  const s = state.stats;
  $('#stats').innerHTML =
    `<div><b>${s.daysOut30}</b>days out, last 30</div>` +
    `<div><b>${s.went}</b>times you went</div>` +
    (s.usualReach ? `<div><b>${s.usualReach}m</b>usual, when you go</div>` : '');

  $('#recent').innerHTML = state.recent.map((o) => {
    const d = new Date(o.at);
    const when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const mark = o.went === true ? '<span class="yes">went</span>'
      : o.went === false ? '<span class="no">stayed in</span>' : '<span class="no">&mdash;</span>';
    return `<li><span>${esc(o.place)} <span class="when">&middot; ${o.metres}m</span></span>
      <span class="when">${when} &nbsp; ${mark}</span></li>`;
  }).join('') || '<li class="when" style="border:0">Nothing yet.</li>';

  const open = state.recent.find((o) => o.went === null);
  $('#pendingWrap').hidden = !open;
  if (open) {
    $('#pending').innerHTML =
      `<p class="place" style="font-size:19px">${esc(open.place)}</p>
       <p class="dist">${open.metres}m &middot; ${new Date(open.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
       <div class="actions">
         <button class="ghost" data-went="${open.id}" data-v="1">I went</button>
         <button class="ghost" data-went="${open.id}" data-v="0">Not today</button>
       </div>`;
  }
}

function paintWithin() {
  const r = Number($('#reach').value);
  if (!state?.map) { $('#within').textContent = 'No map downloaded yet.'; return; }
  // Recomputed client-side so the slider answers instantly, with no round trip.
  $('#within').textContent = `${state.map.places} places downloaded around you.`;
}

$('#reach').addEventListener('input', () => {
  $('#reachNum').textContent = $('#reach').value;
});
$('#reach').addEventListener('change', async () => {
  await api('POST', '/reach', { metres: Number($('#reach').value) });
  refresh();
});

$('#go').addEventListener('click', async () => {
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Looking…';
  const box = $('#result');
  box.hidden = false;
  box.innerHTML = '<p class="hint" style="margin:0">Thinking. The first one after a restart takes a minute.</p>';

  try {
    const v = await api('POST', '/outing', {});
    box.innerHTML =
      `<p class="place">${esc(v.place.name || v.place.kind)}</p>
       <p class="dist">${v.place.metres} metres${v.place.sit ? ' &middot; somewhere to sit' : ''}${v.place.shade ? ' &middot; shaded' : ''}</p>
       <p class="because">${esc(v.because)}</p>
       ${v.degraded ? '<p class="note">The model was unreachable, so this is simply the nearest place to sit.</p>' : ''}
       <div class="actions">
         <button class="ghost" data-went="${v.outing_id}" data-v="1">I went</button>
         <button class="ghost" data-went="${v.outing_id}" data-v="0">Not today</button>
       </div>`;
  } catch (e) {
    // The honest answer, which matters more than a graceful one. Inventing a
    // destination for someone who cannot walk far is the worst thing this
    // could do.
    const reach = state?.reach ?? Number($('#reach').value);
    box.innerHTML = e.body?.error === 'nothing within reach'
      ? `<p class="nothing">There is <b>nothing mapped within ${reach} metres</b> of you today.</p>
         <p class="note">That is the map being thin here, not you. OpenStreetMap knows very few
         benches and trees in most of India. Widen the slider a little, or try again tomorrow.</p>`
      : `<p class="nothing">Could not pick anywhere: ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Find me somewhere';
    refresh();
  }
});

document.addEventListener('click', async (e) => {
  const id = e.target.dataset?.went;
  if (!id) return;
  await api('POST', `/outings/${id}/went`, { went: e.target.dataset.v === '1' });
  refresh();
});

refresh();
