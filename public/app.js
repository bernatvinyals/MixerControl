// Minimal, framework-free UI for editing config.json through webui.js's API.

const ACTIONS = [
  { value: 'atemProgram',      label: 'ATEM: program input', param: 'input',  feedback: 'atemProgram' },
  { value: 'atemCut',          label: 'ATEM: cut',           param: null,     feedback: null },
  { value: 'atemAuto',         label: 'ATEM: auto transition', param: null,   feedback: null },
  { value: 'atemFTB',          label: 'ATEM: fade to black', param: null,     feedback: 'atemFTB' },
  { value: 'obsScene',         label: 'OBS: switch scene',   param: 'scene',  feedback: 'obsScene' },
  { value: 'obsToggleStream',  label: 'OBS: toggle stream',  param: null,     feedback: 'obsStream' },
  { value: 'obsToggleRecord',  label: 'OBS: toggle record',  param: null,     feedback: 'obsRecord' },
  { value: 'openFolder',       label: 'Open folder',         param: 'folder', feedback: null },
  { value: 'goBack',           label: 'Go back',             param: null,     feedback: null },
];
const actionInfo = (v) => ACTIONS.find((a) => a.value === v) || ACTIONS[0];

let nextId = 1;
const state = {
  atemIp: '',
  obsUrl: '',
  obsPassword: '',
  brightness: 80,
  deckCols: 5,
  deckRows: 3,
  deckSerial: '', // '' = use whichever Stream Deck is found first
  scenes: [],        // { id, key, value }
  pages: [],         // { pid, id, keys: [ {id, index, label, color, action, input, scene, folderTarget, highlight} ] }
  activePagePid: null, // which page's keys the table below is showing/editing
  homePagePid: null,   // which page the deck opens on at startup
};

const $ = (id) => document.getElementById(id);

function activePage() {
  return state.pages.find((p) => p.pid === state.activePagePid) || state.pages[0] || null;
}

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
  if (msg) setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = 'status'; } }, 4000);
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const cfg = await res.json();

  state.atemIp = cfg.atem.ip;
  state.obsUrl = cfg.obs.url;
  state.obsPassword = cfg.obs.password;
  state.brightness = cfg.deck.brightness;
  state.deckCols = cfg.deck.cols;
  state.deckRows = cfg.deck.rows;
  state.deckSerial = cfg.deck.serialNumber || '';

  state.scenes = Object.entries(cfg.scenes).map(([key, value]) => ({ id: nextId++, key, value }));

  // Pages first (so folder keys below can resolve their target page's id to
  // our internal pid, regardless of which order pages appear in the file).
  const pageIdToPid = {};
  state.pages = Object.keys(cfg.pages).map((id) => {
    const pid = nextId++;
    pageIdToPid[id] = pid;
    return { pid, id, keys: [] };
  });

  for (const page of state.pages) {
    const raw = cfg.pages[page.id];
    page.keys = Object.entries(raw.keys || {})
      .map(([index, k]) => ({
        id: nextId++,
        index: Number(index),
        label: k.label || '',
        color: normalizeColor(k.color),
        action: k.action,
        input: k.input ?? 1,
        scene: k.scene ?? (state.scenes[0] ? state.scenes[0].key : ''),
        folderTarget: k.page && pageIdToPid[k.page] ? pageIdToPid[k.page] : null,
        highlight: !!k.feedback,
      }))
      .sort((a, b) => a.index - b.index);
  }

  state.homePagePid = pageIdToPid[cfg.homePage] || (state.pages[0] && state.pages[0].pid) || null;
  state.activePagePid = state.homePagePid;

  renderAll();
}

function normalizeColor(hex) {
  if (!hex) return '#444444';
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex.slice(1).split('').map((c) => c + c).join('');
  }
  return '#444444';
}

function renderAll() {
  $('atemIp').value = state.atemIp;
  $('obsUrl').value = state.obsUrl;
  $('obsPassword').value = state.obsPassword;
  $('brightness').value = state.brightness;
  $('brightnessVal').textContent = state.brightness;
  $('deckCols').value = state.deckCols;
  $('deckRows').value = state.deckRows;
  $('keyIndexHint').textContent =
    `Key index = row * ${state.deckCols} + col for your ${state.deckCols}×${state.deckRows} deck (0 = top-left). ` +
    `Add or remove rows to add/remove controls on this page.`;
  updateDeckSelectedLabel();
  renderScenes();
  renderPages();
  renderKeys();
}

