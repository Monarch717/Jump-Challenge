import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getDb } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google'
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(new URL('/?error=no_token', request.url));
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
        return NextResponse.redirect(new URL('/?error=no_email', request.url));
      }
      
      // Save or update user in database
      const db = getDb();
      let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;

      if (user) {
        // Update existing user
        db.prepare(
          'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?'
        ).run(
          tokens.access_token,
          tokens.refresh_token || null,
          tokens.expiry_date || null,
          user.id
        );
      } else {
        // Create new user
        const result = db
          .prepare(
            'INSERT INTO users (email, access_token, refresh_token, token_expires_at) VALUES (?, ?, ?, ?)'
          )
          .run(
            email,
            tokens.access_token,
            tokens.refresh_token || null,
            tokens.expiry_date || null
          );
        user = { id: result.lastInsertRowid as number };
      }

      // Create session
      const sessionToken = await createSession(user.id, email);
      const cookieStore = await cookies();
      cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      return NextResponse.redirect(new URL('/dashboard', request.url));
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

              if (user) {
                db.prepare(
                  'UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?'
                ).run(
                  tokens.access_token,
                  tokens.refresh_token || null,
                  tokens.expiry_date || null,
                  user.id
                );
              } else {
                const result = db
                  .prepare(
                    'INSERT INTO users (email, access_token, refresh_token, token_expires_at) VALUES (?, ?, ?, ?)'
                  )
                  .run(
                    email,
                    tokens.access_token,
                    tokens.refresh_token || null,
                    tokens.expiry_date || null
                  );
                user = { id: result.lastInsertRowid as number };
              }

              const sessionToken = await createSession(user.id, email);
              const cookieStore = await cookies();
              cookieStore.set('session', sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
              });

              return NextResponse.redirect(new URL('/dashboard', request.url));
            }
          }
        } catch (decodeError) {
          console.error('Error decoding ID token:', decodeError);
        }
      }
      
      return NextResponse.redirect(new URL('/?error=auth_failed&details=' + encodeURIComponent(userInfoError.message || 'Unknown error'), request.url));
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}

