// 비밀번호 해시 — node:crypto 의 scrypt (ADR-011). 의존성 0.
//
// 저장 꼴: scrypt$N$r$p$<소금 b64>$<해시 b64>. 매개변수가 저장 꼴에 있어 나중에 올려도 옛 해시가 산다.
// 대조는 timingSafeEqual — 몇 번째 바이트에서 어긋났는지가 걸린 시간으로 새지 않게.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT = Object.freeze({ N: 2 ** 15, r: 8, p: 1, keyLen: 64, saltLen: 16 });
export const MIN_PASSWORD_LENGTH = 8;

// N=2^15 · r=8 은 128·N·r ≈ 33.5MB 를 쓴다. Node 기본 maxmem(32MB)을 넘어서 올려 준다
const maxmemFor = (N, r) => 256 * N * r;

const derive = (password, salt, { N, r, p, keyLen }) => new Promise((resolve, reject) => {
  scrypt(String(password), salt, keyLen, { N, r, p, maxmem: maxmemFor(N, r) }, (e, key) => (e ? reject(e) : resolve(key)));
});

export async function hashPassword(password) {
  const salt = randomBytes(SCRYPT.saltLen);
  const key = await derive(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

// 꼴이 어그러진 저장값은 거절(false)이지 오류가 아니다
export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isInteger)) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const want = Buffer.from(parts[5], 'base64');
  if (!salt.length || !want.length) return false;
  const got = await derive(password, salt, { N, r, p, keyLen: want.length });
  return timingSafeEqual(got, want);
}
