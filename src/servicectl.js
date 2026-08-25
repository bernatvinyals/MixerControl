// =============================================================================
// src/servicectl.js — lets the config UI start/stop/restart the main service.
//
// Two modes, auto-detected:
//
//  - "systemd" — if streamdeck-av.service is registered with the user's
//    systemd (the setup described in the README), start/stop/restart/status
//    just shell out to systemctl/journalctl. This is the right mode for a
//    production rig: the service's lifecycle isn't tied to the config UI
//    being open.
//
//  - "child" — otherwise (e.g. this Windows dev machine, or a manual `npm
//    start` setup with no systemd unit installed), we supervise
//    `node src/index.js` ourselves: spawn it detached and redirect its
//    stdout/stderr to run/service.log. Detached means the supervised process
//    survives the config UI itself being restarted — closing the config UI
//    does not kill the live service.
//
// Either way, "is it running" and "what's its pid" are read from
// src/singleton.js's shared lock file, not from bookkeeping this module owns
// itself. That's what makes Start/Stop/Restart correct even if the service
// was actually launched some other way (a plain `npm start` in a terminal,
// or systemd) — the UI reflects and controls whatever instance actually
// holds the lock, and index.js's own singleton guard is what guarantees
// there is ever at most one.
//
// On a clean shutdown, index.js's own SIGINT/SIGTERM handler already clears
// the Stream Deck panel before exiting. But that's not guaranteed: on
// Windows there's no real SIGTERM delivery (Node just terminates the
// process outright), and any stop can in principle escalate to SIGKILL. So
// after a stop/restart, once the old process is confirmed gone (it has to
// release the USB HID handle first), we open the deck ourselves here and
// blank it — a stopped service should never leave stale key art lit up.
// =============================================================================

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const singleton = require('./singleton');
const { openStreamDeck, listStreamDecks } = require('@elgato-stream-deck/node');

const BLANK_RETRY_MS = 300;
const BLANK_RETRY_ATTEMPTS = 10; // ~3s total, covers the HID handle release lag

const ROOT = path.join(__dirname, '..');
const RUN_DIR = path.join(ROOT, 'run');
const LOG_FILE = path.join(RUN_DIR, 'service.log');
const SERVICE_UNIT = 'streamdeck-av.service';
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const TAIL_READ_BYTES = 64 * 1024; // plenty for TAIL_LINES; bounds the read regardless of file size
const TAIL_LINES = 150;
const STOP_GRACE_MS = 5000;
const ROTATE_CHECK_MS = 10 * 60 * 1000; // service.log can otherwise grow for as long as the service stays up
const SYSTEMD_CHECK_TTL_MS = 5 * 60 * 1000; // re-check occasionally instead of caching for the process's whole life

function execFileP(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || (err ? err.message : '') });
    });
  });
}

let systemdChecked = null;
let systemdCheckedAt = 0;
async function hasSystemdUnit() {
  if (systemdChecked !== null && Date.now() - systemdCheckedAt < SYSTEMD_CHECK_TTL_MS) return systemdChecked;
  if (process.platform !== 'linux') {
    systemdChecked = false;
    systemdCheckedAt = Date.now();
    return false;
  }
  const res = await execFileP('systemctl', ['--user', 'list-unit-files', SERVICE_UNIT]);
  systemdChecked = res.ok && res.stdout.includes(SERVICE_UNIT);
  systemdCheckedAt = Date.now();
  return systemdChecked;
}

// ---- child-process mode helpers -------------------------------------------

// Read up to `maxBytes` from the end of `file` without loading the whole
// thing into memory -- matters once service.log has been accumulating for
// days: this keeps every read's cost bounded regardless of total file size.
function readTailBytes(file, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } catch (_) {
    return '';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

function tailLog() {
  return readTailBytes(LOG_FILE, TAIL_READ_BYTES).split('\n').filter(Boolean).slice(-TAIL_LINES);
}

// Keep the on-disk log bounded no matter how long the service has been
// running. This used to only run at spawn time, which meant a service left
// running for days without a restart would grow service.log forever; it's
// now also on a timer (see bottom of file) so it's capped regardless.
function rotateLogIfHuge() {
  try {
    const { size } = fs.statSync(LOG_FILE);
    if (size <= MAX_LOG_BYTES) return;
    const keepBytes = Math.floor(MAX_LOG_BYTES / 2);
    const tail = readTailBytes(LOG_FILE, keepBytes);
    fs.writeFileSync(LOG_FILE, `--- log truncated (was over ${MAX_LOG_BYTES} bytes) ---\n${tail}`);
  } catch (_) {}
}

function spawnChild() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  rotateLogIfHuge();
  fs.appendFileSync(LOG_FILE, `\n--- starting ${new Date().toISOString()} ---\n`);
  const fd = fs.openSync(LOG_FILE, 'a');
  const entry = path.join(__dirname, 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    detached: true,
  });
  fs.closeSync(fd);
  child.unref();
  return child.pid;
}

