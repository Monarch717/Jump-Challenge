'use client';

import Link from 'next/link';

interface Email {
  id: number;
  subject: string;
  from_email: string;
  from_name: string;
  snippet: string;
  ai_summary: string;
  body_text: string;
  body_html: string;
  received_at: number;
  category_id: number;
}

interface EmailDetailClientProps {
  email: Email;
}

export default function EmailDetailClient({ email }: EmailDetailClientProps) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/dashboard/category/${email.category_id}`}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to Category
        </Link>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {email.subject || '(No Subject)'}
          </h1>

          <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="font-medium">From:</span> {email.from_name || email.from_email}
            </p>
            <p>
              <span className="font-medium">Date:</span>{' '}
              {new Date(email.received_at * 1000).toLocaleString()}
            </p>
          </div>

          {email.ai_summary && (
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <h2 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">AI Summary</h2>
              <p className="text-blue-800 dark:text-blue-200">{email.ai_summary}</p>
            </div>
          )}

          <div className="mt-6">
            <h2 className="mb-4 font-semibold text-black dark:text-zinc-50">Email Content</h2>
            {email.body_html ? (
              <div
                className="prose max-w-none text-black dark:text-zinc-50"
                dangerouslySetInnerHTML={{ __html: email.body_html }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-black dark:text-zinc-50">
                {email.body_text || email.snippet}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

