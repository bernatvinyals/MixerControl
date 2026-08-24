// =============================================================================
// config.js — EDIT THIS FILE. This is the only file you need to touch.
// =============================================================================

module.exports = {
  // --- ATEM Mini Pro -------------------------------------------------------
  // The IP address of your ATEM. Find it in ATEM Software Control, or it may
  // be on the device's network. Mini Pro default is often DHCP-assigned.
  atem: {
    ip: '192.168.0.22',
  },

  // --- OBS Studio ----------------------------------------------------------
  // OBS 28+ has the websocket server built in.
  // Enable it: OBS -> Tools -> WebSocket Server Settings -> Enable, set password.
  obs: {
    url: 'ws://127.0.0.1:4455', // change host if OBS runs on another machine
    password: 'gVxPTrT1Jng9ebPx',
  },

  // --- Stream Deck ---------------------------------------------------------
  deck: {
    brightness: 80, // 0-100
  },

  // --- OBS scene names -----------------------------------------------------
  // These MUST exactly match the scene names in OBS (case-sensitive).
  scenes: {
    scene1: 'Scene 1',
    scene2: 'Scene 2',
    scene3: 'Scene 3',
  },

  // --- Key layout ----------------------------------------------------------
  // Key index = row * 5 + col. Top-left key is 0, bottom-right is 14.
  //
  //   [ 0] [ 1] [ 2] [ 3] [ 4]
  //   [ 5] [ 6] [ 7] [ 8] [ 9]
  //   [10] [11] [12] [13] [14]
  //
  // Each key has: a label (shown on the key), a color, and an action.
  // Action types: 'atemProgram', 'atemCut', 'atemAuto', 'atemFTB',
  //               'obsScene', 'obsToggleStream', 'obsToggleRecord'.
  // 'feedback' marks which keys light up to show live state (tally / active scene).
  keys: {
    // Row 1 — ATEM program inputs + cut
    0:  { label: 'IN 1',  color: '#444', action: 'atemProgram', input: 1, feedback: 'atemProgram' },
    1:  { label: 'IN 2',  color: '#444', action: 'atemProgram', input: 2, feedback: 'atemProgram' },
    2:  { label: 'IN 3',  color: '#444', action: 'atemProgram', input: 3, feedback: 'atemProgram' },
    3:  { label: 'IN 4',  color: '#444', action: 'atemProgram', input: 4, feedback: 'atemProgram' },
    4:  { label: 'CUT',   color: '#7a1f1f', action: 'atemCut' },

    // Row 2 — ATEM transitions
    5:  { label: 'AUTO',  color: '#1f4e7a', action: 'atemAuto' },
    6:  { label: 'FTB',   color: '#222',    action: 'atemFTB', feedback: 'atemFTB' },

    // Row 3 — OBS
    10: { label: 'OBS 1', color: '#3a3a55', action: 'obsScene', scene: 'scene1', feedback: 'obsScene' },
    11: { label: 'OBS 2', color: '#3a3a55', action: 'obsScene', scene: 'scene2', feedback: 'obsScene' },
    12: { label: 'OBS 3', color: '#3a3a55', action: 'obsScene', scene: 'scene3', feedback: 'obsScene' },
    13: { label: 'STREAM', color: '#1f5f2f', action: 'obsToggleStream', feedback: 'obsStream' },
    14: { label: 'REC',   color: '#5f1f1f', action: 'obsToggleRecord', feedback: 'obsRecord' },
  },

  // Colors used for live feedback states
  feedbackColors: {
    programActive: '#cc0000', // ATEM input currently on program (tally red)
    sceneActive:   '#2266dd', // OBS active scene
    streaming:     '#cc0000', // streaming live
    recording:     '#cc0000', // recording
    ftbActive:     '#cc0000', // fade-to-black engaged
  },
};
