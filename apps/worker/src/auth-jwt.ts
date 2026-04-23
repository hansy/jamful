import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "./types";

export async function signAccessToken(
  payload: JWTPayload,
  secret: string,
  ttlSec: number,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    name: payload.name,
    av: payload.av,
    xid: payload.xid,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + ttlSec * 1000))
    .sign(key);
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<JWTPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const xid = typeof payload.xid === "string" ? payload.xid : null;
    if (!sub || !xid) return null;
    return {
      sub,
      xid,
      name: typeof payload.name === "string" ? payload.name : undefined,
      av: typeof payload.av === "string" ? payload.av : undefined,
    };
  } catch {
    return null;
  }
}
