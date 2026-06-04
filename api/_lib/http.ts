import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import type { UserRole } from "./schema";

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

export function ok(res: VercelResponse, data: unknown, status = 200) {
  return res.status(status).json(data);
}

export function fail(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message });
}

export async function readJson<T>(req: VercelRequest): Promise<T> {
  if (typeof req.body === "string") return JSON.parse(req.body) as T;
  return req.body as T;
}

export function signSession(user: AuthUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "7d" });
}

export function setSessionCookie(res: VercelResponse, token: string) {
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    `rmbsale_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure ? "; Secure" : ""}`
  ]);
}

export function clearSessionCookie(res: VercelResponse) {
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", `rmbsale_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
}

export function requireUser(req: VercelRequest): AuthUser {
  const rawCookie = req.headers.cookie ?? "";
  const token = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rmbsale_session="))
    ?.split("=")[1];

  if (!token) throw new Error("Unauthorized");
  return jwt.verify(token, getJwtSecret()) as AuthUser;
}

export function requireAdmin(req: VercelRequest) {
  const user = requireUser(req);
  if (user.role !== "admin") throw new Error("Admin permission is required");
  return user;
}

export function getClientMeta(req: VercelRequest) {
  return {
    ipAddress: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""),
    userAgent: String(req.headers["user-agent"] ?? "")
  };
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}
