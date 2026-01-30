"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { computeStatus, STATUS_COLORS, ComputedStatus } from "./types";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  hypotheses: HypothesisWithRelations[];
  onSelect: (id: string) => void;
}

// Status config for badges
const STATUS_CONFIG: Record<ComputedStatus, { icon: string }> = {
  NEW: { icon: "○" },
  IN_TESTING: { icon: "◐" },
  VALIDATED: { icon: "✓" },
  REFUTED: { icon: "✗" },
  ARCHIVED: { icon: "▣" },
};

export function SearchModal({ isOpen, onClose, hypotheses, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter hypotheses based on query
  const filteredHypotheses = useMemo(() => {
    if (!query.trim()) {
      return hypotheses.slice(0, 10); // Show first 10 when no query
    }

    const lowerQuery = query.toLowerCase();
    return hypotheses
      .filter((h) => {
        const matchesStatement = h.statement.toLowerCase().includes(lowerQuery);
        const matchesTags = h.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));
        return matchesStatement || matchesTags;
      })
      .slice(0, 10); // Limit to 10 results
  }, [hypotheses, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredHypotheses.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
      if (selectedElement && typeof selectedElement.scrollIntoView === "function") {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, filteredHypotheses.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredHypotheses.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredHypotheses[selectedIndex]) {
            onSelect(filteredHypotheses[selectedIndex].id);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredHypotheses, selectedIndex, onSelect, onClose]
  );

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <svg
            className="w-5 h-5 text-slate-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hypotheses..."
            className="flex-1 text-base text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 bg-slate-100 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {filteredHypotheses.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No hypotheses found
            </div>
          ) : (
            <div className="py-2">
              {filteredHypotheses.map((hypothesis, index) => {
                const hasTags = hypothesis.tags.length > 0;
                const status = computeStatus(
                  hypothesis.confidence,
                  hypothesis.evidence.length,
                  hypothesis.refutations.length,
                  hypothesis.isArchived,
                  hasTags
                );
                const statusConfig = STATUS_CONFIG[status];
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={hypothesis.id}
                    data-index={index}
                    onClick={() => {
                      onSelect(hypothesis.id);
                      onClose();
                    }}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Status indicator */}
                    <span
                      className={`shrink-0 w-5 h-5 flex items-center justify-center text-xs rounded ${STATUS_COLORS[status]}`}
                    >
                      {statusConfig.icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          isSelected ? "text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {highlightMatch(hypothesis.statement, query)}
                      </p>
                      {hypothesis.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {hypothesis.tags.slice(0, 3).map((tag, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {hypothesis.tags.length > 3 && (
                            <span className="text-[10px] text-slate-400">
                              +{hypothesis.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Confidence */}
                    <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                      {hypothesis.confidence}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

// Highlight matching text in results
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-yellow-200 text-inherit rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}
