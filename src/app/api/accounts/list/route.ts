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
      .prepare('SELECT id, account_group_id FROM users WHERE id = ?')
      .get(session.userId) as { id: number; account_group_id: number | null } | undefined;

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Determine which accounts belong to this session's group
    // Logic:
    // - If current user has account_group_id, they're part of a group -> show all accounts in that group
    // - If current user has no account_group_id, they might be a group owner -> show owner + all accounts linked to them
    // - Otherwise, show only the current account
    
    let groupOwnerId: number;
    
    if (currentUser.account_group_id) {
      // Current user is a member of a group - use the group owner
      groupOwnerId = currentUser.account_group_id;
    } else {
      // Current user might be a group owner - check if any accounts link to them
      const hasLinkedAccounts = db
        .prepare('SELECT COUNT(*) as count FROM users WHERE account_group_id = ?')
        .get(session.userId) as { count: number } | undefined;
      
      if (hasLinkedAccounts && hasLinkedAccounts.count > 0) {
        // Current user is the group owner
        groupOwnerId = session.userId;
      } else {
        // Standalone account - show only this account
        groupOwnerId = session.userId;
      }
    }
    
    // Get all accounts in this group: the owner + all accounts linked to the owner
    const accounts = db
      .prepare(`
        SELECT id, email, created_at 
        FROM users 
        WHERE id = ? OR account_group_id = ?
        ORDER BY created_at DESC
      `)
      .all(groupOwnerId, groupOwnerId) as Array<{ id: number; email: string; created_at: number }>;

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

