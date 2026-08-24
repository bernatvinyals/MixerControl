// =============================================================================
// src/atem.js — ATEM connection wrapper with program-input + FTB tracking.
// atem-connection auto-reconnects internally.
// =============================================================================

const { Atem } = require('atem-connection');

class AtemController {
  constructor(config, onStateChange) {
    this.config = config;
    this.onStateChange = onStateChange;
    this.atem = new Atem();
    this.connected = false;

    this.state = {
      programInput: null, // current program input number
      ftb: false,         // fade-to-black active
    };

    this._wireEvents();
  }

  _wireEvents() {
    this.atem.on('connected', () => {
      this.connected = true;
      console.log('[ATEM] connected');
      this._readState();
      this.onStateChange();
    });
    this.atem.on('disconnected', () => {
      this.connected = false;
      console.log('[ATEM] disconnected');
      this.onStateChange();
    });
    this.atem.on('stateChanged', (_state, paths) => {
      // Only re-read on relevant changes to avoid churn
      if (paths.some((p) => p.includes('video.mixEffects') || p.includes('fadeToBlack'))) {
        this._readState();
        this.onStateChange();
      }
    });
    this.atem.on('error', (e) => console.error('[ATEM] error:', e));
  }

  _readState() {
    try {
      const me = this.atem.state?.video?.mixEffects?.[0];
      if (me) {
        this.state.programInput = me.programInput;
        this.state.ftb = !!(me.fadeToBlack && me.fadeToBlack.isFullyBlack);
      }
    } catch (e) {
      // state may not be ready yet
    }
  }

  connect() {
    this.atem.connect(this.config.ip);
  }

  changeProgramInput(input) {
    if (!this.connected) return;
    this.atem.changeProgramInput(input).catch((e) =>
      console.error('[ATEM] changeProgramInput failed:', e.message));
  }

  cut() {
    if (!this.connected) return;
    this.atem.cut().catch((e) => console.error('[ATEM] cut failed:', e.message));
  }

  autoTransition() {
    if (!this.connected) return;
    this.atem.autoTransition().catch((e) =>
      console.error('[ATEM] autoTransition failed:', e.message));
  }

  fadeToBlack() {
    if (!this.connected) return;
    this.atem.fadeToBlack(0).catch((e) =>
      console.error('[ATEM] fadeToBlack failed:', e.message));
  }
}

module.exports = { AtemController };
