import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteEmail } from '@/lib/gmail';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailIds } = await request.json();

    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json({ error: 'Invalid email IDs' }, { status: 400 });
    }

    const db = getDb();
    let deletedCount = 0;

    for (const emailId of emailIds) {
      // Get email info
      const email = db
        .prepare('SELECT gmail_id FROM emails WHERE id = ? AND user_id = ?')
        .get(emailId, session.userId) as { gmail_id: string } | undefined;

      if (!email) {
        continue;
      }

      try {
        // Try to delete from Gmail
        const deletedInGmail = await deleteEmail(session.userId, email.gmail_id);
        
        // Delete from database regardless of Gmail deletion result
        // (If email doesn't exist in Gmail anymore, we still want to remove it from our DB)
        db.prepare('DELETE FROM emails WHERE id = ? AND user_id = ?').run(emailId, session.userId);
        deletedCount++;
        
        if (!deletedInGmail) {
          console.log(`Email ${emailId} removed from database but was not found in Gmail (may have been already deleted)`);
        }
      } catch (error: any) {
        console.error(`Error deleting email ${emailId}:`, error);
        // Even if Gmail deletion fails, remove from our database if it's a 404
        // (email doesn't exist in Gmail)
        if (error.code === 404) {
          db.prepare('DELETE FROM emails WHERE id = ? AND user_id = ?').run(emailId, session.userId);
          deletedCount++;
        }
      }
    }

    return NextResponse.json({ deleted: deletedCount });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete emails' }, { status: 500 });
  }
}

