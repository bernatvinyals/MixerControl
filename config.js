// =============================================================================
// config.js — loads config.json, the actual settings file.
//
// Don't hand-edit this file. Edit config.json directly, or (easier) run the
// config UI:
//
//   npm run config-ui
//
// then open http://localhost:8787 in a browser. It lets you add/remove Stream
// Deck controls, change OBS scene names, set the OBS websocket URL/password,
// and set/discover the ATEM's IP address.
//
// config.json fields:
//   atem.ip            — ATEM's IP address (TCP port 9910)
//   obs.url/password    — OBS 28+ websocket server (Tools > WebSocket Server
//                         Settings in OBS)
//   deck.brightness     — Stream Deck backlight, 0-100
//   scenes              — map of short names -> real OBS scene names
//                         (must match OBS exactly, case-sensitive)
//   keys                — map of key index -> { label, color, action, ... }
//                         action one of: atemProgram (+input), atemCut,
//                         atemAuto, atemFTB, obsScene (+scene), obsToggleStream,
//                         obsToggleRecord. 'feedback' controls tally/state
//                         highlighting.
//   feedbackColors      — colors used when a feedback state is active
// =============================================================================

module.exports = require('./config.json');
