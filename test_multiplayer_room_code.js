'use strict';
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
(async () => {
  const { ALPHABET, createRoomCode, normalizeRoomCode, isValidRoomCode, invitationURL } = await import('./js/network/room_code.js');
  assert.equal(ALPHABET, '23456789ABCDEFGHJKLMNPQRSTUVWXYZ');
  assert.equal(normalizeRoomCode('  h7k2p '), 'H7K2P');
  for (const code of ['12345','OOOOO','IIIII','00000','A!BCD','ABCD','ABCDEF','<svg>','']) assert.equal(isValidRoomCode(code), false, code);
  assert(isValidRoomCode('  h7k2p '));
  const samples = Array.from({ length:2000 }, () => createRoomCode(webcrypto));
  assert(samples.every(c => c.length === 5 && [...c].every(x => ALPHABET.includes(x))));
  // Birthday collisions are legal in a 32^5 space; the connection handshake handles them.
  assert(new Set(samples).size > 1980);
  assert.equal(createRoomCode({ getRandomValues(bytes) { bytes.fill(0); return bytes; } }), '22222');
  assert.equal(createRoomCode({ getRandomValues(bytes) { bytes.fill(255); return bytes; } }), 'ZZZZZ');
  assert.throws(() => createRoomCode({}));
  assert.equal(invitationURL('h7k2p','https://example.org/hotline-viseo/index.html?map=source#old'), 'https://example.org/hotline-viseo/index.html?map=source&room=H7K2P');
  console.log('PASS cryptographic room codes, normalization, sampling and subpath invitations');
})().catch(e => { console.error(e); process.exit(1); });
