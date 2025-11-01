'use server';

import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function getEmailsByCategory(categoryId: number) {
  const session = await getSession();
  if (!session) {
    return [];
  }

  try {
    const db = getDb();
    const emails = db
      .prepare(
        `SELECT id, gmail_id, subject, from_email, from_name, snippet, ai_summary, received_at
         FROM emails 
         WHERE user_id = ? AND category_id = ? 
         ORDER BY received_at DESC`
      )
      .all(session.userId, categoryId);

    return emails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    return [];
  }
}

export async function getEmailById(emailId: number) {
  const session = await getSession();
  if (!session) {
    return null;
  }

  try {
    const db = getDb();
    const email = db
      .prepare('SELECT * FROM emails WHERE id = ? AND user_id = ?')
      .get(emailId, session.userId);

    return email;
  } catch (error) {
    console.error('Error fetching email:', error);
    return null;
  }
}

export async function getUsers() {
  const session = await getSession();
  if (!session) {
    return [];
  }

  try {
    const db = getDb();
    const users = db
      .prepare('SELECT id, email, created_at FROM users WHERE id = ? OR id IN (SELECT DISTINCT user_id FROM categories WHERE user_id = ?)')
      .all(session.userId, session.userId);

    return users;
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

