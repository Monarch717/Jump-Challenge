import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    
    // Get current user to determine account group
    const currentUser = db
      .prepare('SELECT id, email, account_group_id FROM users WHERE id = ?')
      .get(session.userId) as { id: number; email: string; account_group_id: number | null } | undefined;

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('Current user:', { id: currentUser.id, email: currentUser.email, account_group_id: currentUser.account_group_id });

    // Determine which accounts belong to this browser session's group
    // Logic:
    // - If current user has account_group_id, they're a MEMBER of a group -> show group owner + all members
    // - If current user has no account_group_id, they might be a GROUP OWNER -> show owner + all accounts linked to them
    // - Otherwise, standalone account -> show only this account
    
    let groupOwnerId: number;
    
    if (currentUser.account_group_id) {
      // Current user is a MEMBER of a group - the group owner is account_group_id
      groupOwnerId = currentUser.account_group_id;
      console.log(`User is a member of group owned by user ID: ${groupOwnerId}`);
    } else {
      // Current user might be a GROUP OWNER - check if any accounts link to them
      const linkedAccounts = db
        .prepare('SELECT id, email FROM users WHERE account_group_id = ?')
        .all(session.userId) as Array<{ id: number; email: string }>;
      
      console.log(`User is standalone/owner. Linked accounts:`, linkedAccounts);
      
      if (linkedAccounts.length > 0) {
        // Current user is the group owner
        groupOwnerId = session.userId;
        console.log(`User is group owner with ${linkedAccounts.length} linked accounts`);
      } else {
        // Standalone account - show only this account
        groupOwnerId = session.userId;
        console.log(`User is standalone (no linked accounts)`);
      }
    }
    
    // Get all accounts in this group: the owner + all accounts linked to the owner
    const accounts = db
      .prepare(`
        SELECT id, email, created_at, account_group_id
        FROM users 
        WHERE id = ? OR account_group_id = ?
        ORDER BY created_at DESC
      `)
      .all(groupOwnerId, groupOwnerId) as Array<{ id: number; email: string; created_at: number; account_group_id: number | null }>;

    console.log(`Found ${accounts.length} accounts in group (owner ID: ${groupOwnerId}):`, accounts.map(a => ({ id: a.id, email: a.email, account_group_id: a.account_group_id })));

    return NextResponse.json({ accounts: accounts.map(a => ({ id: a.id, email: a.email, created_at: a.created_at })) });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

