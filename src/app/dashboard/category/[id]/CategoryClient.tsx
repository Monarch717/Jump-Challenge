'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Email {
  id: number;
  gmail_id: string;
  subject: string;
  from_email: string;
  from_name: string;
  snippet: string;
  ai_summary: string;
  received_at: number;
}

interface Category {
  id: number;
  name: string;
  description: string;
}

interface CategoryClientProps {
  category: Category;
  initialEmails: Email[];
}

export default function CategoryClient({ category, initialEmails }: CategoryClientProps) {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [selectedEmails, setSelectedEmails] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  function toggleEmailSelection(emailId: number) {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId);
    } else {
      newSelected.add(emailId);
    }
    setSelectedEmails(newSelected);
  }

  function toggleSelectAll() {
    if (selectedEmails.size === emails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(emails.map((e) => e.id)));
    }
  }

  async function handleDelete() {
    if (selectedEmails.size === 0) return;
    if (!confirm(`Delete ${selectedEmails.size} email(s)?`)) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/emails/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: Array.from(selectedEmails) }),
      });

      if (response.ok) {
        setEmails(emails.filter((e) => !selectedEmails.has(e.id)));
        setSelectedEmails(new Set());
      } else {
        alert('Failed to delete emails');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete emails');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (selectedEmails.size === 0) return;
    if (!confirm(`Unsubscribe from ${selectedEmails.size} email(s)? This will use AI to automatically unsubscribe.`)) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/emails/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: Array.from(selectedEmails) }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(`Successfully unsubscribed from ${data.unsubscribed} email(s)`);
        setSelectedEmails(new Set());
      } else {
        alert(`Error: ${data.error || 'Failed to unsubscribe'}`);
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
      alert('Failed to unsubscribe');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-black dark:text-zinc-50">{category.name}</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{category.description}</p>
        </div>

        {selectedEmails.size > 0 && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-900 dark:text-blue-100">
                {selectedEmails.size} email(s) selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="rounded bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={handleUnsubscribe}
                  disabled={actionLoading}
                  className="rounded bg-orange-600 px-4 py-1.5 text-sm text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  Unsubscribe
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={emails.length > 0 && selectedEmails.size === emails.length}
                onChange={toggleSelectAll}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-black dark:text-zinc-50">Select All</span>
            </label>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {emails.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">No emails in this category yet.</div>
            ) : (
              emails.map((email) => (
                <div
                  key={email.id}
                  className={`flex items-start gap-4 p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                    selectedEmails.has(email.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={() => toggleEmailSelection(email.id)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="flex-1">
                    <Link
                      href={`/dashboard/email/${email.id}`}
                      className="block hover:underline"
                    >
                      <h3 className="font-semibold text-black dark:text-zinc-50">{email.subject || '(No Subject)'}</h3>
                    </Link>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      From: {email.from_name || email.from_email}
                    </p>
                    {email.ai_summary && (
                      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{email.ai_summary}</p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(email.received_at * 1000).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

