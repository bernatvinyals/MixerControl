// =============================================================================
// src/webui.js — minimal local web UI for editing config.json.
//
// Run with: npm run config-ui
// Then open http://localhost:8787
//
// Lets you: add/remove Stream Deck controls (ATEM + OBS actions), edit the
// OBS websocket URL/password (with a test-connection button), and set the
// ATEM IP (with a "scan network" button that lists ATEMs found via mDNS).
//
// This tool only edits config.json on disk. Restart the main service
// (npm start) for changes to take effect.
// =============================================================================

const path = require('path');
const fs = require('fs');
const express = require('express');
const OBSWebSocket = require('obs-websocket-js').default;
const { discoverAtems } = require('./discovery');
const svc = require('./servicectl');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const PORT = process.env.CONFIG_UI_PORT || 8787;

const VALID_ACTIONS = new Set([
  'atemProgram', 'atemCut', 'atemAuto', 'atemFTB',
  'obsScene', 'obsToggleStream', 'obsToggleRecord',
]);

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(cfg) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, CONFIG_PATH);
}

// Basic shape/sanity checks — enough to stop obviously broken saves from
// bricking the main service, not a full schema validator.
function validate(cfg) {
  const errors = [];

  if (!cfg.atem || typeof cfg.atem.ip !== 'string' || !cfg.atem.ip.trim()) {
    errors.push('atem.ip is required');
  }
  if (!cfg.obs || typeof cfg.obs.url !== 'string' || !cfg.obs.url.trim()) {
    errors.push('obs.url is required');
  }
  if (cfg.obs && typeof cfg.obs.password !== 'string') {
    errors.push('obs.password must be a string');
  }
  if (!cfg.deck || typeof cfg.deck.brightness !== 'number') {
    errors.push('deck.brightness must be a number');
  }
  if (!cfg.scenes || typeof cfg.scenes !== 'object') {
    errors.push('scenes must be an object');
  }
  if (!cfg.keys || typeof cfg.keys !== 'object') {
    errors.push('keys must be an object');
  } else {
    for (const [idx, key] of Object.entries(cfg.keys)) {
      if (!/^\d+$/.test(idx)) errors.push(`key index "${idx}" must be a non-negative integer`);
      if (!key.action || !VALID_ACTIONS.has(key.action)) {
        errors.push(`key ${idx}: invalid action "${key.action}"`);
      }
      if (key.action === 'atemProgram' && typeof key.input !== 'number') {
        errors.push(`key ${idx}: atemProgram requires a numeric "input"`);
      }
      if (key.action === 'obsScene' && (!key.scene || !cfg.scenes[key.scene])) {
        errors.push(`key ${idx}: obsScene requires "scene" to reference an entry in scenes`);
      }
      if (typeof key.label !== 'string' || !key.label.trim()) {
        errors.push(`key ${idx}: label is required`);
      }
      if (typeof key.color !== 'string' || !/^#[0-9a-fA-F]{3,6}$/.test(key.color)) {
        errors.push(`key ${idx}: color must be a hex string like #442266`);
      }
    }
  }

  return errors;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/config', (req, res) => {
    try {
      res.json(readConfig());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/config', (req, res) => {
    try {
      const current = readConfig();
      // Merge onto the current file so fields the UI doesn't manage
      // (currently feedbackColors) survive untouched.
      const next = {
        ...current,
        ...req.body,
        feedbackColors: current.feedbackColors,
      };
      const errors = validate(next);
      if (errors.length) return res.status(400).json({ errors });
      writeConfig(next);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/atem/discover', async (req, res) => {
    try {
      const found = await discoverAtems(4000);
      res.json({ devices: found });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/service/status', async (req, res) => {
    try {
      res.json(await svc.status());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/service/start', async (req, res) => {
    try {
      res.json(await svc.start());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/service/stop', async (req, res) => {
    try {
      res.json(await svc.stop());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/service/restart', async (req, res) => {
    try {
      res.json(await svc.restart());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/obs/test', async (req, res) => {
    const { url, password } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: 'url is required' });
    const obs = new OBSWebSocket();
    try {
      await obs.connect(url, password || undefined);
      await obs.disconnect();
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[config-ui] http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
