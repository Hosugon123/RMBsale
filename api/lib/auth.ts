import { SignJWT, jwtVerify } from 'jose';
import type { VercelRequest } from '@vercel/node';
import type { AuthUser } from './types.js';

const COOKIE_NAME = 'rmb_session';
const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || 'a_very_very_secret_key_that_is_long_and_secure',
);

export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: String(user.id), username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const id = Number(payload.sub);
    if (!id) return null;
    return {
      id,
      username: String(payload.username),
      role: payload.role as AuthUser['role'],
      isAdmin: payload.role === 'admin',
    };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );
}

export async function getUserFromRequest(req: VercelRequest): Promise<AuthUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

export function clearAuthCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`;
}
