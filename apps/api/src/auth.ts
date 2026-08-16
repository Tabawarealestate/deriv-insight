import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not configured.");
}

export const passwordIsStrong = (password: string) =>
  password.length >= 8 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

export const normalizeUsername = (username: string) =>
  username.trim().toLowerCase();

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createToken(user: {
  id: string;
  username: string;
}) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");

  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("deriv_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie("deriv_session");
}

export async function getUserFromRequest(
  req: Request,
  pool: Pool
) {
  try {
    const token = req.cookies?.deriv_session;

    if (!token || !JWT_SECRET) return null;

    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub?: string;
      username?: string;
    };

    if (!decoded.sub) return null;

    const result = await pool.query(
      `SELECT id, full_name, phone, username, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [decoded.sub]
    );

    return result.rows[0] || null;
  } catch {
    return null;
  }
}

export function randomResetCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function hashResetCode(code: string) {
  return bcrypt.hash(code, 10);
}

export async function verifyResetCode(code: string, hash: string) {
  return bcrypt.compare(code, hash);
}

export function requireAuth(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getUserFromRequest(req, pool);

    if (!user) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    res.locals.user = user;
    next();
  };
}
