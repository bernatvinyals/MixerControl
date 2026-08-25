// =============================================================================
// config.js — loads config.json, the actual settings file.
//
// Don't hand-edit this file. Edit config.json directly, or (easier) run the
// config UI:
//
//   npm run config-ui
//
// then open http://localhost:8787 in a browser. It lets you add/remove Stream
// Deck controls (including folders of controls across multiple pages), change
// OBS scene names, set the OBS websocket URL/password, and set/discover the
// ATEM's IP address.
//
// config.json fields:
//   atem.ip            — ATEM's IP address (TCP port 9910)
//   obs.url/password    — OBS 28+ websocket server (Tools > WebSocket Server
//                         Settings in OBS)
//   deck.brightness     — Stream Deck backlight, 0-100
//   scenes              — map of short names -> real OBS scene names
//                         (must match OBS exactly, case-sensitive)
//   homePage            — id of the page shown when the service starts
//   pages               — map of page id -> { keys }. Each page is its own
//                         independent set of controls (index -> control),
//                         letting a folder key switch the whole deck to a
//                         different page. action one of: atemProgram
//                         (+input), atemCut, atemAuto, atemFTB, obsScene
//                         (+scene), obsToggleStream, obsToggleRecord,
//                         openFolder (+page — the target page id), goBack
//                         (returns to whichever page you opened this one
//                         from). 'feedback' controls tally/state
//                         highlighting.
//   feedbackColors      — colors used when a feedback state is active
//
// (Older config.json files with a single flat `keys` map instead of
// `pages`/`homePage` are upgraded automatically in memory -- see
// src/configSchema.js.)
// =============================================================================

module.exports = require('./src/configSchema').normalizeConfig(require('./config.json'));
