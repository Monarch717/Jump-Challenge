'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Category {
  id: number;
  name: string;
  description: string;
  created_at: number;
}

interface DashboardClientProps {
  initialCategories: Category[];
  userEmail: string;
}

interface GmailAccount {
  id: number;
  email: string;
  created_at: number;
}

export default function DashboardClient({ initialCategories, userEmail }: DashboardClientProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Load connected accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const response = await fetch('/api/accounts/list');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setCategories([...categories, { id: data.id, name, description, created_at: Date.now() }]);
        setName('');
        setDescription('');
        setShowAddForm(false);
      } else {
        alert('Failed to create category');
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportEmails() {
    setImporting(true);
    setImportResult(null);
    try {
      const response = await fetch('/api/emails/import', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        setImportResult(`Imported ${data.imported} emails (${data.total} total found)`);
      } else {
        setImportResult(`Error: ${data.error || 'Failed to import emails'}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportResult('Failed to import emails');
    } finally {
      setImporting(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  async function handleSwitchAccount(accountId: number) {
    try {
      const response = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      
      if (response.ok) {
        // Reload page to refresh dashboard with new account
        window.location.reload();
      } else {
        const data = await response.json();
        alert(`Failed to switch account: ${data.error}`);
      }
    } catch (error) {
      console.error('Error switching account:', error);
      alert('Failed to switch account');
    }
  }

  async function handleConnectAnotherAccount() {
    // Instead of logging out, we'll open OAuth in a popup
    // For now, just redirect to home page where they can sign in
    // The OAuth callback will add the account without switching
    router.push('/?addAccount=true');
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">AI Email Sorter</h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Connect Gmail Accounts Section */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
              Gmail Accounts
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Currently active: {userEmail}
            </p>
            {loadingAccounts ? (
              <p className="text-sm text-zinc-500">Loading accounts...</p>
            ) : accounts.length > 0 ? (
              <div className="space-y-2 mb-4">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => handleSwitchAccount(account.id)}
                    className={`w-full rounded-lg px-3 py-2 text-sm transition-colors ${
                      account.email === userEmail
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 cursor-default'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                    disabled={account.email === userEmail}
                  >
                    {account.email === userEmail && '✓ '}
                    {account.email}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 mb-4">No accounts connected</p>
            )}
            <button
              onClick={handleConnectAnotherAccount}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              + Connect Another Account
            </button>
          </div>

          {/* Categories Section */}
          <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Categories</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
              >
                {showAddForm ? 'Cancel' : '+ Add Category'}
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleCreateCategory} className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-black dark:text-zinc-50">
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                    placeholder="e.g., Work, Personal, Shopping"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-black dark:text-zinc-50">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                    placeholder="Describe what types of emails should go into this category..."
                    rows={3}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Category'}
                </button>
              </form>
            )}

            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="py-8 text-center text-zinc-500">No categories yet. Create one to get started!</p>
              ) : (
                categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/dashboard/category/${category.id}`}
                    className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <h3 className="font-semibold text-black dark:text-zinc-50">{category.name}</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{category.description}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Import Emails Section */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
            Import Emails
          </h2>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Import new emails from Gmail. They will be automatically categorized using AI based on your category descriptions.
          </p>
          <button
            onClick={handleImportEmails}
            disabled={importing || categories.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import New Emails'}
          </button>
          {importResult && (
            <p className={`mt-4 text-sm ${importResult.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {importResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

