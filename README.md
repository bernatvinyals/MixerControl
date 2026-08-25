# Stream Deck → ATEM Mini Pro + OBS controller

A single Node.js service that turns a 15-key (3×5) Elgato Stream Deck into a
combined controller for an **ATEM Mini Pro** (over the network) and **OBS Studio**
(over obs-websocket). No Wine, no VM, no official Elgato software or plugins.

It also lights up keys to show live state: tally on the active ATEM input, the
active OBS scene, and streaming/recording status.

## How it works

```
                  ┌─> TCP 9910 ──> ATEM Mini Pro   (atem-connection)
[Stream Deck] ──> Node.js service
   USB HID        └─> WS 4455  ──> OBS Studio        (obs-websocket-js v5)
```

## Default key layout

```
[IN 1] [IN 2] [IN 3] [IN 4] [CUT ]      ← ATEM program inputs + cut
[AUTO] [FTB ] [    ] [    ] [    ]      ← ATEM transitions
[OBS1] [OBS2] [OBS3] [STRM] [REC ]      ← OBS scenes + stream/record toggle
```

Edit `config.js` to change any of this — it's the only file you need to touch.

---

## Prerequisites

1. **Node.js 18 or newer.**
   ```bash
   node --version
   ```
   If missing, install via your distro or nvm.

2. **OBS 28 or newer** with the websocket server enabled:
   OBS → **Tools → WebSocket Server Settings** → tick *Enable WebSocket server*,
   set a password, note the port (default **4455**).

3. **ATEM Mini Pro reachable on the network.** Know its IP address (check in
   ATEM Software Control, or your router). The Mini Pro listens on TCP port 9910.

---

## Setup

### 1. Install dependencies
```bash
cd streamdeck-av
npm install
```

Optional but recommended — text labels on the keys (otherwise keys show as
solid colors only):
```bash
npm install @napi-rs/canvas
```

### 2. Install the udev rule (non-root USB access)

Without this, the script can't open the Stream Deck (permission error).
```bash
sudo cp 70-streamdeck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```
Then **unplug and replug** the Stream Deck.

### 3. Configure

Settings live in `config.json` (`config.js` just loads it — don't hand-edit
`config.js`). Easiest way to edit it is the built-in config UI:

```bash
npm run config-ui
```

Open **http://localhost:8787** (it only listens on localhost by default — it
hands out the OBS password and can stop/restart the live service with no
login, so it's not meant to be reachable from the rest of the network. To
reach a headless rig from another machine on the same LAN anyway, set
`CONFIG_UI_HOST=0.0.0.0` when starting it, but understand that removes that
protection entirely). From there you can:
- Set the **ATEM IP** by hand, or click **Scan network** to list ATEMs found
  via mDNS on the local network and pick one.
