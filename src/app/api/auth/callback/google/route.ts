import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getDb } from '@/lib/db';
import { createSession, getSession } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  
  // Build redirect URLs using request.nextUrl - more reliable than origin
  const getRedirectUrl = (path: string) => {
    const url = new URL(path, request.nextUrl.origin);
    // If behind a proxy, try to use the actual request URL
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    if (forwardedHost) {
      return new URL(path, `${forwardedProto || 'https'}://${forwardedHost}`);
    }
    return url;
  };

  if (!code) {
    return NextResponse.redirect(getRedirectUrl('/?error=no_code'));
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google'
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(getRedirectUrl('/?error=no_token'));
    }

    // Get user info
    oauth2Client.setCredentials(tokens);
    
    // Wait a moment to ensure tokens are set
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    
    try {
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;
      
      if (!email) {
        console.error('No email in userinfo:', userInfo.data);
        return NextResponse.redirect(getRedirectUrl('/?error=no_email'));
      }
      
      // Check if user is already logged in (adding another account)
      const existingSession = await getSession();
      const isAddingAccount = existingSession !== null;
      
      // Save or update user in database
      const db = getDb();
      let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;

      if (user) {
        // Update existing user
        // If adding account and this user isn't already linked, link them to the current group
        if (isAddingAccount && user.id !== existingSession!.userId) {
          const currentAccountGroupId = existingSession!.userId;
          console.log(`Linking existing account ${email} (ID: ${user.id}) to group ${currentAccountGroupId}`);
          db.prepare(
            'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, account_group_id = ? WHERE id = ?'
          ).run(
            tokens.access_token,
            tokens.refresh_token || null,
            tokens.expiry_date || null,
            currentAccountGroupId,
            user.id
          );
        } else {
          // Just update tokens, don't change group
          db.prepare(
            'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?'
          ).run(
            tokens.access_token,
            tokens.refresh_token || null,
            tokens.expiry_date || null,
            user.id
          );
        }
      } else {
        // Create new user
        // If adding account (session exists), link it to the current session's account group
        // Otherwise, account_group_id is NULL (standalone or group owner)
        const accountGroupId = isAddingAccount ? existingSession!.userId : null;
        
        console.log(`Creating new account: ${email}, account_group_id: ${accountGroupId}, isAddingAccount: ${isAddingAccount}`);
        
        const result = db
          .prepare(
            'INSERT INTO users (email, access_token, refresh_token, token_expires_at, account_group_id) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            email,
            tokens.access_token,
            tokens.refresh_token || null,
            tokens.expiry_date || null,
            accountGroupId
          );
        user = { id: result.lastInsertRowid as number };
        
        console.log(`Created user ID: ${user.id}, linked to group: ${accountGroupId}`);
      }

      // Handle session creation - preserve existing session if adding account
      if (isAddingAccount) {
        // User is already logged in - just add the account, don't switch sessions
        console.log(`Added new account: ${email} (keeping current session for: ${existingSession!.email})`);
        // Return to dashboard with accountAdded flag to trigger reload
        return NextResponse.redirect(getRedirectUrl('/dashboard?accountAdded=true'));
      } else {
        // New login - create session for this account
        const sessionToken = await createSession(user.id, email);
        const cookieStore = await cookies();
        cookieStore.set('session', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/',
        });

        return NextResponse.redirect(getRedirectUrl('/dashboard'));
      }
    } catch (userInfoError: any) {
      console.error('Error getting user info:', userInfoError);
      // If userinfo fails, try to get email from token ID if available
      if (tokens.id_token) {
        // Decode the ID token to get email (simple base64 decode)
        try {
          const parts = tokens.id_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const email = payload.email;
            if (email) {
              // Use the same logic as above to save user
              const db = getDb();
              let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;

              // Check if user is already logged in (adding another account)
              const existingSession = await getSession();
              const isAddingAccount = existingSession !== null;

              if (user) {
                // Update existing user - link to group if adding account
                if (isAddingAccount && user.id !== existingSession!.userId) {
                  const currentAccountGroupId = existingSession!.userId;
                  console.log(`Linking existing account ${email} (ID: ${user.id}) to group ${currentAccountGroupId}`);
                  db.prepare(
                    'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, account_group_id = ? WHERE id = ?'
                  ).run(
                    tokens.access_token,
                    tokens.refresh_token || null,
                    tokens.expiry_date || null,
                    currentAccountGroupId,
                    user.id
                  );
                } else {
                  db.prepare(
                    'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?'
                  ).run(
                    tokens.access_token,
                    tokens.refresh_token || null,
                    tokens.expiry_date || null,
                    user.id
                  );
                }
              } else {
                // Create new user with account_group_id
                const accountGroupId = isAddingAccount ? existingSession!.userId : null;
                const result = db
                  .prepare(
                    'INSERT INTO users (email, access_token, refresh_token, token_expires_at, account_group_id) VALUES (?, ?, ?, ?, ?)'
                  )
                  .run(
                    email,
                    tokens.access_token,
                    tokens.refresh_token || null,
                    tokens.expiry_date || null,
                    accountGroupId
                  );
                user = { id: result.lastInsertRowid as number };
              }

              // Handle session - preserve if adding account
              if (isAddingAccount) {
                console.log(`Added new account: ${email} (keeping current session for: ${existingSession!.email})`);
                return NextResponse.redirect(getRedirectUrl('/dashboard?accountAdded=true'));
              } else {
                const sessionToken = await createSession(user.id, email);
                const cookieStore = await cookies();
                cookieStore.set('session', sessionToken, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax',
                  maxAge: 60 * 60 * 24 * 7,
                  path: '/',
                });

                return NextResponse.redirect(getRedirectUrl('/dashboard'));
              }
            }
          }
        } catch (decodeError) {
          console.error('Error decoding ID token:', decodeError);
        }
      }
      
      return NextResponse.redirect(getRedirectUrl('/?error=auth_failed&details=' + encodeURIComponent(userInfoError.message || 'Unknown error')));
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(getRedirectUrl('/?error=auth_failed'));
  }
}

