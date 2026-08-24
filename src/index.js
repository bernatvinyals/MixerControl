// =============================================================================
// src/index.js — main service. Connects everything and handles key events.
// =============================================================================

const { openStreamDeck, listStreamDecks } = require('@elgato-stream-deck/node');
const config = require('../config');
const { drawKey, hasCanvas } = require('./render');
const { ObsController } = require('./obs');
const { AtemController } = require('./atem');

let deck = null;

// Re-render all keys based on current ATEM + OBS state.
async function renderAll() {
  if (!deck) return;
  const fc = config.feedbackColors;

  for (const [idxStr, key] of Object.entries(config.keys)) {
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

function handleKey(idx) {
  const key = config.keys[idx];
  if (!key) return;

  switch (key.action) {
    case 'atemProgram':     atem.changeProgramInput(key.input); break;
    case 'atemCut':         atem.cut(); break;
    case 'atemAuto':        atem.autoTransition(); break;
    case 'atemFTB':         atem.fadeToBlack(); break;
    case 'obsScene':        obs.setScene(config.scenes[key.scene]); break;
    case 'obsToggleStream': obs.toggleStream(); break;
    case 'obsToggleRecord': obs.toggleRecord(); break;
    default: console.warn(`unknown action: ${key.action}`);
  }
}

async function main() {
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
