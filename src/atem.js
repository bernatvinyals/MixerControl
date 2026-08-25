// =============================================================================
// src/atem.js — ATEM connection wrapper with program-input + FTB tracking.
// atem-connection auto-reconnects internally.
// =============================================================================

const { Atem } = require('atem-connection');

const ERROR_LOG_MIN_INTERVAL_MS = 30000; // rate-limit our own logging of library 'error' events

class AtemController {
  constructor(config, onStateChange) {
    this.config = config;
    this.onStateChange = onStateChange;
    this.atem = new Atem();
    this.connected = false;
    this._lastErrorLogAt = 0;

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
    // atem-connection retries internally at its own cadence, which we don't
    // control -- if it errors repeatedly during a prolonged outage, rate-limit
    // our own logging of it rather than logging every single occurrence.
    this.atem.on('error', (e) => {
      const now = Date.now();
      if (now - this._lastErrorLogAt < ERROR_LOG_MIN_INTERVAL_MS) return;
      this._lastErrorLogAt = now;
      console.error('[ATEM] error:', e);
    });
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