async function killPid(pid) {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM'); // graceful on POSIX (index.js traps SIGTERM); Windows just terminates
  } catch (_) {
    return;
  }
  const deadline = Date.now() + STOP_GRACE_MS;
  while (Date.now() < deadline) {
    if (!singleton.isAlive(pid)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  try { process.kill(pid, 'SIGKILL'); } catch (_) {}
}

// Best-effort: open the Stream Deck directly and clear it. Retries briefly
// since the just-stopped process may hold the HID handle for a moment after
// exiting. Never throws — a missing/busy deck just means nothing to blank.
async function blankDeck() {
  let deck = null;
  try {
    for (let attempt = 0; attempt < BLANK_RETRY_ATTEMPTS; attempt++) {
      try {
        const decks = await listStreamDecks();
        if (!decks.length) return; // no deck attached
        deck = await openStreamDeck(decks[0].path);
        break;
      } catch (_) {
        await new Promise((r) => setTimeout(r, BLANK_RETRY_MS));
      }
    }
    if (!deck) return; // couldn't get exclusive access in time -- give up quietly
    await deck.clearPanel();
  } catch (e) {
    console.error('[servicectl] failed to blank Stream Deck:', e.message);
  } finally {
    if (deck) { try { await deck.close(); } catch (_) {} }
  }
}

// ---- public API -------------------------------------------------------------

async function start() {
  if (await hasSystemdUnit()) return execFileP('systemctl', ['--user', 'start', SERVICE_UNIT]);
  // Authoritative check against the same lock index.js itself enforces --
  // catches an instance running via a manual `npm start`, not just ones this
  // module spawned itself.
  if (singleton.isRunning()) return { ok: true, alreadyRunning: true, pid: singleton.readLockPid() };
  const newPid = spawnChild();
  return { ok: true, pid: newPid };
}

async function stop() {
  if (await hasSystemdUnit()) {
    const res = await execFileP('systemctl', ['--user', 'stop', SERVICE_UNIT]);
    await blankDeck();
    return res;
  }
  const pid = singleton.readLockPid();
  await killPid(pid);
  // Belt-and-braces: a forced SIGKILL skips index.js's own lock cleanup, so
  // clear the lock file ourselves if it's still there.
  try { fs.rmSync(singleton.LOCK_FILE, { force: true }); } catch (_) {}
  await blankDeck();
  return { ok: true };
}

async function restart() {
  if (await hasSystemdUnit()) return execFileP('systemctl', ['--user', 'restart', SERVICE_UNIT]);
  await stop();
  return start();
}

async function status() {
  if (await hasSystemdUnit()) {
    const active = await execFileP('systemctl', ['--user', 'is-active', SERVICE_UNIT]);
    const logs = await execFileP('journalctl', ['--user', '-u', SERVICE_UNIT, '-n', String(TAIL_LINES), '--no-pager']);
    const state = active.stdout.trim() || active.stderr.trim();
    return {
      mode: 'systemd',
      running: state === 'active',
      state,
      logs: logs.ok ? logs.stdout.split('\n').filter(Boolean) : [],
    };
  }
  const running = singleton.isRunning();
  return { mode: 'child', running, pid: running ? singleton.readLockPid() : null, logs: tailLog() };
}

// Cap service.log on a timer too, not just at spawn -- covers a service
// that's left running for days without ever being restarted. Only takes
// effect while this process (the config UI) is alive; see the README for
// the fully-detached, config-UI-never-open edge case.
rotateLogIfHuge();
setInterval(rotateLogIfHuge, ROTATE_CHECK_MS).unref();

module.exports = { start, stop, restart, status, hasSystemdUnit };