function renderScenes() {
  const tbody = $('scenesTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const row of state.scenes) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-field="key" value="${escapeAttr(row.key)}" placeholder="scene1" /></td>
      <td><input type="text" data-field="value" value="${escapeAttr(row.value)}" placeholder="Exact OBS scene name" /></td>
      <td class="actions"><button class="danger small" data-remove>✕</button></td>
    `;
    tr.querySelector('[data-field=key]').addEventListener('input', (e) => { row.key = e.target.value; renderKeys(); });
    tr.querySelector('[data-field=value]').addEventListener('input', (e) => { row.value = e.target.value; });
    tr.querySelector('[data-remove]').addEventListener('click', () => {
      state.scenes = state.scenes.filter((r) => r.id !== row.id);
      renderScenes();
      renderKeys();
    });
    tbody.appendChild(tr);
  }
}

// ---- pages / folders --------------------------------------------------------

function renderPages() {
  const tbody = $('pagesTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const page of state.pages) {
    const tr = document.createElement('tr');
    if (page.pid === state.activePagePid) tr.classList.add('active-row');
    tr.innerHTML = `
      <td><input type="text" data-field="id" value="${escapeAttr(page.id)}" placeholder="page-id" /></td>
      <td class="narrow"><input type="radio" name="homePage" ${page.pid === state.homePagePid ? 'checked' : ''} /></td>
      <td class="narrow"><button class="small ${page.pid === state.activePagePid ? 'primary' : ''}" data-edit>${page.pid === state.activePagePid ? 'Editing' : 'Edit'}</button></td>
      <td class="actions"><button class="danger small" data-remove>✕</button></td>
    `;
    tr.querySelector('[data-field=id]').addEventListener('input', (e) => {
      page.id = e.target.value;
      renderKeys(); // folder-target dropdowns elsewhere show page ids
    });
    tr.querySelector('[name=homePage]').addEventListener('change', () => {
      state.homePagePid = page.pid;
      renderPages();
    });
    tr.querySelector('[data-edit]').addEventListener('click', () => {
      state.activePagePid = page.pid;
      renderPages();
      renderKeys();
    });
    tr.querySelector('[data-remove]').addEventListener('click', () => removePage(page.pid));
    tbody.appendChild(tr);
  }
}

function removePage(pid) {
  if (state.pages.length <= 1) {
    setStatus('at least one page is required', 'err');
    return;
  }
  if (pid === state.homePagePid) {
    setStatus('cannot delete the home page — set another page as home first', 'err');
    return;
  }
  const stillOpenedBy = state.pages.some((p) =>
    p.keys.some((k) => k.action === 'openFolder' && k.folderTarget === pid)
  );
  if (stillOpenedBy) {
    setStatus('cannot delete: a folder key elsewhere still opens this page', 'err');
    return;
  }
  state.pages = state.pages.filter((p) => p.pid !== pid);
  if (state.activePagePid === pid) state.activePagePid = state.homePagePid;
  renderAll();
}

// ---- controls (keys) on the currently-edited page ---------------------------

function renderKeys() {
  const page = activePage();
  $('editingPageLabel').textContent = 'Editing: ' + (page ? page.id.trim() || '(unnamed page)' : '(no page)');

  const tbody = $('keysTable').querySelector('tbody');
  tbody.innerHTML = '';
  if (!page) return;

  for (const row of page.keys) {
    const tr = document.createElement('tr');

    const actionOptions = ACTIONS.map(
      (a) => `<option value="${a.value}" ${a.value === row.action ? 'selected' : ''}>${a.label}</option>`
    ).join('');

    tr.innerHTML = `
      <td class="narrow"><input type="number" min="0" data-field="index" value="${row.index}" /></td>
      <td><input type="text" data-field="label" value="${escapeAttr(row.label)}" /></td>
      <td class="narrow"><input type="color" data-field="color" value="${row.color}" /></td>
      <td><select data-field="action">${actionOptions}</select></td>
      <td data-param-cell></td>
      <td class="narrow" data-highlight-cell></td>
      <td class="actions"><button class="danger small" data-remove>✕</button></td>
    `;

    // These three change what the key actually looks like, but don't call
    // renderKeys() (that would rebuild the table mid-keystroke and drop
    // focus/cursor position) -- update just the preview grid instead.
    tr.querySelector('[data-field=index]').addEventListener('input', (e) => { row.index = Number(e.target.value); renderPreview(); });
    tr.querySelector('[data-field=label]').addEventListener('input', (e) => { row.label = e.target.value; renderPreview(); });
    tr.querySelector('[data-field=color]').addEventListener('input', (e) => { row.color = e.target.value; renderPreview(); });
    tr.querySelector('[data-field=action]').addEventListener('change', (e) => {
      row.action = e.target.value;
      renderKeys();
    });
    tr.querySelector('[data-remove]').addEventListener('click', () => {
      page.keys = page.keys.filter((r) => r.id !== row.id);
      renderKeys();
    });

    renderParamCell(tr.querySelector('[data-param-cell]'), row);
    renderHighlightCell(tr.querySelector('[data-highlight-cell]'), row);

    tbody.appendChild(tr);
  }

  renderPreview();
}

// ---- live "what will the deck actually look like" preview -------------------

// Move the control at `fromIndex` to `toIndex`. If `toIndex` is already
// occupied, the two controls swap indices instead of one clobbering the
// other -- dropping a key onto an existing one should never silently
// destroy it.
function moveKey(page, fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const src = page.keys.find((k) => k.index === fromIndex);
  if (!src) return;
  const dst = page.keys.find((k) => k.index === toIndex);
  if (dst) dst.index = fromIndex;
  src.index = toIndex;
  page.keys.sort((a, b) => a.index - b.index); // keep the table below in the same order as the grid
  renderKeys();
}

function renderPreview() {
  const grid = $('deckPreview');
  const page = activePage();
  const cols = state.deckCols;
  const rows = state.deckRows;
  const total = cols * rows;

  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const byIndex = new Map();
  if (page) for (const k of page.keys) byIndex.set(k.index, k);

  grid.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const k = byIndex.get(i);
    const cell = document.createElement('div');

    if (k) {
      cell.className = 'deck-key';
      cell.style.background = k.color;
      cell.textContent = k.label;
      cell.title = `key ${i}: ${k.label || '(no label)'} — drag to move or swap`;
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        cell.classList.add('dragging');
      });
      cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
    } else {
      cell.className = 'deck-key empty';
      cell.title = `key ${i}: empty`;
    }

    // Every cell (empty or not) is a valid drop target -- dropping onto an
    // empty one moves the key there, dropping onto an occupied one swaps.
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cell.classList.add('drop-target');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drop-target');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (!page || Number.isNaN(from)) return;
      moveKey(page, from, i);
    });

    grid.appendChild(cell);
  }

  const overflow = page ? page.keys.filter((k) => k.index < 0 || k.index >= total).length : 0;
  $('deckPreviewHint').textContent = overflow
    ? `${overflow} control(s) use a key index outside the visible ${cols}×${rows} grid and aren't shown above.`
    : '';
}

function renderParamCell(cell, row) {
  const info = actionInfo(row.action);
  if (info.param === 'input') {
    cell.innerHTML = `<input type="number" min="1" value="${row.input}" />`;
    cell.querySelector('input').addEventListener('input', (e) => { row.input = Number(e.target.value); });
  } else if (info.param === 'scene') {
    const opts = state.scenes.map((s) => `<option value="${s.key}" ${s.key === row.scene ? 'selected' : ''}>${escapeAttr(s.key)}</option>`).join('');
    cell.innerHTML = state.scenes.length
      ? `<select>${opts}</select>`
      : `<span class="hint">add a scene first</span>`;
    const sel = cell.querySelector('select');
    if (sel) {
      if (!row.scene && state.scenes[0]) row.scene = state.scenes[0].key;
      sel.addEventListener('change', (e) => { row.scene = e.target.value; });
    }
  } else if (info.param === 'folder') {
    // Every page except the one currently being edited -- a folder key
    // pointing at its own page would just reopen the same screen.
    const options = state.pages.filter((p) => p.pid !== state.activePagePid);
    if (!options.length) {
      cell.innerHTML = `<span class="hint">add another page first</span>`;
      return;
    }
    if (!row.folderTarget || !options.some((p) => p.pid === row.folderTarget)) row.folderTarget = options[0].pid;
    const opts = options.map((p) => `<option value="${p.pid}" ${p.pid === row.folderTarget ? 'selected' : ''}>${escapeAttr(p.id.trim() || '(unnamed page)')}</option>`).join('');
    cell.innerHTML = `<select>${opts}</select>`;
    cell.querySelector('select').addEventListener('change', (e) => { row.folderTarget = Number(e.target.value); });
  } else {
    cell.innerHTML = `<span class="hint">—</span>`;
  }
}

function renderHighlightCell(cell, row) {
  const info = actionInfo(row.action);
  if (!info.feedback) {
    cell.innerHTML = `<span class="hint">—</span>`;
    row.highlight = false;
    return;
  }
  cell.innerHTML = `<input type="checkbox" ${row.highlight ? 'checked' : ''} />`;
  cell.querySelector('input').addEventListener('change', (e) => { row.highlight = e.target.checked; });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function findDuplicatePageIds() {
  const seen = new Set();
  const dupes = new Set();
  for (const p of state.pages) {
    const id = p.id.trim();
    if (!id) continue;
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return Array.from(dupes);
}

function buildConfigPayload() {
  const scenes = {};
  for (const s of state.scenes) {
    if (!s.key.trim()) continue;
    scenes[s.key.trim()] = s.value.trim();
  }

  const pidToPageId = {};
  for (const p of state.pages) {
    const id = p.id.trim();
    if (id) pidToPageId[p.pid] = id;
  }

  const pages = {};
  for (const p of state.pages) {
    const id = pidToPageId[p.pid];
    if (!id) continue; // dropped -- unnamed pages don't get saved
    const keys = {};
    for (const k of p.keys) {
      const info = actionInfo(k.action);
      const entry = { label: k.label.trim(), color: k.color, action: k.action };
      if (info.param === 'input') entry.input = k.input;
      if (info.param === 'scene') entry.scene = k.scene;
      if (info.param === 'folder') entry.page = pidToPageId[k.folderTarget] || '';
      if (info.feedback && k.highlight) entry.feedback = info.feedback;
      keys[String(k.index)] = entry;
    }
    pages[id] = { keys };
  }

  return {
    atem: { ip: $('atemIp').value.trim() },
    obs: { url: $('obsUrl').value.trim(), password: $('obsPassword').value },
    deck: {
      brightness: Number($('brightness').value),
      cols: Number($('deckCols').value),
      rows: Number($('deckRows').value),
      serialNumber: state.deckSerial || '',
    },
    scenes,
    pages,
    homePage: pidToPageId[state.homePagePid] || Object.keys(pages)[0] || '',
  };
}

function clientValidate(payload) {
  const errors = [];
  if (!Number.isInteger(payload.deck.cols) || payload.deck.cols < 1) errors.push('deck grid cols must be a positive whole number');
  if (!Number.isInteger(payload.deck.rows) || payload.deck.rows < 1) errors.push('deck grid rows must be a positive whole number');
  if (!payload.pages || !Object.keys(payload.pages).length) {
    errors.push('at least one named page is required');
    return errors;
  }
  for (const [pageId, page] of Object.entries(payload.pages)) {
    const seen = new Set();
    for (const idx of Object.keys(page.keys)) {
      if (seen.has(idx)) errors.push(`page "${pageId}": duplicate key index ${idx}`);
      seen.add(idx);
    }
  }
  if (!payload.homePage || !payload.pages[payload.homePage]) {
    errors.push('home page must reference an existing page');
  }
  return errors;
}

async function save() {
  const dupes = findDuplicatePageIds();
  if (dupes.length) {
    setStatus(`duplicate page id(s): ${dupes.join(', ')}`, 'err');
    return;
  }
  const payload = buildConfigPayload();
  const errors = clientValidate(payload);
  if (errors.length) {
    setStatus(errors.join('; '), 'err');
    return;
  }
  setStatus('Saving…');
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus((body.errors || [body.error]).join('; '), 'err');
      return;
    }
    setStatus('Saved — restart the service to apply', 'ok');
  } catch (e) {
    setStatus('Save failed: ' + e.message, 'err');
  }
}

async function scanForAtems() {
  const btn = $('scanBtn');
  const listEl = $('atemList');
  btn.disabled = true;
  $('scanStatus').textContent = 'Scanning network (about 4s)…';
  listEl.innerHTML = '';
  try {
    const res = await fetch('/api/atem/discover');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'scan failed');
    if (!body.devices.length) {
      $('scanStatus').textContent = 'No ATEMs found. They must be on the same network/subnet as this machine.';
    } else {
      $('scanStatus').textContent = `Found ${body.devices.length} device(s):`;
      for (const dev of body.devices) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeAttr(dev.name)} — ${dev.ip}${dev.class ? ' (' + escapeAttr(dev.class) + ')' : ''}</span>`;
        const useBtn = document.createElement('button');
        useBtn.className = 'small';
        useBtn.textContent = 'Use';
        useBtn.addEventListener('click', () => { $('atemIp').value = dev.ip; state.atemIp = dev.ip; });
        li.appendChild(useBtn);
        listEl.appendChild(li);
      }
    }
  } catch (e) {
    $('scanStatus').textContent = 'Scan failed: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

// ---- Stream Deck device selection --------------------------------------------

function updateDeckSelectedLabel() {
  $('deckSelectedLabel').textContent = state.deckSerial
    ? `Pinned to serial ${state.deckSerial}`
    : 'Auto — whichever Stream Deck is found first';
}

async function scanForDecks() {
  const btn = $('scanDeckBtn');
  const listEl = $('deckDeviceList');
  btn.disabled = true;
  $('deckScanStatus').textContent = 'Scanning USB…';
  listEl.innerHTML = '';
  try {
    const res = await fetch('/api/deck/list');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'scan failed');
    if (!body.devices.length) {
      $('deckScanStatus').textContent = 'No Stream Decks found. Check the USB connection.';
    } else {
      $('deckScanStatus').textContent = `Found ${body.devices.length} device(s):`;
      for (const dev of body.devices) {
        const li = document.createElement('li');
        const selected = !!dev.serialNumber && dev.serialNumber === state.deckSerial;
        const label = `${dev.modelName} (${dev.model})` + (dev.serialNumber ? ` — ${dev.serialNumber}` : ' — no serial number reported');
        li.innerHTML = `<span>${escapeAttr(label)}</span>`;
        const useBtn = document.createElement('button');
        useBtn.className = 'small';
        useBtn.textContent = selected ? 'Selected' : 'Use';
        useBtn.disabled = selected || !dev.serialNumber;
        if (!dev.serialNumber) useBtn.title = "this device doesn't report a serial number, so it can't be pinned reliably";
        useBtn.addEventListener('click', () => {
          state.deckSerial = dev.serialNumber;
          updateDeckSelectedLabel();
          scanForDecks(); // re-render so the newly-picked row shows as selected
        });
        li.appendChild(useBtn);
        listEl.appendChild(li);
      }
    }
  } catch (e) {
    $('deckScanStatus').textContent = 'Scan failed: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

async function testObs() {
  const statusEl = $('obsTestStatus');
  statusEl.textContent = 'Connecting…';
  try {
    const res = await fetch('/api/obs/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: $('obsUrl').value.trim(), password: $('obsPassword').value }),
    });
    const body = await res.json();
    statusEl.textContent = body.ok ? 'Connected OK ✓' : 'Failed: ' + body.error;
  } catch (e) {
    statusEl.textContent = 'Failed: ' + e.message;
  }
}

$('saveBtn').addEventListener('click', save);
$('scanBtn').addEventListener('click', scanForAtems);
$('testObsBtn').addEventListener('click', testObs);
$('scanDeckBtn').addEventListener('click', scanForDecks);
$('clearDeckSelectionBtn').addEventListener('click', () => {
  state.deckSerial = '';
  updateDeckSelectedLabel();
  scanForDecks();
});
$('brightness').addEventListener('input', (e) => { $('brightnessVal').textContent = e.target.value; });
function onDeckGridChange() {
  const cols = Math.max(1, Number($('deckCols').value) || 1);
  const rows = Math.max(1, Number($('deckRows').value) || 1);
  state.deckCols = cols;
  state.deckRows = rows;
  $('keyIndexHint').textContent =
    `Key index = row * ${cols} + col for your ${cols}×${rows} deck (0 = top-left). ` +
    `Add or remove rows to add/remove controls on this page.`;
  renderPreview();
}
$('deckCols').addEventListener('input', onDeckGridChange);
$('deckRows').addEventListener('input', onDeckGridChange);
$('addSceneBtn').addEventListener('click', () => {
  state.scenes.push({ id: nextId++, key: `scene${state.scenes.length + 1}`, value: '' });
  renderScenes();
  renderKeys();
});
$('addPageBtn').addEventListener('click', () => {
  const pid = nextId++;
  state.pages.push({
    pid,
    id: `page${state.pages.length + 1}`,
    // Seed every new page with a way back out, per the "folders need a
    // return button" requirement -- fully editable/removable afterwards,
    // this is just a sane default so a folder never dead-ends.
    keys: [{ id: nextId++, index: 0, label: 'BACK', color: '#333333', action: 'goBack', input: 1, scene: '', folderTarget: null, highlight: false }],
  });
  state.activePagePid = pid;
  renderAll();
});
$('addKeyBtn').addEventListener('click', () => {
  const page = activePage();
  if (!page) return;
  const nextIndex = page.keys.length ? Math.max(...page.keys.map((k) => k.index)) + 1 : 0;
  page.keys.push({
    id: nextId++,
    index: nextIndex,
    label: 'NEW',
    color: '#444444',
    action: 'atemProgram',
    input: 1,
    scene: state.scenes[0] ? state.scenes[0].key : '',
    folderTarget: null,
    highlight: false,
  });
  renderKeys();
});
$('togglePwBtn').addEventListener('click', () => {
  const input = $('obsPassword');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('togglePwBtn').textContent = show ? 'Hide' : 'Show';
});

// ---- service start/stop/restart --------------------------------------------

async function refreshServiceStatus() {
  try {
    const res = await fetch('/api/service/status');
    const s = await res.json();
    const badge = $('svcBadge');
    badge.textContent = s.running ? 'Running' : 'Stopped';
    badge.className = 'badge ' + (s.running ? 'running' : 'stopped');

    $('svcMode').textContent = s.mode === 'systemd' ? 'systemd (streamdeck-av.service)' : 'a supervised process';

    const detailBits = [];
    if (s.mode === 'child' && s.pid) detailBits.push(`pid ${s.pid}`);
    if (s.mode === 'systemd' && s.state) detailBits.push(s.state);
    $('svcDetail').textContent = detailBits.join(' · ');

    const logEl = $('svcLog');
    const wasAtBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4;
    logEl.textContent = (s.logs || []).join('\n');
    if (wasAtBottom) logEl.scrollTop = logEl.scrollHeight;
  } catch (e) {
    $('svcDetail').textContent = 'status unavailable: ' + e.message;
  }
}

async function serviceAction(action, btn) {
  const buttons = [$('svcStartBtn'), $('svcStopBtn'), $('svcRestartBtn')];
  buttons.forEach((b) => (b.disabled = true));
  const original = btn.textContent;
  btn.textContent = action === 'start' ? 'Starting…' : action === 'stop' ? 'Stopping…' : 'Restarting…';
  try {
    const res = await fetch(`/api/service/${action}`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok || body.ok === false) setStatus(`Service ${action} failed: ${body.error || 'unknown error'}`, 'err');
    else setStatus(`Service ${action}ed`, 'ok');
  } catch (e) {
    setStatus(`Service ${action} failed: ${e.message}`, 'err');
  } finally {
    btn.textContent = original;
    buttons.forEach((b) => (b.disabled = false));
    await refreshServiceStatus();
  }
}

$('svcStartBtn').addEventListener('click', (e) => serviceAction('start', e.target));
$('svcStopBtn').addEventListener('click', (e) => serviceAction('stop', e.target));
$('svcRestartBtn').addEventListener('click', (e) => serviceAction('restart', e.target));

refreshServiceStatus();
setInterval(refreshServiceStatus, 3000);

// Auto-scan for connected Stream Decks on load -- unlike the ATEM mDNS scan
// (a deliberate ~4s network wait, left as a manual button), USB enumeration
// is near-instant, so there's no reason to make the user click first.
loadConfig()
  .then(scanForDecks)
  .catch((e) => setStatus('Failed to load config: ' + e.message, 'err'));
