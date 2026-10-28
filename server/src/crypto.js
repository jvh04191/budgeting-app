import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_HINT = `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`;

export function loadKey(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex || '')) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: ${KEY_HINT}`);
  }
  return Buffer.from(hex, 'hex');
}

// AES-256-GCM; output is "iv.tag.ciphertext" in base64.
export function encrypt(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload, key) {
  const [iv, tag, data] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
