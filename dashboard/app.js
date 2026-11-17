// Token Radar dashboard: static page, no network. Reads window.RADAR from the
// data.js this program's main.ts writes beside the page, then renders the board,
// a detail view for every protocol, filters, sorting, a live-token view, a
// set-aside view and a model sandbox that re-ranks the page (not board.json).
'use strict';

const data = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  return money(n);
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let view = 'board';
let selectedSlug = null;

if (!data || !Array.isArray(data.rows)) {
  $('meta').textContent = 'No radar data found: open this page from the output of main.ts, where data.js sits beside dashboard/.';
  $('rows').innerHTML = '<tr><td colspan="8" class="empty">No data.</td></tr>';
} else {
  init();
}

function init() {
  const m = data.model;
  $('meta').textContent = `Snapshot ${data.as_of} · ${data.source} · watchlist floor ${money(data.floor_usd)} · ${data.rows.length} ranked rows`;
  $('method-text').innerHTML =
    `Implied value = TVL × <code>${m.base_multiple}</code> × (1 + clamped 7-day growth × <code>${m.growth_weight}</code>) × maturity ` +
    `(0.55–1.00 over ${m.maturity_days} days with no token) × chain spread (up to ×${(1 + m.chain_max_extra * m.chain_step).toFixed(2)}). ` +
    `Only protocols that record no token and are not a wrapped, staked or bridged product are ranked. ` +
    `Live-token protocols are shown at their market cap instead, never as an implied launch value.`;

  const watchlist = data.rows.filter((r) => r.on_watchlist).length;
  const totalImplied = data.rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const median = data.rows.slice().sort((a, b) => a.implied_value_usd - b.implied_value_usd)[Math.floor(data.rows.length / 2)];
  $('stats').innerHTML = [
    [data.rows.length, 'protocols ranked'],
    [watchlist + ' of ' + data.watchlist_size, 'watchlist covered'],
    [moneyShort(totalImplied), 'combined implied value'],
    [median ? moneyShort(median.implied_value_usd) : '—', 'median implied value'],
    [data.live_size, 'live tokens set aside'],
    [data.set_aside_size, 'wrapped / staked set aside'],
  ].map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');

  const chains = [...new Set(data.rows.flatMap((r) => r.chains))].sort();
  const cats = [...new Set(data.rows.map((r) => r.category || 'Uncategorised'))].sort();
  for (const c of chains) $('chain').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);
  for (const c of cats) $('category').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);

  $('base-out').textContent = m.base_multiple.toFixed(2);
  $('growth-out').textContent = m.growth_weight.toFixed(2);
  $('base-slider').addEventListener('input', onSandbox);
  $('growth-slider').addEventListener('input', onSandbox);
  $('reset-model').addEventListener('click', () => {
    $('base-slider').value = m.base_multiple;
    $('growth-slider').value = m.growth_weight;
    onSandbox();
  });

  for (const id of ['q', 'chain', 'category', 'list', 'sort', 'min-tvl']) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  }
  $('view-board').addEventListener('click', () => setView('board'));
  $('view-live').addEventListener('click', () => setView('live'));
  $('view-setaside').addEventListener('click', () => setView('setaside'));
  render();
}

function onSandbox() {
  $('base-out').textContent = Number($('base-slider').value).toFixed(2);
  $('growth-out').textContent = Number($('growth-slider').value).toFixed(2);
  render();
}

/** The sandbox's implied value for one board row, from its own figures. */
function sandboxImplied(r) {
  const base = Number($('base-slider').value);
  const gw = Number($('growth-slider').value);
  const growthMult = 1 + (r.model.growth_pct / 100) * gw;
  return Math.max(1, Math.round(r.tvl_usd * base * growthMult * r.model.maturity_multiplier * r.model.chain_multiplier));
}

function setView(v) {
  view = v;
  selectedSlug = null;
  $('detail').hidden = true;
  for (const [id, name] of [['view-board', 'board'], ['view-live', 'live'], ['view-setaside', 'setaside']]) {
    $(id).classList.toggle('active', name === v);
  }
  render();
}

