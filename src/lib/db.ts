import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const dbPath = join(process.cwd(), 'data', 'app.db');

// Ensure data directory exists
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database.Database) {
  // Users table (for multiple Gmail accounts)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER,
      account_group_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (account_group_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  
  // Add account_group_id column if it doesn't exist (migration for existing databases)
  try {
    // Check if column exists by trying to query it
    database.prepare('SELECT account_group_id FROM users LIMIT 1').get();
  } catch {
    // Column doesn't exist, add it
    try {
      database.exec(`ALTER TABLE users ADD COLUMN account_group_id INTEGER`);
    } catch (error: any) {
      // If it still fails, log but don't throw (might be some other issue)
      console.error('Failed to add account_group_id column:', error);
    }
  }

  // Categories table
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Emails table
  database.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      gmail_id TEXT NOT NULL,
      thread_id TEXT,
      subject TEXT,
      from_email TEXT,
      from_name TEXT,
      snippet TEXT,
      ai_summary TEXT,
      body_text TEXT,
      body_html TEXT,
      received_at INTEGER,
      imported_at INTEGER DEFAULT (strftime('%s', 'now')),
      archived BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      UNIQUE(user_id, gmail_id)
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_emails_user_category ON emails(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  `);
}