- Set the **OBS websocket URL/password**, with a **Test connection** button.
- Add/remove **Stream Deck controls** (key index, label, color, action, and
  the action's parameter — ATEM input number, OBS scene, or folder target)
  and toggle tally/state highlighting per key.
- Build **folders**: add a page, then on any key set its action to **Open
  folder** and pick that page as the target — pressing it switches the whole
  deck to that page's controls. New pages start with a **Go back** key
  already on them (index 0) so a folder never dead-ends, but it's a normal
  key like any other — move it, remove it, add more of them, whatever you
  want. Nested folders work too: Go back always returns to whichever page
  you actually opened the current one from, not straight to home.
- Pick which page is **Home** (shown when the service starts) from the pages
  list.
- Manage the **OBS scene name mapping** used by `obsScene` controls.
- Set the **Stream Deck brightness**.

Click **Save** to write `config.json`. The main service (`npm start`) only
reads config at startup, so restart it after saving — the **Service** panel
at the top has **Start / Stop / Restart** buttons plus a live log tail, so you
don't need a separate terminal.

If `streamdeck-av.service` is installed and enabled via systemd (see below),
those buttons drive it with `systemctl --user`/`journalctl`, so the service's
lifecycle stays independent of the config UI — closing the UI doesn't stop
the service. Without systemd (e.g. a plain `npm start` setup, or on Windows),
the UI instead supervises `node src/index.js` itself as a detached process
(log kept in `run/`), which also survives the config UI being closed or
restarted.

**Stopping always blanks the deck.** `index.js`'s own shutdown handler clears
the panel on a graceful SIGINT/SIGTERM, but that's not guaranteed on every
path (Windows has no real SIGTERM delivery, and a stop can in principle
escalate to a forced kill) — so after Stop/Restart, once the old process has
actually exited, the config UI itself opens the Stream Deck directly and
clears it. A stopped service never leaves stale key art lit up on the deck.

**Only one instance ever runs.** `index.js` takes an exclusive lock
(`run/index.lock`) as the very first thing it does, before touching the
Stream Deck/ATEM/OBS. If another instance already holds it — started via the
UI, a manual `npm start`, or systemd — it refuses to start and exits with a
clear error instead of two processes fighting over the same hardware. The
config UI's Start/Stop/Restart buttons and status display read/act on this
same lock, so they reflect and control whichever instance is actually
running, however it was launched.

**Long-running stability.** This is meant to be left running for days at a
time, so a few things are deliberately bounded: OBS/ATEM reconnect logging
backs off and rate-limits itself during a prolonged outage instead of
spamming forever, and `run/service.log` is capped (truncated to its tail)
both at every service start and on a 10-minute timer, so it can't grow
without limit even if the service itself is never restarted. That timer only
runs inside the config UI's own process, though — if you use "child" mode
(no systemd) and close the config UI entirely while leaving the detached
service running unattended for a long stretch, its log won't self-trim until
the config UI is opened again. For a real production rig, prefer the
systemd setup below: journald has its own rotation/retention independent of
any of this.

If you'd rather edit by hand, `config.json`'s fields are documented in the
comment header of `config.js`:
- `atem.ip` — your ATEM's IP address
- `obs.url` / `obs.password` — match your OBS websocket settings
- `scenes.scene1/2/3` — your exact OBS scene names (case-sensitive)

### 4. Run
```bash
npm start
```

You should see connection logs for the deck, ATEM, and OBS, and the keys should
light up. Press keys to test.

---

## Run automatically on boot (systemd user service)

```bash
mkdir -p ~/.config/systemd/user
cp streamdeck-av.service ~/.config/systemd/user/
```

Edit `~/.config/systemd/user/streamdeck-av.service`:
- `WorkingDirectory` → absolute path to this project
- `ExecStart` → absolute path to node (find it with `which node`)

Then enable it:
```bash
systemctl --user daemon-reload
systemctl --user enable --now streamdeck-av.service
```

Watch logs:
```bash
journalctl --user -f -u streamdeck-av
```

To keep it running when you're not logged in (dedicated rig):
```bash
sudo loginctl enable-linger $USER
```

---

## Customizing

Use `npm run config-ui` (see above) to add/remove keys, remap actions, and
change scene names, ATEM IP, or OBS connection settings without touching JSON
by hand. Everything it edits lives in `config.json`:

- **Remap a key** — change its entry under `keys`. Key index = `row * 5 + col`
  (top-left = 0, bottom-right = 14).
- **Add an action to an empty key** — e.g. key 7, 8, 9 are unused by default.
  Copy the shape of an existing entry. Available `action` values:
  `atemProgram` (needs `input`), `atemCut`, `atemAuto`, `atemFTB`,
  `obsScene` (needs `scene`), `obsToggleStream`, `obsToggleRecord`,
  `openFolder` (needs `page` — the target page's id), `goBack`.
- **Live feedback** — the `feedback` field controls which keys recolor to show
  state. Remove it if you want a key to keep a fixed color.

---

## Troubleshooting

- **`Error: cannot open device` / permission denied** — udev rule not applied,
  or you didn't replug the deck. Re-run step 2.
- **OBS won't connect** — wrong port/password, or websocket server not enabled.
  Default port for OBS 28+ is 4455 (not the old 4444).
- **ATEM won't connect** — wrong IP, or not on the same network. Confirm you can
  reach it from ATEM Software Control on the same machine first.
- **Keys show colors but no text** — install `@napi-rs/canvas` (see step 1).
- **Scene key doesn't highlight** — the scene name in `config.json` must match
  the OBS scene name exactly, including capitalization and spaces.
- **"Scan network" finds nothing** — mDNS (UDP 5353) must be reachable between
  this machine and the ATEM: same subnet, no VLAN/AP client-isolation, and the
  local firewall must allow inbound mDNS replies. You can still type the IP in
  by hand.

## Notes

- The ATEM Mini Pro's own USB recording/streaming controls aren't wired here on
  purpose — recording and streaming are handled through OBS in this layout. If
  you'd rather drive the ATEM's built-in record/stream, that can be added, but
  API support for it varies by `atem-connection` version and ATEM firmware.
- This project uses `atem-connection` (the Sofie/NRK broadcast library) and
  `obs-websocket-js` v5 — both pure-network, no Blackmagic SDK required.
