// =============================================================================
// src/discovery.js — finds ATEM switchers on the local network via mDNS.
//
// ATEM units advertise themselves as Bonjour/mDNS services of type
// "_blackmagic._tcp.local" (the same mechanism ATEM Software Control and
// Blackmagic's other network tools use to find them). We browse for that
// service type for a few seconds and collect whatever responds.
// =============================================================================

const { Bonjour } = require('bonjour-service');

// Coalesce overlapping scans onto a single in-flight mDNS browse instead of
// opening a fresh multicast socket per call -- guards against a client that
// hammers the "scan" endpoint (double-clicks, a buggy retry loop, left
// running for days) from piling up concurrent sockets.
let inFlight = null;

// Resolve a list of { name, ip, port } for ATEM-like devices found within
// `timeoutMs`. Not all "_blackmagic._tcp" services are switchers (some are
// converters, HyperDecks, etc.) — we surface the class from the TXT record
// when present so the caller/UI can show it, but we don't filter it out,
// since firmware/model differences make that field unreliable.
function discoverAtems(timeoutMs = 4000) {
  if (inFlight) return inFlight;

  inFlight = new Promise((resolve) => {
    const instance = new Bonjour();
    const found = new Map(); // ip -> entry

    const browser = instance.find({ type: 'blackmagic', protocol: 'tcp' }, (service) => {
      const ip = (service.addresses || []).find((a) => a.includes('.')) || service.referer?.address;
      if (!ip) return;
      found.set(ip, {
        name: service.name || service.host || ip,
        ip,
        class: service.txt?.class || null,
      });
    });

    setTimeout(() => {
      try { browser.stop(); } catch (_) {}
      try { instance.destroy(); } catch (_) {}
      resolve(Array.from(found.values()));
    }, timeoutMs);
  }).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

module.exports = { discoverAtems };
