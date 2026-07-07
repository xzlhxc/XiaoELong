import { randomUUID } from "node:crypto";
import type { UserProfile } from "@xiaoelong/shared";
import type { ResultSetHeader } from "mysql2";
import { pool } from "./pool.js";
import { mapUserRow, type UserRow } from "./mappers.js";

interface CreateUserInput {
  nickname: string;
  avatarUrl: string | null;
}

interface UpdateUserProfileInput {
  nickname: string;
  avatarUrl?: string | null;
}

export async function createUser(input: CreateUserInput): Promise<UserProfile> {
  const id = randomUUID();

  await pool.execute(
    "INSERT INTO users (id, nickname, avatar_url) VALUES (?, ?, ?)",
    [id, input.nickname, input.avatarUrl]
  );

  const user = await getUserById(id);
  if (!user) {
    throw new Error("User creation failed.");
  }

  return user;
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const [rows] = await pool.query<UserRow[]>(
    "SELECT id, nickname, avatar_url, created_at FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0]);
}

export async function listUsers(): Promise<UserProfile[]> {
  const [rows] = await pool.query<UserRow[]>(
    "SELECT id, nickname, avatar_url, created_at FROM users ORDER BY created_at ASC"
  );

  return rows.map(mapUserRow);
}

export async function updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<UserProfile | null> {
  const updates = ["nickname = ?"];
  const params: Array<string | null> = [input.nickname];

  if (Object.prototype.hasOwnProperty.call(input, "avatarUrl")) {
    updates.push("avatar_url = ?");
    params.push(input.avatarUrl ?? null);
  }

  params.push(userId);

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
    params
  );
  if (result.affectedRows === 0) {
    return null;
  }

  return getUserById(userId);
}

export async function deleteUserById(userId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>("DELETE FROM users WHERE id = ?", [userId]);
  return result.affectedRows > 0;
}