function filteredBoard() {
  const q = $('q').value.trim().toLowerCase();
  const chain = $('chain').value;
  const cat = $('category').value;
  const list = $('list').value;
  const minTvl = $('min-tvl').checked;
  let rows = data.rows.map((r) => ({ ...r, implied_shown: sandboxImplied(r) }));
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  if (chain) rows = rows.filter((r) => r.chains.includes(chain));
  if (cat) rows = rows.filter((r) => (r.category || 'Uncategorised') === cat);
  if (list === 'watchlist') rows = rows.filter((r) => r.on_watchlist);
  if (list === 'early') rows = rows.filter((r) => !r.on_watchlist);
  if (minTvl) rows = rows.filter((r) => r.tvl_usd >= 100_000_000);
  const sort = $('sort').value;
  const by = {
    implied: (a, b) => b.implied_shown - a.implied_shown,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[sort];
  return rows.sort(by || ((a, b) => a.rank - b.rank));
}

function growthCell(v) {
  if (v === null || v === undefined) return '<td class="num">—</td>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return `<td class="num ${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
}

function render() {
  const head = document.querySelector('#board-table thead tr');
  const body = $('rows');
  if (view === 'live') {
    head.innerHTML = '<th>Protocol</th><th>Chains</th><th>Category</th><th>TVL</th><th>7d</th><th>Market cap</th><th>Why it is here</th>';
    const q = $('q').value.trim().toLowerCase();
    let rows = data.live.filter((r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q));
    $('count').textContent = `${rows.length} live-token protocols — their tokens already trade, so the board shows the market's own value, not an implied launch value.`;
    body.innerHTML = rows.map((r) => `<tr data-slug="${esc(r.slug)}" data-kind="live"><td class="name">${esc(r.name)}<small>${esc(r.slug)}</small></td><td>${esc(r.chains.join(', '))}</td><td>${esc(r.category || '—')}</td><td class="num">${moneyShort(r.tvl_usd)}</td>${growthCell(r.change_7d)}<td class="num">${r.mcap_usd === null ? '—' : moneyShort(r.mcap_usd)}</td><td>Token live</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing matches.</td></tr>';
  } else if (view === 'setaside') {
    head.innerHTML = '<th>Protocol</th><th>Category</th><th>TVL</th><th>Status</th><th>Reason not ranked</th>';
    const q = $('q').value.trim().toLowerCase();
    let rows = data.set_aside.filter((r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q));
    $('count').textContent = `${rows.length} protocols set aside — the board ranks only pre-token protocols that are not a wrapped, staked or bridged product of a token that already trades.`;
    body.innerHTML = rows.map((r) => `<tr data-slug="${esc(r.slug)}" data-kind="setaside"><td class="name">${esc(r.name)}<small>${esc(r.slug)}</small></td><td>${esc(r.category || '—')}</td><td class="num">${moneyShort(r.tvl_usd)}</td><td>${r.token_status === 'token-live' ? 'Token live' : 'Wrapped / staked'}</td><td>${esc(r.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing matches.</td></tr>';
  } else {
    head.innerHTML = '<th>#</th><th>Protocol</th><th>Chains</th><th>Category</th><th>TVL</th><th>7d</th><th>Age</th><th>Implied value</th>';
    const rows = filteredBoard();
    $('count').textContent = `${rows.length} of ${data.rows.length} ranked protocols shown. Click a row for its detail view and farm plan.`;
    body.innerHTML = rows.map((r, i) => `<tr data-slug="${esc(r.slug)}" data-kind="board" class="${r.slug === selectedSlug ? 'selected' : ''}"><td class="num">${i + 1}</td><td class="name">${esc(r.name)}${r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<small>${esc(r.slug)} · rank ${r.rank}</small></td><td>${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</td><td>${esc(r.category || '—')}</td><td class="num">${moneyShort(r.tvl_usd)}</td>${growthCell(r.change_7d)}<td class="num">${r.age_days === null ? '—' : r.age_days + 'd'}</td><td class="num"><b>${moneyShort(r.implied_shown)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nothing matches these filters.</td></tr>';
  }
  body.querySelectorAll('tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => showDetail(tr.dataset.slug, tr.dataset.kind)));
}

function showDetail(slug, kind) {
  selectedSlug = slug;
  const el = $('detail');
  if (kind === 'board') {
    const r = data.rows.find((x) => x.slug === slug);
    if (!r) return;
    const implied = sandboxImplied(r);
    el.innerHTML = `<button class="close" type="button" id="detail-close">Close</button>
      <h2>${esc(r.name)}${r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
      <p class="facts">${esc(r.slug)} · ${esc(r.category || 'Uncategorised')} · ${esc(r.chains.join(', ') || 'no chain listed')} · tracked since ${esc(r.listed_at || 'unknown')} · records no token.</p>
      <div class="model-grid">
        <div><b>${moneyShort(implied)}</b><span>implied launch value</span></div>
        <div><b>${moneyShort(r.tvl_usd)}</b><span>TVL</span></div>
        <div><b>${r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</b><span>TVL change, 7 days</span></div>
        <div><b>${r.age_days === null ? '—' : r.age_days + ' days'}</b><span>age with no token</span></div>
        <div><b>×${r.model.growth_multiplier.toFixed(2)}</b><span>growth multiplier</span></div>
        <div><b>×${r.model.maturity_multiplier.toFixed(2)}</b><span>maturity multiplier</span></div>
        <div><b>×${r.model.chain_multiplier.toFixed(2)}</b><span>chain-spread multiplier</span></div>
      </div>
      <h3>How to farm it — ${r.farm_steps.length} steps</h3>
      <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="warn">Rank ${r.rank} of ${data.rows.length} on the board. Implied value is this radar's own estimate from the snapshot, not a promise of a token or a price.</p>`;
  } else if (kind === 'live') {
    const r = data.live.find((x) => x.slug === slug);
    if (!r) return;
    el.innerHTML = `<button class="close" type="button" id="detail-close">Close</button>
      <h2>${esc(r.name)}</h2>
      <p class="facts">${esc(r.slug)} · ${esc(r.category || 'Uncategorised')} · ${esc(r.chains.join(', '))} · TVL ${moneyShort(r.tvl_usd)} · market cap ${r.mcap_usd === null ? 'not reported' : moneyShort(r.mcap_usd)}.</p>
      <p>Its token already trades, so there is no launch left to farm. It is listed here so the board's pre-token ranking is not mixed with live markets.</p>`;
  } else {
    const r = data.set_aside.find((x) => x.slug === slug);
    if (!r) return;
    el.innerHTML = `<button class="close" type="button" id="detail-close">Close</button>
      <h2>${esc(r.name)}</h2>
      <p class="facts">${esc(r.slug)} · ${esc(r.category || 'Uncategorised')} · TVL ${moneyShort(r.tvl_usd)}.</p>
      <p>Not ranked because: ${esc(r.reason)}. Farming it would farm a token that already exists, not a new launch.</p>`;
  }
  el.hidden = false;
  $('detail-close').addEventListener('click', () => { el.hidden = true; selectedSlug = null; render(); });
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
