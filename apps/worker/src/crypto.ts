export type EncryptedSecretRecord = {
  ciphertext: string;
  iv: string;
  kid: string;
};

function normalizeBase64(input: string): string {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  return `${normalized}${"=".repeat(padLength)}`;
}

function decodeBase64(input: string): Uint8Array {
  const raw = atob(normalizeBase64(input));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) {
    out += String.fromCharCode(byte);
  }
  return btoa(out);
}

async function importEncryptionKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret?.trim()) {
    throw new Error("X_REFRESH_TOKEN_ENC_KEY is not set");
  }
  const raw = decodeBase64(secret);
  if (![16, 24, 32].includes(raw.byteLength)) {
    throw new Error("X_REFRESH_TOKEN_ENC_KEY must be base64 for a 16, 24, or 32 byte key");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(
  plaintext: string,
  env: Env,
): Promise<EncryptedSecretRecord> {
  const key = await importEncryptionKey(env.X_REFRESH_TOKEN_ENC_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    kid: env.X_REFRESH_TOKEN_ENC_KID?.trim() || "v1",
  };
}

export async function decryptSecret(
  record: EncryptedSecretRecord,
  env: Env,
): Promise<string> {
  const key = await importEncryptionKey(env.X_REFRESH_TOKEN_ENC_KEY);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(record.iv) },
    key,
    decodeBase64(record.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
