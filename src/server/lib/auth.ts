import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Role, User } from "../domain/types";
import { forbidden, unauthorized } from "./errors";
import { getRepo } from "../container";

export const SESSION_COOKIE = "aidtrack_session";
const SESSION_HOURS = 12;

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  shelterId?: string;
}

type G = typeof globalThis & { __aidtrackDevSecret?: string };

let cachedSecret: Promise<Uint8Array> | null = null;

/**
 * Origen del secreto de sesión, por orden: AUTH_SECRET (local/CI) → AWS Secrets Manager (AUTH_SECRET_ARN, producción)
 * → aleatorio por proceso (solo desarrollo). En producción sin ninguno de los dos, falla de forma cerrada.
 */
async function secret(): Promise<Uint8Array> {
  if (process.env.AUTH_SECRET) return new TextEncoder().encode(process.env.AUTH_SECRET);
  if (process.env.AUTH_SECRET_ARN) {
    cachedSecret ??= (async () => {
      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.AUTH_SECRET_ARN }));
      if (!out.SecretString || out.SecretString.length < 32) throw new Error("El secreto de sesión en Secrets Manager es inválido");
      return new TextEncoder().encode(out.SecretString);
    })();
    cachedSecret.catch(() => {
      cachedSecret = null;
    });
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Define AUTH_SECRET o AUTH_SECRET_ARN en producción");
  const g = globalThis as G;
  g.__aidtrackDevSecret ??= randomBytes(32).toString("hex");
  return new TextEncoder().encode(g.__aidtrackDevSecret);
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function signSession(user: User): Promise<string> {
  return new SignJWT({ role: user.role, shelterId: user.shelterId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(await secret());
}

export function sessionCookie(token: string, clear = false): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_HOURS * 3600}${secure}`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Devuelve el actor autenticado, leyendo siempre el rol vigente desde la base (no del token). */
export async function getActor(req: Request): Promise<Actor | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await getRepo().get("users", payload.sub);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, shelterId: user.shelterId };
  } catch {
    return null;
  }
}

export async function requireActor(req: Request): Promise<Actor> {
  const a = await getActor(req);
  if (!a) throw unauthorized();
  return a;
}

export async function requireRole(req: Request, ...roles: Role[]): Promise<Actor> {
  const a = await requireActor(req);
  if (!roles.includes(a.role)) throw forbidden(`Se requiere uno de estos roles: ${roles.join(", ")}`);
  return a;
}

/** Un coordinador de albergue solo puede operar sobre su propio albergue. Admin puede sobre cualquiera. */
export function assertShelterAccess(actor: Actor, shelterId: string) {
  if (actor.role === "admin") return;
  if (actor.role === "shelter_coordinator" && actor.shelterId === shelterId) return;
  throw forbidden("No puedes modificar un albergue que no administras");
}

export const canSeeContacts = (a: Actor | null, shelterId?: string) =>
  !!a && (a.role === "admin" || a.role === "logistics" || (a.role === "shelter_coordinator" && a.shelterId === shelterId));
