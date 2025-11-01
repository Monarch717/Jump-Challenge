import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCategories } from '../actions/categories';
import DashboardClient from './DashboardClient';

export default async function Dashboard() {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const categories = await getCategories();

  return <DashboardClient initialCategories={categories as any} userEmail={session.email} />;
}

