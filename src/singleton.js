// =============================================================================
// src/singleton.js — guarantees only one instance of the service is ever
// live at a time, no matter how it was started (npm start in a terminal,
// systemd, or the config UI's own supervisor).
//
// Uses a pidfile (run/index.lock) created with the OS-level atomic
// create-exclusive flag ('wx'). That atomicity is what makes this a real
// guarantee rather than a check-then-act race: if two processes call
// acquireLock() at the same instant, the filesystem itself picks exactly one
// winner. A lock left behind by a crashed/killed process is detected (pid no
// longer alive) and cleared automatically so a stale lock can't wedge things.
// =============================================================================

const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join(__dirname, '..', 'run', 'index.lock');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists but we can't signal it -> still alive
  }
}

function readLockPid() {
  try {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

// True if some process currently holds the lock -- i.e. the service is up,
// however it was launched.
function isRunning() {
  const pid = readLockPid();
  return !!pid && isAlive(pid);
}

// Acquire the singleton lock for the calling process. Throws if another live
// instance already holds it. Call this once at startup, before touching the
// Stream Deck / ATEM / OBS. Returns a release() function — call it on
// shutdown (or just rely on the 'exit' handler registered here).
function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      const release = () => { try { fs.rmSync(LOCK_FILE, { force: true }); } catch (_) {} };
      process.on('exit', release);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const existingPid = readLockPid();
      if (existingPid && isAlive(existingPid)) {
        throw new Error(
          `another instance is already running (pid ${existingPid}) — refusing to start a second one`
        );
      }
      // Lock left behind by a crashed/killed process — clear and retry.
      try { fs.rmSync(LOCK_FILE, { force: true }); } catch (_) {}
    }
  }
  throw new Error('could not acquire the singleton lock (repeated contention) — try again');
}

module.exports = { acquireLock, isRunning, readLockPid, isAlive, LOCK_FILE };
