export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const normalizeRoomCode = value => String(value ?? '').trim().toUpperCase();
export const isValidRoomCode = value => /^[2-9A-HJ-NP-Z]{5}$/.test(normalizeRoomCode(value));
export function createRoomCode(random = globalThis.crypto) {
  if (!random?.getRandomValues) throw Error('Un contexte sécurisé HTTPS est nécessaire.');
  // Uniform over the 32-symbol alphabet; rejection remains unbiased if it changes.
  let code = '';
  while (code.length < 5) for (const byte of random.getRandomValues(new Uint8Array(16))) {
    if (byte < 256 - 256 % ALPHABET.length) code += ALPHABET[byte % ALPHABET.length];
    if (code.length === 5) break;
  }
  return code;
}
export function invitationURL(code, base = location.href) {
  if (!isValidRoomCode(code)) throw Error('Code invalide.');
  const url = new URL(base);
  url.searchParams.set('room', normalizeRoomCode(code)); url.hash = '';
  return url.href;
}
