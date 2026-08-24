const { HID, devices } = require('node-hid');
const elgato = devices().filter(d => d.vendorId === 0x0fd9);
console.log(JSON.stringify(elgato, null, 2));
