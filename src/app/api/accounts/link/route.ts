import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

/**
 * API endpoint to auto-link unlinked accounts in the same browser session
 * This is a repair/migration utility for accounts that were added before linking logic
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    
    // Get current user
    const currentUser = db
      .prepare('SELECT id, email, account_group_id FROM users WHERE id = ?')
      .get(session.userId) as { id: number; email: string; account_group_id: number | null } | undefined;

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If current user is already a member of a group, don't do anything
    if (currentUser.account_group_id) {
      return NextResponse.json({ message: 'User is already in a group', linked: 0 });
    }

    // Find all other users with no account_group_id (standalone accounts)
    // In a real scenario, we might want to link based on session cookies or other criteria
    // For now, this is a manual repair - we'll link accounts that the user selects
    
    // For auto-linking: We could link accounts created within a certain timeframe
    // But that's risky - let's just return available accounts for manual linking
    
    const standaloneAccounts = db
      .prepare(`
        SELECT id, email, created_at 
        FROM users 
        WHERE id != ? AND account_group_id IS NULL
        ORDER BY created_at DESC
      `)
      .all(session.userId) as Array<{ id: number; email: string; created_at: number }>;

    return NextResponse.json({ 
      availableAccounts: standaloneAccounts,
      currentUser: { id: currentUser.id, email: currentUser.email }
    });
  } catch (error) {
    console.error('Error checking linkable accounts:', error);
    return NextResponse.json({ error: 'Failed to check accounts' }, { status: 500 });
  }
}

/**
 * Link a specific account to the current user's group
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId || typeof accountId !== 'number') {
      return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 });
    }

    const db = getDb();
    
    // Get current user
    const currentUser = db
      .prepare('SELECT id, account_group_id FROM users WHERE id = ?')
      .get(session.userId) as { id: number; account_group_id: number | null } | undefined;

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Determine the group owner ID
    const groupOwnerId = currentUser.account_group_id || session.userId;

    // Check if account exists
    const targetAccount = db
      .prepare('SELECT id, email, account_group_id FROM users WHERE id = ?')
      .get(accountId) as { id: number; email: string; account_group_id: number | null } | undefined;

    if (!targetAccount) {
      return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
    }

    if (targetAccount.id === session.userId) {
      return NextResponse.json({ error: 'Cannot link account to itself' }, { status: 400 });
    }

    // Link the account
    db.prepare('UPDATE users SET account_group_id = ? WHERE id = ?')
      .run(groupOwnerId, accountId);

    console.log(`Linked account ${targetAccount.email} (ID: ${accountId}) to group ${groupOwnerId}`);

    return NextResponse.json({ 
      success: true,
      message: `Account ${targetAccount.email} linked successfully`
    });
  } catch (error) {
    console.error('Error linking account:', error);
    return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
  }
}
