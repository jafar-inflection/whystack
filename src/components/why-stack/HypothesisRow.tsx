"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { updateHypothesis } from "@/app/actions/hypotheses";
import { computeStatus, STATUS_COLORS } from "./types";

type DropZone = "above" | "center" | "below" | null;

interface HypothesisRowProps {
  hypothesis: HypothesisWithRelations;
  onSelect: () => void;
  isSelected: boolean;
  depth?: number;
  hasChildren?: boolean;
  childCount?: number; // Number of children (for collapsed indicator)
  isChildrenExpanded?: boolean;
  onToggleChildrenExpand?: () => void;
  // Drag and drop
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string, zone: DropZone) => void;
  onDrop?: () => void;
  isDragOver?: boolean;
  dropZone?: DropZone; // Which zone the drag is over
  instanceKey?: string; // Unique key for this instance (for multi-parent support)
  // Chain highlighting
  isInAncestorChain?: boolean; // True if this is an ancestor of the selected item
  isInDescendantChain?: boolean; // True if this is a descendant of the selected item
}

export function HypothesisRow({
  hypothesis,
  onSelect,
  isSelected,
  depth = 0,
  hasChildren = false,
  childCount = 0,
  isChildrenExpanded = false,
  onToggleChildrenExpand,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver = false,
  dropZone = null,
  instanceKey,
  isInAncestorChain = false,
  isInDescendantChain = false,
}: HypothesisRowProps) {
  const router = useRouter();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(hypothesis.statement);
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Update title value when hypothesis changes
  useEffect(() => {
    setTitleValue(hypothesis.statement);
  }, [hypothesis.statement]);

  // Focus the row when it becomes selected (for keyboard navigation)
  useEffect(() => {
    if (isSelected && rowRef.current && document.activeElement !== rowRef.current) {
      // Only focus if not already focused on an input inside the row
      if (!(document.activeElement instanceof HTMLInputElement)) {
        rowRef.current.focus();
      }
    }
  }, [isSelected]);

  // Focus input when entering title edit mode
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const handleRowClick = () => {
    onSelect();
  };

  const handleSaveTitle = async () => {
    if (!titleValue.trim() || titleValue === hypothesis.statement) {
      setTitleValue(hypothesis.statement);
      setIsEditingTitle(false);
      return;
    }
    setSaving(true);
    try {
      await updateHypothesis(hypothesis.id, {
        statement: titleValue.trim(),
        confidence: hypothesis.confidence,
        tags: hypothesis.tags.join(", "),
      });
      router.refresh();
    } finally {
      setSaving(false);
      setIsEditingTitle(false);
    }
  };

  // Compute status based on confidence and activity
  const hasTags = hypothesis.tags && hypothesis.tags.length > 0;
  const status = computeStatus(
    hypothesis.confidence,
    hypothesis.evidence.length,
    hypothesis.refutations.length,
    hypothesis.isArchived,
    hasTags
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditingTitle) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveTitle();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setTitleValue(hypothesis.statement);
        setIsEditingTitle(false);
      }
    } else if (isSelected) {
      if (e.key === "Enter") {
        e.preventDefault();
        setIsEditingTitle(true);
      }
    }
  };

  const INDENT_PER_LEVEL = 16; // Slightly smaller indent to fit more levels
  const leftPadding = depth * INDENT_PER_LEVEL;

  // Determine styling based on selection/chain state
  // Only highlight ancestor chain (parent trace), not descendants
  const isInChain = isInAncestorChain;
  const getBackgroundClass = () => {
    if (isSelected) return "bg-blue-50";
    return "";
  };
  
  // Get left border style for chain highlighting
  const getChainBorderStyle = () => {
    if (isInChain) return "border-l-2 border-l-blue-400";
    return "";
  };

  return (
    <div
      ref={rowRef}
      data-hypothesis-id={hypothesis.id}
      data-instance-key={instanceKey}
      className={`border-b border-gray-100 outline-none ${getBackgroundClass()} ${getChainBorderStyle()}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        // Only call onSelect if not already selected (prevents re-triggering on auto-focus)
        if (!isSelected) {
          onSelect();
        }
      }}
    >
      <div
        className={`group flex items-center gap-1 py-2 px-3 cursor-pointer text-sm transition-colors relative ${
          isDragOver && dropZone === "center" 
            ? "bg-blue-100 ring-2 ring-blue-400 ring-inset" 
            : isDragOver && dropZone === "above"
            ? "border-t-2 border-blue-500"
            : isDragOver && dropZone === "below"
            ? "border-b-2 border-blue-500"
            : ""
        } ${!isSelected && !isDragOver ? "hover:bg-gray-50" : ""}`}
        style={{ paddingLeft: `${12 + leftPadding}px` }}
        onClick={handleRowClick}
        onDoubleClick={() => setIsEditingTitle(true)}
        draggable={!isEditingTitle}
        onDragStart={(e) => {
          if (isEditingTitle) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", hypothesis.id);
          onDragStart?.(hypothesis.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          
          // Detect drop zone based on mouse position
          const rect = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const height = rect.height;
          const edgeThreshold = height * 0.25; // Top/bottom 25% for reorder, middle 50% for reparent
          
          let zone: DropZone;
          if (y < edgeThreshold) {
            zone = "above";
          } else if (y > height - edgeThreshold) {
            zone = "below";
          } else {
            zone = "center";
          }
          
          onDragOver?.(hypothesis.id, zone);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop?.();
        }}
        onDragEnd={() => {
          onDrop?.();
        }}
      >
        {/* Drag handle */}
        <div className="w-4 shrink-0 flex justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing">
          <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        {/* Tree indicator - always show chevron to allow adding children */}
        <div className="w-4 shrink-0 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleChildrenExpand?.();
            }}
            className={`text-gray-400 hover:text-gray-600 ${!hasChildren && !isChildrenExpanded ? 'opacity-40' : ''}`}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isChildrenExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Statement - editable or display */}
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleSaveTitle}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 px-1 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            disabled={saving}
          />
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="truncate text-gray-800">
              {hypothesis.statement}
            </span>
            {/* Descendant count when collapsed */}
            {hasChildren && !isChildrenExpanded && childCount > 0 && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                +{childCount}
              </span>
            )}
          </div>
        )}

        {/* Tags (compact) */}
        {!isEditingTitle && hypothesis.tags.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {hypothesis.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">
                {tag}
              </span>
            ))}
            {hypothesis.tags.length > 2 && (
              <span className="text-[10px] text-gray-400">+{hypothesis.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Pills */}
        {!isEditingTitle && (
          <>
            {/* Only show status badge for non-IN_TESTING statuses */}
            {status !== "IN_TESTING" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[status]} shrink-0`}>
                {status.replace("_", " ")}
              </span>
            )}
            
            {/* Visual confidence indicator - small bar */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full shrink-0 overflow-hidden" title={`${hypothesis.confidence}% confidence`}>
              <div 
                className={`h-full rounded-full transition-all ${
                  hypothesis.confidence >= 75 ? 'bg-green-500' :
                  hypothesis.confidence >= 50 ? 'bg-yellow-500' :
                  hypothesis.confidence >= 25 ? 'bg-orange-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${hypothesis.confidence}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
