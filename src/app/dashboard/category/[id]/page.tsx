import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getEmailsByCategory } from '@/app/actions/emails';
import { getDb } from '@/lib/db';
import CategoryClient from './CategoryClient';

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const { id } = await params;
  const categoryId = parseInt(id, 10);
  if (isNaN(categoryId)) {
    redirect('/dashboard');
  }

  // Get category info
  const db = getDb();
  const category = db
    .prepare('SELECT id, name, description FROM categories WHERE id = ? AND user_id = ?')
    .get(categoryId, session.userId) as { id: number; name: string; description: string } | undefined;

  if (!category) {
    redirect('/dashboard');
  }

  const emails = await getEmailsByCategory(categoryId);

  return <CategoryClient category={category} initialEmails={emails as any} />;
}

