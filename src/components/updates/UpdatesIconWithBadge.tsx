"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUnreadActivityCount } from "@/app/actions/activities";

interface UpdatesIconWithBadgeProps {
  userId: string;
}

const LAST_VISIT_KEY = "whystack_updates_last_visit";

export function UpdatesIconWithBadge({ userId }: UpdatesIconWithBadgeProps) {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const checkForNew = async () => {
      // Get last visit time from localStorage
      const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
      const since = lastVisit ? new Date(lastVisit) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days ago

      const result = await getUnreadActivityCount(userId, since);
      if (result.ok && result.data && result.data > 0) {
        setHasNew(true);
      }
    };

    checkForNew();
  }, [userId]);

  const handleClick = () => {
    // Update last visit time when clicking
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    setHasNew(false);
  };

  return (
    <Link
      href="/updates"
      onClick={handleClick}
      className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
      title="Updates"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {hasNew && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </Link>
  );
}
