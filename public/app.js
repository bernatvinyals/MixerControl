// Minimal, framework-free UI for editing config.json through webui.js's API.

const ACTIONS = [
  { value: 'atemProgram',      label: 'ATEM: program input', param: 'input', feedback: 'atemProgram' },
  { value: 'atemCut',          label: 'ATEM: cut',           param: null,    feedback: null },
  { value: 'atemAuto',         label: 'ATEM: auto transition', param: null,  feedback: null },
  { value: 'atemFTB',          label: 'ATEM: fade to black', param: null,   feedback: 'atemFTB' },
  { value: 'obsScene',         label: 'OBS: switch scene',   param: 'scene', feedback: 'obsScene' },
  { value: 'obsToggleStream',  label: 'OBS: toggle stream',  param: null,   feedback: 'obsStream' },
  { value: 'obsToggleRecord',  label: 'OBS: toggle record',  param: null,   feedback: 'obsRecord' },
];
const actionInfo = (v) => ACTIONS.find((a) => a.value === v) || ACTIONS[0];

let nextId = 1;
const state = {
  atemIp: '',
  obsUrl: '',
  obsPassword: '',
  brightness: 80,
  scenes: [],  // { id, key, value }
  keys: [],    // { id, index, label, color, action, input, scene, highlight }
};

const $ = (id) => document.getElementById(id);

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

  state.scenes = Object.entries(cfg.scenes).map(([key, value]) => ({ id: nextId++, key, value }));

  state.keys = Object.entries(cfg.keys)
    .map(([index, k]) => ({
      id: nextId++,
      index: Number(index),
      label: k.label || '',
      color: normalizeColor(k.color),
      action: k.action,
      input: k.input ?? 1,
      scene: k.scene ?? (state.scenes[0] ? state.scenes[0].key : ''),
      highlight: !!k.feedback,
    }))
    .sort((a, b) => a.index - b.index);

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
  renderScenes();
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

function renderKeys() {
  const tbody = $('keysTable').querySelector('tbody');
  tbody.innerHTML = '';
  for (const row of state.keys) {
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

    tr.querySelector('[data-field=index]').addEventListener('input', (e) => { row.index = Number(e.target.value); });
    tr.querySelector('[data-field=label]').addEventListener('input', (e) => { row.label = e.target.value; });
    tr.querySelector('[data-field=color]').addEventListener('input', (e) => { row.color = e.target.value; });
    tr.querySelector('[data-field=action]').addEventListener('change', (e) => {
      row.action = e.target.value;
      renderKeys();
    });
    tr.querySelector('[data-remove]').addEventListener('click', () => {
      state.keys = state.keys.filter((r) => r.id !== row.id);
      renderKeys();
    });

    renderParamCell(tr.querySelector('[data-param-cell]'), row);
    renderHighlightCell(tr.querySelector('[data-highlight-cell]'), row);

    tbody.appendChild(tr);
  }
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

function buildConfigPayload() {
  const scenes = {};
  for (const s of state.scenes) {
    if (!s.key.trim()) continue;
    scenes[s.key.trim()] = s.value.trim();
  }

  const keys = {};
  for (const k of state.keys) {
    const info = actionInfo(k.action);
    const entry = { label: k.label.trim(), color: k.color, action: k.action };
    if (info.param === 'input') entry.input = k.input;
    if (info.param === 'scene') entry.scene = k.scene;
    if (info.feedback && k.highlight) entry.feedback = info.feedback;
    keys[String(k.index)] = entry;
  }

  return {
    atem: { ip: $('atemIp').value.trim() },
    obs: { url: $('obsUrl').value.trim(), password: $('obsPassword').value },
    deck: { brightness: Number($('brightness').value) },
    scenes,
    keys,
  };
}

function clientValidate(payload) {
  const errors = [];
  const seen = new Set();
  for (const idx of Object.keys(payload.keys)) {
    if (seen.has(idx)) errors.push(`duplicate key index ${idx}`);
    seen.add(idx);
  }
  return errors;
}

async function save() {
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
$('brightness').addEventListener('input', (e) => { $('brightnessVal').textContent = e.target.value; });
$('addSceneBtn').addEventListener('click', () => {
  state.scenes.push({ id: nextId++, key: `scene${state.scenes.length + 1}`, value: '' });
  renderScenes();
  renderKeys();
});
$('addKeyBtn').addEventListener('click', () => {
  const nextIndex = state.keys.length ? Math.max(...state.keys.map((k) => k.index)) + 1 : 0;
  state.keys.push({
    id: nextId++,
    index: nextIndex,
    label: 'NEW',
    color: '#444444',
    action: 'atemProgram',
    input: 1,
    scene: state.scenes[0] ? state.scenes[0].key : '',
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

loadConfig().catch((e) => setStatus('Failed to load config: ' + e.message, 'err'));
