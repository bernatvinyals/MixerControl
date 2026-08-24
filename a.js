// key-probe.js
const { openStreamDeck, listStreamDecks } = require('@elgato-stream-deck/node');
(async () => {
    const decks = await listStreamDecks();
    const deck = await openStreamDeck(decks[0].path);
    console.log('press some keys...');

    deck.on('down', (a, b) => console.log('DOWN event:', JSON.stringify(a), JSON.stringify(b)));
    deck.on('up',   (a, b) => console.log('UP event:',   JSON.stringify(a), JSON.stringify(b)));
    deck.on('error', (e) => console.error('error', e));
})();
