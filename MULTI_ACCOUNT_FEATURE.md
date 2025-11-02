# Multi-Account Gmail Feature

## What Was Implemented

You now have support for connecting and switching between **multiple Gmail accounts** without losing access to any connected accounts.

## How It Works

### 1. **Account Management**
- All Gmail accounts are stored in the `users` table in your database
- Each account has its own access tokens, categories, and emails
- You can have as many Gmail accounts connected as needed

### 2. **Connect Another Account**
When you click "Connect Another Account":
1. You're taken to the Google OAuth login page
2. You sign in with a different Gmail account
3. That account is saved to your database
4. The system creates a session for that new account and switches to it

### 3. **Switch Between Accounts**
The dashboard now shows:
- **Currently active account** (highlighted in green with ✓)
- **All other connected accounts** (in gray, clickable)
- Click any account to switch to it instantly

### 4. **Account-Specific Data**
Each account has its own:
- Categories
- Emails
- Import history
- Settings

When you switch accounts, you see only that account's data.

## New Files Created

### API Routes
- `src/app/api/accounts/list/route.ts` - Lists all connected Gmail accounts
- `src/app/api/accounts/switch/route.ts` - Switches active account

### Modified Files
- `src/app/dashboard/DashboardClient.tsx` - UI for account switching
- `src/app/page.tsx` - Allows OAuth when already logged in
- `src/app/api/auth/callback/google/route.ts` - Fixed redirect URIs

## Usage

### Connect Your First Account
1. Sign in with Google from the home page
2. Authorize the Gmail scopes
3. Start creating categories and importing emails

### Add Another Gmail Account
1. Go to Dashboard
2. Click "+ Connect Another Account" button
3. Sign in with another Gmail address
4. New account is immediately active

### Switch Between Accounts
1. View all connected accounts in the "Gmail Accounts" section
2. Click any account email to switch to it
3. Dashboard refreshes with that account's data

## Technical Details

### Database Schema
```sql
users table:
- id (PRIMARY KEY)
- email (UNIQUE)
- access_token
- refresh_token
- token_expires_at
- created_at
```

### Session Management
- Each session is tied to one user account
- Switching accounts creates a new session
- Old sessions remain valid but inactive
- Sessions expire after 7 days

### OAuth Flow
1. User initiates login from home page or dashboard
2. Google OAuth redirects back with authorization code
3. Server exchanges code for access/refresh tokens
4. Server saves/updates user in database
5. Server creates session and redirects to dashboard
6. Dashboard loads categories and emails for that account

## User Experience

### First Time User
1. Visit homepage → Sign in with Google
2. Create categories
3. Import emails

### Adding More Accounts
1. Click "Connect Another Account"
2. Sign in with different Gmail
3. Automatically switched to new account
4. Create categories for this account
5. Import emails for this account

### Daily Usage
1. Launch app
2. See current active account
3. Switch between accounts as needed
4. Manage each account independently

## Benefits

✅ **No data loss** - All connected accounts remain in database
✅ **Easy switching** - One click to change accounts
✅ **Independent data** - Each account has its own categories
✅ **Persistent storage** - Accounts stay connected until manually removed
✅ **Secure tokens** - Each account has its own OAuth tokens

## Limitations

- One account active at a time (can't view multiple inboxes simultaneously)
- Emails only sync from the currently active account
- Switching accounts requires a page reload

## Future Enhancements

Potential improvements:
- Delete/disconnect accounts
- Bulk import across all accounts
- Unified inbox view
- Account-specific settings
- Auto-sync all accounts
- Import from specific account regardless of active session

## Testing

To test the feature:
1. Start with one Gmail account
2. Create some categories and import emails
3. Click "Connect Another Account"
4. Sign in with a different Gmail
5. Verify you see the new account's dashboard
6. Create categories for the new account
7. Switch back to the first account
8. Verify original data is still there
9. Switch between accounts multiple times

## Troubleshooting

**Can't see accounts list?**
- Check `/api/accounts/list` endpoint
- Verify database has `users` table
- Check browser console for errors

**Account switch not working?**
- Check `/api/accounts/switch` endpoint
- Verify session cookie is being set
- Check database has the target user

**OAuth redirect errors?**
- See `GOOGLE_CLOUD_SETUP.md`
- Verify redirect URI is registered in Google Cloud Console
- Check environment variables are correct

## Summary

You now have a complete multi-account Gmail management system! Each account is independent with its own categories, emails, and settings. Users can easily switch between accounts without losing data.

