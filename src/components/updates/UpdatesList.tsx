"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearActivitiesForUser, ActivityGroup } from "@/app/actions/activities";

const LAST_VISIT_KEY = "whystack_updates_last_visit";

interface UpdatesListProps {
  activityGroups: ActivityGroup[];
  userId: string;
}

// Helper to format activity type for display
function formatActivityType(type: string): string {
  const typeMap: Record<string, string> = {
    HYPOTHESIS_CREATED: "created",
    HYPOTHESIS_UPDATED: "updated",
    CONFIDENCE_CHANGED: "changed confidence on",
    EVIDENCE_ADDED: "added evidence to",
    EVIDENCE_UPDATED: "updated evidence on",
    TAGS_CHANGED: "updated tags on",
    OWNER_CHANGED: "reassigned",
    CHILD_ADDED: "linked sub-hypothesis to",
    HYPOTHESIS_ARCHIVED: "archived",
    HYPOTHESIS_DELETED: "deleted sub-hypothesis from",
  };
  return typeMap[type] || "modified";
}

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split("T")[0]) {
    return "Today";
  }
  if (dateStr === yesterday.toISOString().split("T")[0]) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// Helper to format time
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Helper to get initials
function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UpdatesList({ activityGroups, userId }: UpdatesListProps) {
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  // Record last visit time when component mounts
  useEffect(() => {
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  }, []);

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "Clear all updates? This cannot be undone."
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      await clearActivitiesForUser(userId);
      router.refresh();
    } finally {
      setClearing(false);
    }
  };

  if (activityGroups.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-1">No updates yet</h3>
        <p className="text-sm text-slate-500">
          When others make changes to hypotheses you own or watch, you&apos;ll see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clear all button */}
      <div className="flex justify-end">
        <button
          onClick={handleClearAll}
          disabled={clearing}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
        >
          {clearing ? "Clearing..." : "Clear all updates"}
        </button>
      </div>

      {activityGroups.map((group) => (
        <div key={group.date}>
          <h2 className="text-sm font-medium text-slate-500 mb-3">
            {formatDate(group.date)}
          </h2>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {group.activities.map((activity) => (
              <Link
                key={activity.id}
                href={`/hypotheses?selected=${activity.hypothesisId}`}
                className="block p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Actor avatar */}
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-medium text-violet-600 shrink-0">
                    {getInitials(activity.actorName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium text-slate-900">
                        {activity.actorName || "Someone"}
                      </span>{" "}
                      {formatActivityType(activity.type)}{" "}
                      <span className="font-medium text-violet-700">
                        {activity.hypothesis.statement.length > 60
                          ? activity.hypothesis.statement.slice(0, 60) + "..."
                          : activity.hypothesis.statement}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatTime(activity.createdAt)}
                    </p>
                  </div>

                  {/* Activity type icon */}
                  <div className="shrink-0 text-slate-400">
                    {activity.type === "EVIDENCE_ADDED" || activity.type === "EVIDENCE_UPDATED" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    ) : activity.type === "CONFIDENCE_CHANGED" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    ) : activity.type === "CHILD_ADDED" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
