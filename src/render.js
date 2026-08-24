// =============================================================================
// src/render.js — draws a key with a background color and (optionally) a label.
// v7 API: geometry comes from deck.CONTROLS; solid color uses fillKeyColor,
// text labels use @napi-rs/canvas + fillKeyBuffer when available.
// =============================================================================

let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch (_) {
  canvasLib = null;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

// Find the button control for a given key index, to read its pixel size.
function buttonControlFor(deck, keyIndex) {
  return deck.CONTROLS.find((c) => c.type === 'button' && c.index === keyIndex);
}

function keyPixelSize(deck, keyIndex) {
  const ctrl = buttonControlFor(deck, keyIndex);
  // v7 button controls expose pixelSize: { width, height }
  if (ctrl && ctrl.pixelSize && ctrl.pixelSize.width) return ctrl.pixelSize.width;
  return 72; // Stream Deck Original V2 default
}

// Build an RGB buffer with a colored background and centered white label.
function renderLabelBuffer(size, label, hexColor) {
  const canvas = canvasLib.createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size / 5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);

  const rgba = ctx.getImageData(0, 0, size, size).data;
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

async function drawKey(deck, keyIndex, label, hexColor) {
  if (canvasLib && label) {
    const size = keyPixelSize(deck, keyIndex);
    const buf = renderLabelBuffer(size, label, hexColor);
    await deck.fillKeyBuffer(keyIndex, buf, { format: 'rgb' });
  } else {
    // No canvas (or no label): simple solid color, no geometry needed.
    const { r, g, b } = hexToRgb(hexColor);
    await deck.fillKeyColor(keyIndex, r, g, b);
  }
}

module.exports = { drawKey, hasCanvas: () => !!canvasLib };
