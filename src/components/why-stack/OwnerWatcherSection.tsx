"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  getAllUsers,
  setHypothesisOwner,
  watchHypothesis,
  unwatchHypothesis,
} from "@/app/actions/hypotheses";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface OwnerWatcherSectionProps {
  hypothesisId: string;
  owner: User | null;
  watchers: Array<{ user: User }>;
}

export function OwnerWatcherSection({
  hypothesisId,
  owner,
  watchers,
}: OwnerWatcherSectionProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.name;
  const isWatching = watchers.some((w) => w.user.id === currentUserId);
  const watcherCount = watchers.length;

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowOwnerPicker(false);
      }
    };
    if (showOwnerPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showOwnerPicker]);

  const handleOpenOwnerPicker = async () => {
    if (users.length === 0) {
      setLoadingUsers(true);
      const result = await getAllUsers();
      if (result.ok && result.data) {
        setUsers(result.data);
      }
      setLoadingUsers(false);
    }
    setShowOwnerPicker(true);
  };

  const handleSetOwner = async (userId: string | null) => {
    await setHypothesisOwner(hypothesisId, userId, currentUserId, currentUserName || undefined);
    setShowOwnerPicker(false);
    router.refresh();
  };

  const handleToggleWatch = async () => {
    if (!currentUserId) return;

    if (isWatching) {
      await unwatchHypothesis(hypothesisId, currentUserId);
    } else {
      await watchHypothesis(hypothesisId, currentUserId);
    }
    router.refresh();
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  return (
    <div className="flex items-center gap-4 text-sm">
      {/* Owner */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={handleOpenOwnerPicker}
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
        >
          {owner ? (
            <>
              {owner.image ? (
                <img
                  src={owner.image}
                  alt={owner.name || owner.email}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600">
                  {getInitials(owner.name, owner.email)}
                </div>
              )}
              <span className="text-slate-600 text-xs">
                {owner.name?.split(" ")[0] || owner.email.split("@")[0]}
              </span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-slate-400 text-xs">No owner</span>
            </>
          )}
          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showOwnerPicker && (
          <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 max-h-64 overflow-y-auto">
            {loadingUsers ? (
              <div className="px-3 py-2 text-xs text-slate-400">Loading...</div>
            ) : (
              <>
                <button
                  onClick={() => handleSetOwner(null)}
                  className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Remove owner
                </button>
                <div className="border-t border-slate-100 my-1" />
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSetOwner(user.id)}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                      owner?.id === user.id ? "bg-blue-50" : ""
                    }`}
                  >
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.name || user.email}
                        className="w-5 h-5 rounded-full"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600">
                        {getInitials(user.name, user.email)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 truncate">
                        {user.name || user.email.split("@")[0]}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                    </div>
                    {owner?.id === user.id && (
                      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Watch button */}
      <button
        onClick={handleToggleWatch}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          isWatching
            ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
            : "text-slate-500 hover:bg-slate-100"
        }`}
        title={isWatching ? "Stop watching" : "Watch for updates"}
      >
        <svg
          className="w-4 h-4"
          fill={isWatching ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={isWatching ? 0 : 2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
        {isWatching ? "Watching" : "Watch"}
        {watcherCount > 0 && (
          <span className="text-[10px] text-slate-400">({watcherCount})</span>
        )}
      </button>
    </div>
  );
}
