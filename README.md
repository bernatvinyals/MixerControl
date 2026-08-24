# Stream Deck → ATEM Mini Pro + OBS controller (Linux)

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

Open `config.js` and set:
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

Everything is in `config.js`:

- **Remap a key** — change its entry under `keys`. Key index = `row * 5 + col`
  (top-left = 0, bottom-right = 14).
- **Add an action to an empty key** — e.g. key 7, 8, 9 are unused by default.
  Copy the shape of an existing entry. Available `action` values:
  `atemProgram` (needs `input`), `atemCut`, `atemAuto`, `atemFTB`,
  `obsScene` (needs `scene`), `obsToggleStream`, `obsToggleRecord`.
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
- **Scene key doesn't highlight** — the scene name in `config.js` must match the
  OBS scene name exactly, including capitalization and spaces.

## Notes

- The ATEM Mini Pro's own USB recording/streaming controls aren't wired here on
  purpose — recording and streaming are handled through OBS in this layout. If
  you'd rather drive the ATEM's built-in record/stream, that can be added, but
  API support for it varies by `atem-connection` version and ATEM firmware.
- This project uses `atem-connection` (the Sofie/NRK broadcast library) and
  `obs-websocket-js` v5 — both pure-network, no Blackmagic SDK required.
