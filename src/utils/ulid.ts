const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let value = now;
  let str = '';
  for (let len = TIME_LEN; len > 0; len--) {
    const mod = value % ENCODING_LEN;
    str = ENCODING.charAt(mod) + str;
    value = (value - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING.charAt((bytes[i] ?? 0) % ENCODING_LEN);
  }
  return str;
}

export function ulid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}
