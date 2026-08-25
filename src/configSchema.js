// =============================================================================
// src/configSchema.js — shared config shape + migration, used by both the
// runtime (index.js, via config.js) and the config UI (webui.js).
//
// Controls live on "pages": each page is its own independent set of Stream
// Deck keys (index -> control). An `openFolder` key switches the deck to a
// different page (a user-curated "folder" of controls); a `goBack` key
// returns to wherever you navigated in from. This is what lets one physical
// 15-key deck host far more than 15 controls.
//
// Older config.json files only have a flat top-level `keys` map (no
// `pages`/`homePage` at all) — normalizeConfig() upgrades those in memory,
// so both the runtime and the UI always see the current shape regardless of
// what's actually on disk (and the UI's next Save persists the upgrade).
// =============================================================================

const ROOT_PAGE_ID = 'root';
const DEFAULT_DECK_COLS = 5;
const DEFAULT_DECK_ROWS = 3;

function positiveInt(n, fallback) {
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeConfig(raw) {
  const cfg = { ...raw };

  // deck.cols/deck.rows describe the physical grid (Stream Deck Mini is
  // 3x2, Original/MK.2 is 5x3, XL is 8x4, ...) -- used for the key-index
  // convention (row * cols + col), the config UI's preview grid, and a
  // startup sanity check against whatever's actually plugged in. Default to
  // 5x3 (the original assumption this app shipped with) if missing/invalid.
  //
  // deck.serialNumber picks which physical Stream Deck to use when more
  // than one is connected (serial number is a stable hardware identifier
  // that survives replugging/reboots, unlike the OS device path). Empty
  // string means "just use whichever one is found first", preserving the
  // original single-device behavior.
  cfg.deck = {
    ...cfg.deck,
    brightness: Number.isInteger(cfg.deck?.brightness) ? cfg.deck.brightness : 80,
    cols: positiveInt(cfg.deck?.cols, DEFAULT_DECK_COLS),
    rows: positiveInt(cfg.deck?.rows, DEFAULT_DECK_ROWS),
    serialNumber: typeof cfg.deck?.serialNumber === 'string' ? cfg.deck.serialNumber : '',
  };

  if (!cfg.pages || typeof cfg.pages !== 'object' || Object.keys(cfg.pages).length === 0) {
    cfg.pages = {
      [ROOT_PAGE_ID]: { keys: cfg.keys && typeof cfg.keys === 'object' ? cfg.keys : {} },
    };
    cfg.homePage = ROOT_PAGE_ID;
  }

  // Defend against a malformed/hand-edited individual page entry too (e.g.
  // its `keys` field missing or not an object) -- without this, the runtime
  // would crash on Object.entries(undefined) the moment that page becomes
  // active, instead of just treating it as an empty page.
  const pages = {};
  for (const [id, page] of Object.entries(cfg.pages)) {
    const keys = page && typeof page === 'object' && page.keys && typeof page.keys === 'object' ? page.keys : {};
    pages[id] = { keys };
  }
  cfg.pages = pages;

  if (!cfg.homePage || !cfg.pages[cfg.homePage]) {
    cfg.homePage = Object.keys(cfg.pages)[0];
  }

  delete cfg.keys; // superseded by pages -- avoid two sources of truth

  return cfg;
}

module.exports = { normalizeConfig, ROOT_PAGE_ID };
