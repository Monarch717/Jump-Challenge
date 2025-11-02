import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    const db = getDb();
    
    // Verify the account exists
    const account = db.prepare('SELECT id, email FROM users WHERE id = ?').get(accountId) as { id: number; email: string } | undefined;

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Create new session for this account
    const sessionToken = await createSession(account.id, account.email);
    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({ success: true, email: account.email });
  } catch (error) {
    console.error('Error switching account:', error);
    return NextResponse.json({ error: 'Failed to switch account' }, { status: 500 });
  }
}

