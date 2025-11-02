import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { fetchNewEmails, archiveEmail } from '@/lib/gmail';
import { categorizeEmail, summarizeEmail } from '@/lib/ai';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    
    // Get user's categories
    const categories = db
      .prepare('SELECT id, name, description FROM categories WHERE user_id = ?')
      .all(session.userId) as Array<{ id: number; name: string; description: string }>;

    if (categories.length === 0) {
      return NextResponse.json({ 
        error: 'Please create at least one category before importing emails',
        imported: 0 
      });
    }

    // Fetch new emails
    const emails = await fetchNewEmails(session.userId);
    console.log(`Found ${emails.length} new unread emails to process`);
    let importedCount = 0;

    for (const email of emails) {
      console.log(`Processing email: ${email.subject || email.gmailId}`);
      try {
        // Check if email already exists
        const existing = db
          .prepare('SELECT id FROM emails WHERE user_id = ? AND gmail_id = ?')
          .get(session.userId, email.gmailId);

        if (existing) {
          console.log(`Email ${email.gmailId} already imported, skipping`);
          continue;
        }

        // Categorize email using AI and category descriptions
        let categoryId: number | null = null;
        try {
          console.log(`Categorizing email: ${email.subject}`);
          categoryId = await categorizeEmail(
            email.subject || '',
            email.bodyText || email.snippet || '',
            categories
          );
          console.log(`Email categorized into category ID: ${categoryId}`);
        } catch (catError) {
          console.error(`Error categorizing email ${email.gmailId}:`, catError);
          // Continue without category if categorization fails
        }

        // Summarize email using AI
        let summary = 'Unable to generate summary.';
        try {
          console.log(`Summarizing email: ${email.subject}`);
          summary = await summarizeEmail(
            email.subject || '',
            email.bodyText || email.snippet || ''
          );
          console.log(`Summary generated: ${summary.substring(0, 100)}...`);
        } catch (sumError) {
          console.error(`Error summarizing email ${email.gmailId}:`, sumError);
          // Continue with default summary if summarization fails
        }

        // Save email to database
        console.log(`Saving email to database: ${email.subject}`);
        db.prepare(
          `INSERT INTO emails (
            user_id, category_id, gmail_id, thread_id, subject, from_email, from_name,
            snippet, ai_summary, body_text, body_html, received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          session.userId,
          categoryId,
          email.gmailId,
          email.threadId || null,
          email.subject || '',
          email.fromEmail || '',
          email.fromName || '',
          email.snippet || '',
          summary,
          email.bodyText || '',
          email.bodyHtml || '',
          email.receivedAt
        );

        // Archive email in Gmail (remove from INBOX, not delete)
        try {
          console.log(`Archiving email in Gmail: ${email.gmailId}`);
          await archiveEmail(session.userId, email.gmailId);
        } catch (archiveError) {
          console.error(`Error archiving email ${email.gmailId}:`, archiveError);
          // Don't fail the import if archiving fails - email is still saved
        }

        importedCount++;
        console.log(`Successfully imported email: ${email.subject}`);
      } catch (emailError) {
        console.error(`Error processing email ${email.gmailId}:`, emailError);
        // Continue with next email even if this one fails
      }
    }

    return NextResponse.json({ imported: importedCount, total: emails.length });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import emails' }, { status: 500 });
  }
}

