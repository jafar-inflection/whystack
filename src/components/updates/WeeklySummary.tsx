"use client";

import { useState, useEffect } from "react";
import { generateWeeklySummary } from "@/app/actions/activities";

interface WeeklySummaryProps {
  userId: string;
}

export function WeeklySummary({ userId }: WeeklySummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      setError(null);

      const result = await generateWeeklySummary(userId);

      if (result.ok && result.data) {
        setSummary(result.data);
      } else {
        setError(result.error || "Failed to generate summary");
      }

      setLoading(false);
    };

    loadSummary();
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-violet-900">Generating weekly summary...</h3>
        </div>
        <div className="h-20 bg-violet-100/50 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-100 p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-violet-900">Past week</h3>
          <p className="text-xs text-violet-600">AI-generated summary</p>
        </div>
      </div>
      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {summary}
      </div>
    </div>
  );
}
