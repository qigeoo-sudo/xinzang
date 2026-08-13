'use client';

import { useState } from 'react';
import type { KnowledgeEntry } from '@/lib/mentors';

const COLLAPSED_COUNT = 3;

export function KnowledgePanel({ entries }: { entries: KnowledgeEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = entries.length > COLLAPSED_COUNT;
  const visibleEntries = expanded
    ? entries
    : entries.slice(0, COLLAPSED_COUNT);

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-ink mb-3">
        导师知识领域
      </h2>
      <div className="space-y-3">
        {visibleEntries.map((entry, i) => (
          <div key={i} className="card">
            <h3 className="text-sm font-medium text-accent mb-1">
              {entry.category}
            </h3>
            <p className="text-xs text-muted leading-relaxed line-clamp-3">
              {entry.content}
            </p>
          </div>
        ))}
      </div>

      {/* 折叠/展开按钮 */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted hover:text-accent transition-colors"
        >
          {expanded ? (
            <>
              <span>收起</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </>
          ) : (
            <>
              <span>展开全部 ({entries.length})</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}
