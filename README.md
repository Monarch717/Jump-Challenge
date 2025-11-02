# AI Email Sorter

An intelligent email organization app that automatically categorizes and summarizes Gmail emails using AI, powered by Next.js, OpenRouter/OpenAI, and Gmail API.

## Features

- 🔐 **Google OAuth Authentication** - Sign in with your Google account
- 📧 **Gmail Integration** - Connect multiple Gmail accounts
- 🤖 **AI-Powered Categorization** - Automatically sort emails into custom categories using AI
- 📝 **AI Summarization** - Get concise summaries of each email
- 🗂️ **Custom Categories** - Create categories with descriptions to guide AI sorting
- 📦 **Bulk Actions** - Delete or unsubscribe from multiple emails at once
- 🤖 **AI Unsubscribe Agent** - Automatically unsubscribe using AI to navigate unsubscribe pages
- 📊 **Category Views** - Browse emails by category with AI summaries
- 🗃️ **Auto-Archive** - Emails are automatically archived in Gmail after import

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- A Google Cloud Project with Gmail API enabled
- An OpenRouter API key (or OpenAI API key)

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen:
   - User Type: External (for testing)
   - Add your email as a test user (required for apps with Gmail scopes)
   - Add scopes: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.modify`
6. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback` (add your production URL for deployment)
7. Copy the Client ID and Client Secret

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
# Google OAuth Credentials
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# OpenRouter API Key (for AI categorization and summarization)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_HTTP_REFERER=http://localhost:3000

# JWT Secret (generate a random string)
JWT_SECRET=your_random_secret_key_here
```

**Important**: For Gmail scopes, you must add your email address as a test user in the Google Cloud Console under "OAuth consent screen" → "Test users". Apps with email scopes require a security review for production use, which can take weeks.

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign In**: Click "Sign in with Google" and authorize the app
2. **Create Categories**: Add categories with names and descriptions (e.g., "Work", "Shopping", "Newsletters")
3. **Import Emails**: Click "Import New Emails" to fetch and categorize unread emails
4. **View Categories**: Click on any category to see emails with AI summaries
5. **Manage Emails**: Select emails and use bulk actions to delete or unsubscribe
6. **Read Emails**: Click on any email to read the full content

## How It Works

1. **Authentication**: Uses Google OAuth 2.0 with Gmail API scopes
2. **Email Fetching**: Fetches unread emails from Gmail API
3. **AI Categorization**: Uses AI (via OpenRouter) to match emails to categories based on category descriptions
4. **AI Summarization**: Generates 2-3 sentence summaries of each email
5. **Auto-Archive**: Archives emails in Gmail after successful import
6. **AI Unsubscribe**: Uses Puppeteer + AI (via OpenRouter) to navigate unsubscribe pages and complete forms

## Technology Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **SQLite (better-sqlite3)** - Local database for categories and emails
- **Google APIs** - Gmail API integration
- **OpenRouter/OpenAI API** - AI categorization and summarization (via OpenRouter)
- **Puppeteer** - Browser automation for unsubscribe functionality
- **Tailwind CSS** - Styling

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes for auth, emails, categories
│   ├── dashboard/         # Main dashboard and category/email views
│   └── page.tsx          # Landing page with sign-in
├── lib/
│   ├── ai.ts             # AI integration (OpenRouter)
│   ├── auth.ts           # Session management
│   ├── db.ts             # Database setup
│   └── gmail.ts          # Gmail API integration
└── actions/              # Server actions
```

## Database

The app uses SQLite to store:
- Users (Gmail accounts)
- Categories (custom categories with descriptions)
- Emails (imported emails with AI summaries)

Database file: `data/app.db` (created automatically)

## Notes

- The app is designed for development/testing. For production, you'll need:
  - Google OAuth security review (for Gmail scopes)
  - Proper error handling and logging
  - Rate limiting for API calls
  - Database backups
  - Environment-specific configurations

## Testing

1. Ensure your Gmail account is added as a test user in Google Cloud Console
2. Sign in and create at least one category
3. Import emails to test categorization
4. Test bulk actions (delete, unsubscribe)
5. Verify emails are archived in Gmail

## License

MIT
