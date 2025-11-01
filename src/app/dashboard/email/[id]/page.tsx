import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getEmailById } from '@/app/actions/emails';
import EmailDetailClient from './EmailDetailClient';

export default async function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  const { id } = await params;
  const emailId = parseInt(id, 10);
  if (isNaN(emailId)) {
    redirect('/dashboard');
  }

  const email = await getEmailById(emailId);

  if (!email) {
    redirect('/dashboard');
  }

  return <EmailDetailClient email={email as any} />;
}

