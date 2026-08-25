// =============================================================================
// src/webui.js — minimal local web UI for editing config.json.
//
// Run with: npm run config-ui
// Then open http://localhost:8787
//
// Lets you: add/remove Stream Deck controls (ATEM + OBS actions) across
// multiple pages -- including folders (an "Open folder" key switches pages,
// a "Go back" key returns) -- edit the OBS websocket URL/password (with a
// test-connection button), and set the ATEM IP (with a "scan network"
// button that lists ATEMs found via mDNS).
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
const { normalizeConfig } = require('./configSchema');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const PORT = process.env.CONFIG_UI_PORT || 8787;
// Local-only by default: this UI hands out the OBS password and can
// stop/restart the live service with no login, so it shouldn't be reachable
// from the rest of the network unless someone deliberately opts in (e.g. to
// reach a headless rig from another machine on the same LAN).
const HOST = process.env.CONFIG_UI_HOST || '127.0.0.1';

// Defends against a malicious page open in another tab (or any cross-site
// request) silently hitting this API. PUT/POST here are all CORS "simple
// requests" -- no custom headers required -- so browsers send them
// cross-origin without a preflight; nothing but an explicit check stops
// another site's JS from doing `fetch('http://localhost:8787/api/service/stop',
// {method:'POST'})`. Requests with no Origin header (curl, same-machine
// tooling) are let through, since there's no browser enforcing anything to
// check in that case.
function requireLocalOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
  if (allowed.has(origin)) return next();
  res.status(403).json({ error: 'cross-origin request blocked' });
}

const VALID_ACTIONS = new Set([
  'atemProgram', 'atemCut', 'atemAuto', 'atemFTB',
  'obsScene', 'obsToggleStream', 'obsToggleRecord',
  'openFolder', 'goBack',
]);

function readConfig() {
  // normalizeConfig upgrades an older flat-`keys` config.json in memory, so
  // the UI always sees (and the next Save always persists) the pages shape.
  return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
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

  if (!cfg.pages || typeof cfg.pages !== 'object' || Object.keys(cfg.pages).length === 0) {
    errors.push('at least one page is required');
    return errors; // nothing else can be meaningfully checked without pages
  }

  const pageIds = Object.keys(cfg.pages);
  if (!cfg.homePage || !pageIds.includes(cfg.homePage)) {
    errors.push('homePage must reference an existing page');
  }

  for (const [pageId, page] of Object.entries(cfg.pages)) {
    if (!page || typeof page.keys !== 'object') {
      errors.push(`page "${pageId}": keys must be an object`);
      continue;
    }
    for (const [idx, key] of Object.entries(page.keys)) {
      const where = `page "${pageId}" key ${idx}`;
      if (!/^\d+$/.test(idx)) errors.push(`${where}: index must be a non-negative integer`);
      if (!key.action || !VALID_ACTIONS.has(key.action)) {
        errors.push(`${where}: invalid action "${key.action}"`);
      }
      if (key.action === 'atemProgram' && typeof key.input !== 'number') {
        errors.push(`${where}: atemProgram requires a numeric "input"`);
      }
      if (key.action === 'obsScene' && (!key.scene || !cfg.scenes[key.scene])) {
        errors.push(`${where}: obsScene requires "scene" to reference an entry in scenes`);
      }
      if (key.action === 'openFolder' && (!key.page || !pageIds.includes(key.page))) {
        errors.push(`${where}: openFolder requires "page" to reference an existing page`);
      }
      if (typeof key.label !== 'string' || !key.label.trim()) {
        errors.push(`${where}: label is required`);
      }
      if (typeof key.color !== 'string' || !/^#[0-9a-fA-F]{3,6}$/.test(key.color)) {
        errors.push(`${where}: color must be a hex string like #442266`);
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

  app.put('/api/config', requireLocalOrigin, (req, res) => {
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

  app.post('/api/service/start', requireLocalOrigin, async (req, res) => {
    try {
      res.json(await svc.start());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/service/stop', requireLocalOrigin, async (req, res) => {
    try {
      res.json(await svc.stop());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/service/restart', requireLocalOrigin, async (req, res) => {
    try {
      res.json(await svc.restart());
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/obs/test', requireLocalOrigin, async (req, res) => {
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

  // Central JSON error handler. Without this, a malformed/oversized request
  // body (express.json() rejects anything over its 100kb default limit)
  // falls through to Express's default HTML error page -- which includes a
  // raw stack trace -- instead of this API's normal {error: ...} shape.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(400).json({ error: err.message || 'bad request' });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`[config-ui] http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}

module.exports = { createApp };
