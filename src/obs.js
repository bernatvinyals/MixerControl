// =============================================================================
// src/obs.js — OBS websocket connection with auto-reconnect + state tracking.
// =============================================================================

const OBSWebSocket = require('obs-websocket-js').default;

const RECONNECT_MIN_MS = 3000;
const RECONNECT_MAX_MS = 60000; // caps retry rate during a long outage so logs/CPU don't grow unbounded

class ObsController {
  constructor(config, onStateChange) {
    this.config = config;
    this.onStateChange = onStateChange; // called whenever tracked state changes
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = RECONNECT_MIN_MS;

    this.state = {
      currentScene: null,
      streaming: false,
      recording: false,
    };

    this._wireEvents();
  }

  _wireEvents() {
    this.obs.on('CurrentProgramSceneChanged', (d) => {
      this.state.currentScene = d.sceneName;
      this.onStateChange();
    });
    this.obs.on('StreamStateChanged', (d) => {
      this.state.streaming = d.outputActive;
      this.onStateChange();
    });
    this.obs.on('RecordStateChanged', (d) => {
      this.state.recording = d.outputActive;
      this.onStateChange();
    });
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.onStateChange();
      this._scheduleReconnect();
    });
  }

  async connect() {
    try {
      await this.obs.connect(this.config.url, this.config.password);
      this.connected = true;
      this.reconnectDelay = RECONNECT_MIN_MS; // back up -- reset backoff for the next drop
      console.log('[OBS] connected');
      await this._syncInitialState();
      this.onStateChange();
    } catch (e) {
      console.error('[OBS] connect failed:', e.message);
      this.connected = false;
      this._scheduleReconnect();
    }
  }

  async _syncInitialState() {
    try {
      const scene = await this.obs.call('GetCurrentProgramScene');
      this.state.currentScene = scene.currentProgramSceneName ?? scene.sceneName;
      const stream = await this.obs.call('GetStreamStatus');
      this.state.streaming = stream.outputActive;
      const record = await this.obs.call('GetRecordStatus');
      this.state.recording = record.outputActive;
    } catch (e) {
      console.error('[OBS] state sync failed:', e.message);
    }
  }

  // Exponential backoff up to RECONNECT_MAX_MS. Without a cap, a multi-day
  // OBS outage (plausible -- OBS machine off overnight during an event)
  // would retry every 3s forever: ~28,800 attempts/day, each logging two
  // lines straight into service.log. Capped at 60s that's at most 1,440/day.
  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[OBS] reconnecting (retrying every ${Math.round(delay / 1000)}s)...`);
      this.connect();
    }, delay);
  }

  async setScene(sceneName) {
    if (!this.connected) return;
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
    } catch (e) {
      console.error('[OBS] setScene failed:', e.message);
    }
  }

  async toggleStream() {
    if (!this.connected) return;
    try { await this.obs.call('ToggleStream'); }
    catch (e) { console.error('[OBS] toggleStream failed:', e.message); }
  }

  async toggleRecord() {
    if (!this.connected) return;
    try { await this.obs.call('ToggleRecord'); }
    catch (e) { console.error('[OBS] toggleRecord failed:', e.message); }
  }
}

module.exports = { ObsController };
