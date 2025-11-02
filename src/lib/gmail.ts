import { google } from 'googleapis';
import { getDb } from './db';

export async function getGmailClient(userId: number) {
  const db = getDb();
  const user = db.prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(userId) as {
    access_token: string;
    refresh_token: string | null;
  } | undefined;

  if (!user) {
    throw new Error('User not found');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token || undefined,
  });

  // Refresh token if needed
  try {
    await oauth2Client.getAccessToken();
  } catch (error) {
    // Token refresh logic would go here
    console.error('Token refresh error:', error);
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function fetchNewEmails(userId: number) {
  const gmail = await getGmailClient(userId);
  const db = getDb();

  // Fetch unread emails
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 50,
  });

  const messages = response.data.messages || [];
  const emails = [];

  for (const message of messages) {
    if (!message.id) continue;

    try {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });

      const msg = fullMessage.data;
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      let bodyText = '';
      let bodyHtml = '';

      const extractBody = (part: any): void => {
        if (part.body?.data) {
          const data = Buffer.from(part.body.data, 'base64').toString();
          if (part.mimeType === 'text/plain') {
            bodyText += data;
          } else if (part.mimeType === 'text/html') {
            bodyHtml += data;
          }
        }
        if (part.parts) {
          part.parts.forEach(extractBody);
        }
      };

      if (msg.payload) {
        extractBody(msg.payload);
      }

      emails.push({
        gmailId: message.id,
        threadId: msg.threadId,
        subject: getHeader('Subject'),
        fromEmail: getHeader('From')?.match(/<(.+)>/)?.[1] || getHeader('From') || '',
        fromName: getHeader('From')?.replace(/<.+>/, '').trim() || getHeader('From') || '',
        snippet: msg.snippet || '',
        bodyText,
        bodyHtml,
        receivedAt: msg.internalDate ? Math.floor(parseInt(msg.internalDate) / 1000) : Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error(`Error fetching message ${message.id}:`, error);
    }
  }

  return emails;
}

export async function archiveEmail(userId: number, gmailId: string) {
  const gmail = await getGmailClient(userId);
  
  await gmail.users.messages.modify({
    userId: 'me',
    id: gmailId,
    requestBody: {
      removeLabelIds: ['INBOX'],
      addLabelIds: [],
    },
  });
}

export async function deleteEmail(userId: number, gmailId: string): Promise<boolean> {
  const gmail = await getGmailClient(userId);
  
  try {
    // First, try to check if the message exists by getting it
    try {
      await gmail.users.messages.get({
        userId: 'me',
        id: gmailId,
        format: 'metadata',
      });
    } catch (checkError: any) {
      // If message doesn't exist (404), it's already deleted or doesn't exist
      if (checkError.code === 404) {
        console.log(`Email ${gmailId} not found in Gmail (may already be deleted)`);
        return false; // Email doesn't exist, consider it "deleted" for our purposes
      }
      throw checkError;
    }

    // Try to delete (permanently delete)
    try {
      await gmail.users.messages.delete({
        userId: 'me',
        id: gmailId,
      });
      return true;
    } catch (deleteError: any) {
      // If delete fails, try to trash it instead (soft delete)
      if (deleteError.code === 404) {
        console.log(`Email ${gmailId} not found for deletion`);
        return false;
      }
      
      // Try trash as fallback
      try {
        await gmail.users.messages.trash({
          userId: 'me',
          id: gmailId,
        });
        return true;
      } catch (trashError: any) {
        if (trashError.code === 404) {
          console.log(`Email ${gmailId} not found for trashing`);
          return false;
        }
        throw trashError;
      }
    }
  } catch (error: any) {
    console.error(`Error deleting email ${gmailId}:`, error);
    // If it's a 404, the email doesn't exist - that's okay, we can still remove it from DB
    if (error.code === 404) {
      return false;
    }
    throw error;
  }
}

export async function getUnsubscribeLink(emailHtml: string): Promise<string | null> {
  if (!emailHtml) return null;

  // Extract unsubscribe link from email HTML - try multiple patterns
  const patterns = [
    // Link with unsubscribe in href
    /<a[^>]*href=["']([^"']*unsubscribe[^"']*)["'][^>]*>/i,
    // Link with unsubscribe in text
    /<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?unsubscribe/i,
    // List-unsubscribe header format (mailto: or http)
    /(?:list-unsubscribe|unsubscribe)[\s:]*<?([^\s>]+)>?/i,
    // Direct URL in text
    /(https?:\/\/[^\s"']*unsubscribe[^\s"']*)/i,
  ];

  for (const pattern of patterns) {
    const match = emailHtml.match(pattern);
    if (match) {
      const url = match[1] || match[0];
      // Clean up the URL
      let cleanUrl = url.replace(/["'<>]/g, '').trim();
      // Handle mailto: links - we'll need special handling for these
      if (cleanUrl.startsWith('mailto:')) {
        // Extract unsubscribe URL from mailto body if present
        const urlMatch = cleanUrl.match(/[?&]body=([^&]+)/);
        if (urlMatch) {
          cleanUrl = decodeURIComponent(urlMatch[1]);
        } else {
          continue; // Skip mailto links without URL in body
        }
      }
      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        return cleanUrl;
      }
    }
  }

  return null;
}

