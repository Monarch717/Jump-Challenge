'use server';

import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createCategory(name: string, description: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  try {
    const db = getDb();
    const result = db
      .prepare('INSERT INTO categories (user_id, name, description) VALUES (?, ?, ?)')
      .run(session.userId, name, description);

    revalidatePath('/dashboard');
    return { success: true, id: result.lastInsertRowid };
  } catch (error) {
    console.error('Error creating category:', error);
    return { error: 'Failed to create category' };
  }
}

export async function getCategories() {
  const session = await getSession();
  if (!session) {
    return [];
  }

  try {
    const db = getDb();
    const categories = db
      .prepare('SELECT id, name, description, created_at FROM categories WHERE user_id = ? ORDER BY created_at DESC')
      .all(session.userId);

    return categories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export async function deleteCategory(categoryId: number) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  try {
    const db = getDb();
    db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(categoryId, session.userId);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting category:', error);
    return { error: 'Failed to delete category' };
  }
}

