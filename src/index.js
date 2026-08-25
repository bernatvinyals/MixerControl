// =============================================================================
// src/index.js — main service. Connects everything and handles key events.
// =============================================================================

const { openStreamDeck, listStreamDecks } = require('@elgato-stream-deck/node');
const config = require('../config');
const { drawKey, hasCanvas } = require('./render');
const { ObsController } = require('./obs');
const { AtemController } = require('./atem');
const { acquireLock } = require('./singleton');

let deck = null;

// Which page of controls is currently on the deck, and the trail of pages
// navigated through via 'openFolder' keys (so 'goBack' returns to wherever
// you actually came from, not always straight to the home page).
let currentPageId = config.homePage;
let pageStack = [];
const MAX_PAGE_STACK = 25; // defensive cap -- folder nesting should never realistically need more

function activePage() {
  return config.pages[currentPageId] || config.pages[config.homePage];
}

// Re-render all keys based on current ATEM + OBS state.
async function renderAll() {
  if (!deck) return;
  const fc = config.feedbackColors;

  for (const [idxStr, key] of Object.entries(activePage().keys)) {
    const idx = Number(idxStr);
    let color = key.color;

    switch (key.feedback) {
      case 'atemProgram':
        if (atem.state.programInput === key.input) color = fc.programActive;
        break;
      case 'atemFTB':
        if (atem.state.ftb) color = fc.ftbActive;
        break;
      case 'obsScene':
        if (obs.state.currentScene === config.scenes[key.scene]) color = fc.sceneActive;
        break;
      case 'obsStream':
        if (obs.state.streaming) color = fc.streaming;
        break;
      case 'obsRecord':
        if (obs.state.recording) color = fc.recording;
        break;
    }

    try {
      await drawKey(deck, idx, key.label, color);
    } catch (e) {
      console.error(`render key ${idx} failed:`, e.message);
    }
  }
}

// Debounce renders so rapid state events don't thrash the USB bus.
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  setImmediate(async () => {
    renderPending = false;
    await renderAll();
  });
}

const atem = new AtemController(config.atem, scheduleRender);
const obs = new ObsController(config.obs, scheduleRender);

// Switch the deck to a different page. Blanks the panel first so keys the
// new page doesn't define don't keep showing stale art from the old page —
// but only on an actual page change, not on routine tally re-renders
// (scheduleRender/renderAll), so normal state updates stay flicker-free.
async function navigateTo(pageId) {
  if (!config.pages[pageId]) {
    console.warn(`[nav] unknown page "${pageId}"`);
    return;
  }
  currentPageId = pageId;
  if (deck) {
    try { await deck.clearPanel(); } catch (e) { console.error('[deck] clearPanel failed:', e.message); }
  }
  scheduleRender();
}

function handleKey(idx) {
  const key = activePage().keys[idx];
  if (!key) return;

  switch (key.action) {
    case 'atemProgram':     atem.changeProgramInput(key.input); break;
    case 'atemCut':         atem.cut(); break;
    case 'atemAuto':        atem.autoTransition(); break;
    case 'atemFTB':         atem.fadeToBlack(); break;
    case 'obsScene':        obs.setScene(config.scenes[key.scene]); break;
    case 'obsToggleStream': obs.toggleStream(); break;
    case 'obsToggleRecord': obs.toggleRecord(); break;
    case 'openFolder':
      if (!config.pages[key.page]) {
        console.warn(`[nav] key ${idx} on page "${currentPageId}" points to unknown page "${key.page}"`);
        break;
      }
      pageStack.push(currentPageId);
      if (pageStack.length > MAX_PAGE_STACK) pageStack.shift(); // cap depth, don't grow forever
      navigateTo(key.page);
      break;
    case 'goBack':
      navigateTo(pageStack.pop() ?? config.homePage);
      break;
    default: console.warn(`unknown action: ${key.action}`);
  }
}

async function main() {
  // Must be first: refuses to continue if another instance already holds the
  // Stream Deck / ATEM / OBS (whether started via npm start, systemd, or the
  // config UI) — prevents two instances fighting over the same hardware.
  acquireLock();

  if (!hasCanvas()) {
    console.warn('[render] @napi-rs/canvas not installed — keys will show colors only, no text labels.');
    console.warn('[render] to get text labels: npm install @napi-rs/canvas');
  }

  const decks = await listStreamDecks();
  if (decks.length === 0) throw new Error('No Stream Deck found — check USB connection and udev rule');
  deck = await openStreamDeck(decks[0].path);
  await deck.clearPanel();
  await deck.setBrightness(config.deck.brightness);
  const keyControls = deck.CONTROLS.filter((c) => c.type === 'button');
  console.log(`[deck] connected: ${deck.PRODUCT_NAME} (${deck.MODEL}), ${keyControls.length} keys`);
  const configuredKeys = config.deck.cols * config.deck.rows;
  if (configuredKeys !== keyControls.length) {
    console.warn(
      `[deck] config.json says ${config.deck.cols}x${config.deck.rows} (${configuredKeys} keys), ` +
      `but this device has ${keyControls.length} — key indices/preview may not match the physical layout. ` +
      `Update deck.cols/deck.rows (or in the config UI's Stream Deck panel) to fix.`
    );
  }

  deck.on('down', (control) => handleKey(control.index));
  deck.on('error', (e) => console.error('[deck] error:', e));

  atem.connect();
  await obs.connect();

  await renderAll();
}

// Clean shutdown
async function shutdown() {
  console.log('\nshutting down...');
  try { if (deck) { await deck.clearPanel(); await deck.close(); } } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
