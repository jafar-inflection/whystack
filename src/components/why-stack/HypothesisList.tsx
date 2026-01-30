"use client";

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { reorderHypotheses, moveHypothesisToParent } from "@/app/actions/hypotheses";

type DropZone = "above" | "center" | "below" | null;
import { HypothesisRow } from "./HypothesisRow";

export interface HypothesisListHandle {
  focus: () => void;
  expandToHypothesis: (hypothesisId: string) => void;
}

interface HypothesisListProps {
  hypotheses: HypothesisWithRelations[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  isAddingNew: boolean;
  addingParentId: string | null;
  onAddNew: (parentId: string | null) => void;
  onTabToDetail?: () => void;
  isFocused?: boolean;
  // Highlighted add row (visually selected but not yet activated)
  highlightedAddParentId?: string | null;
  onHighlightAdd?: (parentId: string | null) => void;
  // Inline editing for add row
  editingAddParentId?: string | null;
  onStartEditingAdd?: (parentId: string | null) => void;
  onCreateWithTitle?: (parentId: string | null, title: string) => Promise<string | null>;
  onLinkExisting?: (parentId: string | null, existingId: string) => Promise<void>;
  onCancelEditingAdd?: () => void;
}

function buildChildrenMap(hypotheses: HypothesisWithRelations[]) {
  const childrenMap = new Map<string, string[]>();
  for (const h of hypotheses) {
    for (const edge of h.children) {
      const existing = childrenMap.get(h.id) || [];
      existing.push(edge.child.id);
      childrenMap.set(h.id, existing);
    }
  }
  return childrenMap;
}

function getRootHypotheses(hypotheses: HypothesisWithRelations[]) {
  return hypotheses.filter((h) => h.parents.length === 0);
}

const INDENT_PER_LEVEL = 16; // Match HypothesisRow

// Add row component with inline title creation
// - isHighlighted: visually selected via keyboard navigation (but not activated)
// - isActive: actually in add mode (right pane shows new hypothesis form)
// - isEditing: inline title input is shown
interface Suggestion {
  id: string;
  statement: string;
  isCreate: boolean;
}

function AddRow({ 
  depth, 
  parentId,
  onActivate,
  onHighlight,
  isHighlighted,
  isActive,
  isEditing,
  onStartEditing,
  onCreateWithTitle,
  onLinkExisting,
  onCancelEditing,
  availableHypotheses,
  excludeIds,
}: { 
  depth: number;
  parentId: string | null;
  onActivate: (parentId: string | null) => void;
  onHighlight: (parentId: string | null) => void;
  isHighlighted: boolean;
  isActive: boolean;
  isEditing: boolean;
  onStartEditing: (parentId: string | null) => void;
  onCreateWithTitle: (parentId: string | null, title: string) => void;
  onLinkExisting: (parentId: string | null, existingId: string) => void;
  onCancelEditing: () => void;
  availableHypotheses: HypothesisWithRelations[];
  excludeIds: Set<string>; // IDs to exclude (ancestors, self, already children)
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [titleValue, setTitleValue] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const leftPadding = depth * INDENT_PER_LEVEL;
  const isVisuallySelected = isHighlighted || isActive || isEditing;
  
  // Filter suggestions based on input
  const suggestions = useMemo((): Suggestion[] => {
    const query = titleValue.toLowerCase().trim();
    
    // Filter available hypotheses
    const matchingHypotheses = availableHypotheses
      .filter((h) => !excludeIds.has(h.id))
      .filter((h) => !query || h.statement.toLowerCase().includes(query))
      .slice(0, 5)
      .map((h) => ({
        id: h.id,
        statement: h.statement,
        isCreate: false,
      }));
    
    // Add "create new" option if there's text
    if (query) {
      return [
        { id: "create-new", statement: titleValue.trim(), isCreate: true },
        ...matchingHypotheses,
      ];
    }
    
    return matchingHypotheses;
  }, [titleValue, availableHypotheses, excludeIds]);

  // Focus the row when highlighted (for keyboard navigation)
  useEffect(() => {
    if (isHighlighted && !isEditing && rowRef.current) {
      rowRef.current.focus();
    }
  }, [isHighlighted, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      setShowSuggestions(true);
    }
  }, [isEditing]);

  // Clear input when editing ends
  useEffect(() => {
    if (!isEditing) {
      setTitleValue("");
      setSelectedSuggestionIndex(0);
      setShowSuggestions(false);
    }
  }, [isEditing]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [suggestions.length]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isEditing) {
      e.preventDefault();
      e.stopPropagation();
      onStartEditing(parentId);
    }
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.isCreate) {
      onCreateWithTitle(parentId, suggestion.statement);
    } else {
      onLinkExisting(parentId, suggestion.id);
    }
    setShowSuggestions(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => 
        Math.min(prev + 1, suggestions.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length > 0) {
        handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
      } else if (titleValue.trim()) {
        onCreateWithTitle(parentId, titleValue.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancelEditing();
    } else if (e.key === "Tab") {
      // Allow Tab to close suggestions and move focus
      setShowSuggestions(false);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't cancel if clicking on a suggestion
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    // Small delay to allow suggestion click to register
    setTimeout(() => {
      if (isEditing && !titleValue.trim()) {
        onCancelEditing();
      }
    }, 150);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value);
    setShowSuggestions(true);
    setSelectedSuggestionIndex(0);
  };

  const addRowId = parentId ? `add-${parentId}` : "add-root";

  return (
    <div
      ref={rowRef}
      data-add-row-id={addRowId}
      tabIndex={isEditing ? -1 : 0}
      className={`py-1.5 px-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer outline-none ${isVisuallySelected ? 'bg-blue-50 text-gray-600' : ''}`}
      style={{ paddingLeft: `${12 + leftPadding + 20}px` }}
      onClick={() => !isEditing && onStartEditing(parentId)}
      onDoubleClick={() => !isEditing && onStartEditing(parentId)}
      onKeyDown={handleKeyDown}
    >
      {isEditing ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={titleValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search or create..."
            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-800"
          />
          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.isCreate ? "create-new" : suggestion.id}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm ${
                    index === selectedSuggestionIndex
                      ? "bg-blue-50 text-blue-900"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur
                    handleSelectSuggestion(suggestion);
                  }}
                >
                  {suggestion.isCreate ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>
                        Create &ldquo;<span className="font-medium">{suggestion.statement}</span>&rdquo;
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      <span className="truncate">{suggestion.statement}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add
        </span>
      )}
    </div>
  );
}

export const HypothesisList = forwardRef<HypothesisListHandle, HypothesisListProps>(
  function HypothesisList({ 
    hypotheses, 
    selectedId, 
    onSelect,
    isAddingNew,
    addingParentId,
    onAddNew,
    onTabToDetail,
    isFocused = true,
    highlightedAddParentId,
    onHighlightAdd,
    editingAddParentId,
    onStartEditingAdd,
    onCreateWithTitle,
    onLinkExisting,
    onCancelEditingAdd,
  }, ref) {
  const router = useRouter();
  // Use instance keys (parentId:hypothesisId) instead of just IDs to support multi-parent scenarios
  // For root nodes, use "root:hypothesisId"
  const [expandedInstanceKeys, setExpandedInstanceKeys] = useState<Set<string>>(new Set());
  // Track the selected instance key for visual highlighting (separate from selectedId which is for detail pane)
  const [selectedInstanceKey, setSelectedInstanceKey] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragDropZone, setDragDropZone] = useState<DropZone>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Helper to create instance key
  const makeInstanceKey = (parentId: string | null, hypothesisId: string): string => {
    return parentId ? `${parentId}:${hypothesisId}` : `root:${hypothesisId}`;
  };

  const hypothesesMap = useMemo(() => new Map(hypotheses.map((h) => [h.id, h])), [hypotheses]);
  const childrenMap = useMemo(() => buildChildrenMap(hypotheses), [hypotheses]);
  const rootHypotheses = useMemo(() => getRootHypotheses(hypotheses), [hypotheses]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (!listRef.current) return;
      
      // If add row is highlighted, focus it
      if (highlightedAddParentId !== undefined) {
        const addRowId = highlightedAddParentId ? `add-${highlightedAddParentId}` : "add-root";
        const addRow = listRef.current.querySelector(`[data-add-row-id="${addRowId}"]`) as HTMLElement;
        addRow?.focus();
        return;
      }
      
      // If adding new (active), focus the add row
      if (isAddingNew) {
        const addRowId = addingParentId ? `add-${addingParentId}` : "add-root";
        const addRow = listRef.current.querySelector(`[data-add-row-id="${addRowId}"]`) as HTMLElement;
        addRow?.focus();
        return;
      }
      
      // Focus the selected instance (use instance key for multi-parent support)
      if (selectedInstanceKey) {
        const selectedRow = listRef.current.querySelector(`[data-instance-key="${selectedInstanceKey}"]`) as HTMLElement;
        selectedRow?.focus();
        return;
      }
      
      // Focus the list container if no selection
      listRef.current.focus();
    },
    expandToHypothesis: (hypothesisId: string) => {
      // Find the path from root to this hypothesis
      // We need to expand all ancestors to make it visible
      const hypothesis = hypothesesMap.get(hypothesisId);
      if (!hypothesis) return;
      
      // Build the chain of ancestors (we'll use the first parent at each level)
      const ancestorChain: Array<{ parentId: string | null; childId: string }> = [];
      let current = hypothesis;
      while (current.parents.length > 0) {
        const parentId = current.parents[0].parentId;
        ancestorChain.unshift({ parentId, childId: current.id });
        const parent = hypothesesMap.get(parentId);
        if (!parent) break;
        current = parent;
      }
      
      // Add root level if needed
      if (current.parents.length === 0 && current.id !== hypothesisId) {
        ancestorChain.unshift({ parentId: null, childId: current.id });
      }
      
      // Create instance keys for all ancestors and expand them
      const keysToExpand = new Set<string>();
      
      // Start with root expansion
      if (rootHypotheses.find(h => h.id === hypothesisId)) {
        // Hypothesis is at root level, just need to ensure it's the selected instance
        setSelectedInstanceKey(makeInstanceKey(null, hypothesisId));
      } else {
        // Need to expand ancestors
        let currentParentId: string | null = null;
        for (const { parentId, childId } of ancestorChain) {
          // Expand the parent node to show its children
          const parentInstanceKey = makeInstanceKey(currentParentId, parentId || childId);
          if (parentId === null) {
            // This is root, expand it
            keysToExpand.add(makeInstanceKey(null, childId));
          } else {
            keysToExpand.add(makeInstanceKey(currentParentId, parentId));
          }
          currentParentId = parentId || childId;
        }
        
        // Find the correct instance key for the target hypothesis
        // Use the immediate parent from the chain
        const immediateParent = hypothesis.parents.length > 0 ? hypothesis.parents[0].parentId : null;
        setSelectedInstanceKey(makeInstanceKey(immediateParent, hypothesisId));
      }
      
      // Add all keys to expanded set
      if (keysToExpand.size > 0) {
        setExpandedInstanceKeys(prev => {
          const next = new Set(prev);
          keysToExpand.forEach(key => next.add(key));
          return next;
        });
      }
      
      // Focus the row after a short delay (to allow DOM to update)
      setTimeout(() => {
        if (listRef.current) {
          const targetKey = hypothesis.parents.length > 0 
            ? makeInstanceKey(hypothesis.parents[0].parentId, hypothesisId)
            : makeInstanceKey(null, hypothesisId);
          const row = listRef.current.querySelector(`[data-instance-key="${targetKey}"]`) as HTMLElement;
          row?.focus();
        }
      }, 50);
    },
  }), [selectedInstanceKey, isAddingNew, addingParentId, highlightedAddParentId, hypothesesMap, rootHypotheses]);

  // Count total descendants (children + grandchildren + all levels below)
  const getDescendantCount = useCallback((hypothesisId: string, visited = new Set<string>()): number => {
    if (visited.has(hypothesisId)) return 0; // Prevent cycles
    visited.add(hypothesisId);
    
    const childIds = childrenMap.get(hypothesisId) || [];
    let count = childIds.length;
    for (const childId of childIds) {
      count += getDescendantCount(childId, visited);
    }
    return count;
  }, [childrenMap]);

  // LocalStorage key for expansion state
  const EXPANSION_STORAGE_KEY = "why-stack-expanded-items";

  // Check if localStorage is available
  const isLocalStorageAvailable = typeof window !== "undefined" && window.localStorage;

  // Initialize expansion state - prefer localStorage, fallback to root hypotheses
  const initialExpandedRef = useRef(false);
  useEffect(() => {
    if (!initialExpandedRef.current && rootHypotheses.length > 0) {
      initialExpandedRef.current = true;
      
      // Try to load from localStorage (only in browser)
      if (isLocalStorageAvailable) {
        try {
          const saved = localStorage.getItem(EXPANSION_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setExpandedInstanceKeys(new Set(parsed));
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to load expansion state from localStorage:", e);
        }
      }
      
      // Fallback: expand all root hypotheses
      setExpandedInstanceKeys(new Set(rootHypotheses.map(h => makeInstanceKey(null, h.id))));
    }
  }, [rootHypotheses, isLocalStorageAvailable]);

  // Save expansion state to localStorage when it changes
  useEffect(() => {
    if (isLocalStorageAvailable && expandedInstanceKeys.size > 0) {
      try {
        localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(Array.from(expandedInstanceKeys)));
      } catch (e) {
        console.warn("Failed to save expansion state to localStorage:", e);
      }
    }
  }, [expandedInstanceKeys, isLocalStorageAvailable]);

  // Track whether selection is happening internally (from clicks/keyboard in this component)
  // When true, we skip syncing from selectedId prop to avoid overriding the instance key
  const isInternalSelectionRef = useRef(false);

  // Sync selectedInstanceKey when selectedId prop changes from OUTSIDE
  // (e.g., from search modal selecting a hypothesis)
  // This finds the first visible instance of the selected hypothesis
  const previousSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId !== previousSelectedIdRef.current) {
      previousSelectedIdRef.current = selectedId;
      
      // If this change came from within the component, skip - we already set the instance key
      if (isInternalSelectionRef.current) {
        isInternalSelectionRef.current = false;
        return;
      }
      
      if (selectedId) {
        // Find any visible row with this ID and use its instance key
        // (We need visibleRows but it depends on expandedInstanceKeys, so compute inline)
        const computeFirstInstanceKey = (id: string): string | null => {
          // Try root level first
          const rootMatch = rootHypotheses.find(h => h.id === id);
          if (rootMatch) return makeInstanceKey(null, id);
          
          // Try to find in children - check all parents of this hypothesis
          const hypothesis = hypothesesMap.get(id);
          if (hypothesis && hypothesis.parents.length > 0) {
            // Use the first parent's context
            return makeInstanceKey(hypothesis.parents[0].parentId, id);
          }
          return null;
        };
        
        const instanceKey = computeFirstInstanceKey(selectedId);
        if (instanceKey) {
          setSelectedInstanceKey(instanceKey);
        }
      } else {
        setSelectedInstanceKey(null);
      }
    }
  }, [selectedId, rootHypotheses, hypothesesMap]);

  // Build visible rows including +Add rows for keyboard navigation
  // Now includes instanceKey for each row
  type VisibleRow = { 
    id: string; 
    depth: number; 
    parentId: string | null; 
    instanceKey: string;
    isAddRow?: boolean;
  };
  
  const visibleRows = useMemo(() => {
    const rows: VisibleRow[] = [];
    function addRowsRecursively(hypothesisId: string, depth: number, parentId: string | null) {
      const instanceKey = makeInstanceKey(parentId, hypothesisId);
      rows.push({ id: hypothesisId, depth, parentId, instanceKey });
      if (expandedInstanceKeys.has(instanceKey)) {
        const childIds = childrenMap.get(hypothesisId) || [];
        for (const childId of childIds) {
          addRowsRecursively(childId, depth + 1, hypothesisId);
        }
        // Add row at end of this node's children (always shown when expanded)
        rows.push({ 
          id: `add-${hypothesisId}`, 
          depth: depth + 1, 
          parentId: hypothesisId, 
          instanceKey: `add-${instanceKey}`,
          isAddRow: true 
        });
      }
    }
    for (const root of rootHypotheses) {
      addRowsRecursively(root.id, 0, null);
    }
    // Add row at root level
    rows.push({ id: "add-root", depth: 0, parentId: null, instanceKey: "add-root", isAddRow: true });
    return rows;
  }, [rootHypotheses, childrenMap, expandedInstanceKeys]);

  // Compute ancestor and descendant chains for the selected hypothesis
  // Used for highlighting related items in the tree
  const { ancestorIds, descendantIds } = useMemo(() => {
    if (!selectedId) {
      return { ancestorIds: new Set<string>(), descendantIds: new Set<string>() };
    }

    // Get all ancestors (parents, grandparents, etc.)
    const ancestors = new Set<string>();
    const getAncestors = (id: string) => {
      const hypothesis = hypothesesMap.get(id);
      if (hypothesis) {
        for (const parent of hypothesis.parents) {
          if (!ancestors.has(parent.parentId)) {
            ancestors.add(parent.parentId);
            getAncestors(parent.parentId);
          }
        }
      }
    };
    getAncestors(selectedId);

    // Get all descendants (children, grandchildren, etc.)
    const descendants = new Set<string>();
    const getDescendants = (id: string) => {
      const childIds = childrenMap.get(id) || [];
      for (const childId of childIds) {
        if (!descendants.has(childId)) {
          descendants.add(childId);
          getDescendants(childId);
        }
      }
    };
    getDescendants(selectedId);

    return { ancestorIds: ancestors, descendantIds: descendants };
  }, [selectedId, hypothesesMap, childrenMap]);

  const handleToggleChildren = useCallback((instanceKey: string) => {
    setExpandedInstanceKeys((current) => {
      const next = new Set(current);
      if (next.has(instanceKey)) {
        next.delete(instanceKey);
      } else {
        next.add(instanceKey);
      }
      return next;
    });
  }, []);

  // Expand all nodes recursively
  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    
    // Recursively add all possible instance keys
    function addAllKeys(hypothesisId: string, parentId: string | null) {
      const instanceKey = makeInstanceKey(parentId, hypothesisId);
      allKeys.add(instanceKey);
      const childIds = childrenMap.get(hypothesisId) || [];
      for (const childId of childIds) {
        addAllKeys(childId, hypothesisId);
      }
    }
    
    // Start from root nodes
    for (const root of rootHypotheses) {
      addAllKeys(root.id, null);
    }
    
    setExpandedInstanceKeys(allKeys);
  }, [childrenMap, rootHypotheses]);

  // Collapse all nodes (keep only root level visible)
  const handleCollapseAll = useCallback(() => {
    setExpandedInstanceKeys(new Set());
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((id: string, zone: DropZone) => {
    if (id !== draggedId) {
      setDragOverId(id);
      setDragDropZone(zone);
    }
  }, [draggedId]);

  // Helper to check if target is a descendant of source (would create cycle)
  const isDescendantOf = useCallback((targetId: string, sourceId: string): boolean => {
    const visited = new Set<string>();
    const queue = [targetId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const children = childrenMap.get(current) || [];
      for (const childId of children) {
        if (childId === sourceId) return true;
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }
    return false;
  }, [childrenMap]);

  const handleDrop = useCallback(async () => {
    if (!draggedId || !dragOverId || draggedId === dragOverId) {
      setDraggedId(null);
      setDragOverId(null);
      setDragDropZone(null);
      return;
    }

    const draggedRow = visibleRows.find((r) => r.id === draggedId);
    const targetRow = visibleRows.find((r) => r.id === dragOverId);

    if (!draggedRow || !targetRow) {
      setDraggedId(null);
      setDragOverId(null);
      setDragDropZone(null);
      return;
    }

    // If dropping in center, reparent (make dragged item a child of target)
    if (dragDropZone === "center") {
      // Prevent cycles
      if (isDescendantOf(dragOverId, draggedId)) {
        console.warn("Cannot drop: would create a cycle");
        setDraggedId(null);
        setDragOverId(null);
        setDragDropZone(null);
        return;
      }

      await moveHypothesisToParent(draggedId, dragOverId);
      // Auto-expand target instance to show the newly added child
      // Use the target row's instance key
      const targetInstanceKey = targetRow.instanceKey;
      setExpandedInstanceKeys((current) => new Set([...current, targetInstanceKey]));
      router.refresh();
    } else {
      // Reorder among siblings (existing behavior)
      // Can only reorder if same parent
      if (draggedRow.parentId !== targetRow.parentId) {
        setDraggedId(null);
        setDragOverId(null);
        setDragDropZone(null);
        return;
      }

      const parentId = draggedRow.parentId;
      let siblings: string[];
      if (parentId === null) {
        siblings = rootHypotheses.map((h) => h.id);
      } else {
        siblings = childrenMap.get(parentId) || [];
      }

      const draggedIndex = siblings.indexOf(draggedId);
      const targetIndex = siblings.indexOf(dragOverId);

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedId(null);
        setDragOverId(null);
        setDragDropZone(null);
        return;
      }

      const newOrder = [...siblings];
      newOrder.splice(draggedIndex, 1);
      // For "above", insert at target index; for "below", insert after
      const insertIndex = dragDropZone === "above" ? targetIndex : targetIndex + 1;
      newOrder.splice(insertIndex > draggedIndex ? insertIndex - 1 : insertIndex, 0, draggedId);

      await reorderHypotheses(newOrder, parentId);
      router.refresh();
    }

    setDraggedId(null);
    setDragOverId(null);
    setDragDropZone(null);
  }, [draggedId, dragOverId, dragDropZone, visibleRows, rootHypotheses, childrenMap, router, isDescendantOf]);

  // Helper to get current selection/highlight index (works for both hypothesis and add rows)
  const getCurrentSelectionIndex = useCallback(() => {
    // Check highlighted add row first (keyboard navigation state)
    // highlightedAddParentId can be: undefined (no highlight), null (root add row), or string (child add row)
    if (highlightedAddParentId !== undefined) {
      const addRowId = highlightedAddParentId === null ? "add-root" : `add-${highlightedAddParentId}`;
      const idx = visibleRows.findIndex((r) => r.id === addRowId);
      if (idx !== -1) return idx;
    }
    // Check active add row (actually in add mode)
    if (isAddingNew) {
      const addRowId = addingParentId === null ? "add-root" : `add-${addingParentId}`;
      return visibleRows.findIndex((r) => r.id === addRowId);
    }
    // Check selected instance (use instance key for multi-parent support)
    if (selectedInstanceKey) {
      return visibleRows.findIndex((r) => r.instanceKey === selectedInstanceKey);
    }
    return -1;
  }, [highlightedAddParentId, isAddingNew, addingParentId, selectedInstanceKey, visibleRows]);

  // Helper to navigate to a row (highlight add rows, select hypothesis rows)
  const navigateToRow = useCallback((row: VisibleRow) => {
    if (row.isAddRow) {
      // Just highlight the add row, don't activate it
      // Note: onHighlightAdd handler should clear selectedId internally
      onHighlightAdd?.(row.parentId);
      setSelectedInstanceKey(null);
    } else {
      // Select the hypothesis instance
      isInternalSelectionRef.current = true; // Mark as internal to prevent sync effect from overriding
      setSelectedInstanceKey(row.instanceKey);
      onSelect(row.id);
    }
  }, [onHighlightAdd, onSelect]);

  // Helper to start inline editing on the highlighted add row
  const startInlineEditing = useCallback(() => {
    if (highlightedAddParentId !== undefined) {
      onStartEditingAdd?.(highlightedAddParentId);
    }
  }, [highlightedAddParentId, onStartEditingAdd]);

  // Check if an add row is being edited
  const isAddRowEditing = editingAddParentId !== undefined;

  // Check if an add row is currently highlighted (for keyboard navigation)
  const isAddRowHighlighted = highlightedAddParentId !== undefined;

  // Keyboard navigation
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input (for inline title editing)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Check if we should handle this event:
      // - If focus is within the list container, always handle
      // - If isFocused prop is true (list pane is active), handle for global navigation
      const target = e.target;
      const isTargetInList = target instanceof Node && listRef.current?.contains(target);
      
      if (!isTargetInList && !isFocused) return;

      // Don't handle keys if an add row is being edited (let the input handle it)
      if (isAddRowEditing) {
        return;
      }

      // Tab moves to detail pane (and activates add row if highlighted, for full form editing)
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        if (isAddRowHighlighted && highlightedAddParentId !== undefined) {
          // Activate the add row and go to detail pane
          onAddNew(highlightedAddParentId);
          // @ts-expect-error - passing undefined to signal "clear highlight"
          onHighlightAdd?.(undefined);
        }
        onTabToDetail?.();
        return;
      }

      // Enter on highlighted add row starts inline editing
      if (e.key === "Enter" && isAddRowHighlighted) {
        e.preventDefault();
        startInlineEditing();
        return;
      }

      const currentIndex = getCurrentSelectionIndex();
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentIndex < visibleRows.length - 1) {
          navigateToRow(visibleRows[currentIndex + 1]);
        } else if (currentIndex === -1 && visibleRows.length > 0) {
          // Nothing selected, select first
          navigateToRow(visibleRows[0]);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentIndex > 0) {
          navigateToRow(visibleRows[currentIndex - 1]);
        } else if (currentIndex === -1 && visibleRows.length > 0) {
          // Nothing selected, select last
          navigateToRow(visibleRows[visibleRows.length - 1]);
        }
      } else if (e.key === "ArrowRight" && selectedInstanceKey && !isAddingNew && !isAddRowHighlighted) {
        e.preventDefault();
        // Expand to show children (and add row)
        if (!expandedInstanceKeys.has(selectedInstanceKey)) {
          handleToggleChildren(selectedInstanceKey);
        }
      } else if (e.key === "ArrowLeft" && selectedInstanceKey && !isAddingNew && !isAddRowHighlighted) {
        e.preventDefault();
        if (expandedInstanceKeys.has(selectedInstanceKey)) {
          handleToggleChildren(selectedInstanceKey);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isFocused, selectedId, selectedInstanceKey, isAddingNew, addingParentId, highlightedAddParentId, isAddRowHighlighted, isAddRowEditing, visibleRows, expandedInstanceKeys, handleToggleChildren, getCurrentSelectionIndex, navigateToRow, startInlineEditing, onAddNew, onHighlightAdd, onTabToDetail]);

  // Compute IDs to exclude from linking (ancestors + self + already children)
  const getExcludeIds = useCallback((parentId: string | null): Set<string> => {
    const excluded = new Set<string>();
    
    if (parentId) {
      // Exclude the parent itself
      excluded.add(parentId);
      
      // Exclude all ancestors of the parent
      const queue = [parentId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const hypothesis = hypothesesMap.get(current);
        if (hypothesis) {
          for (const parent of hypothesis.parents) {
            if (!excluded.has(parent.parentId)) {
              excluded.add(parent.parentId);
              queue.push(parent.parentId);
            }
          }
        }
      }
      
      // Exclude existing children of the parent
      const childIds = childrenMap.get(parentId) || [];
      for (const childId of childIds) {
        excluded.add(childId);
      }
    }
    
    return excluded;
  }, [hypothesesMap, childrenMap]);

  // Handle selection - also track instance key
  const handleSelectInstance = useCallback((hypothesisId: string, instanceKey: string) => {
    isInternalSelectionRef.current = true; // Mark as internal to prevent sync effect from overriding
    setSelectedInstanceKey(instanceKey);
    onSelect(hypothesisId);
  }, [onSelect]);

  // Recursive render
  const renderHypothesisWithChildren = (hypothesisId: string, depth: number, parentId: string | null): React.ReactNode => {
    const hypothesis = hypothesesMap.get(hypothesisId);
    if (!hypothesis) return null;

    const instanceKey = makeInstanceKey(parentId, hypothesisId);
    const childIds = childrenMap.get(hypothesisId) || [];
    const hasChildren = childIds.length > 0;
    const isChildrenExpanded = expandedInstanceKeys.has(instanceKey);
    const excludeIds = getExcludeIds(hypothesisId);
    // Check if this specific instance is selected (not just the hypothesis ID)
    const isThisInstanceSelected = selectedInstanceKey === instanceKey;
    // Check if this hypothesis is in the chain of the selected item
    const isInAncestorChain = ancestorIds.has(hypothesisId);
    const isInDescendantChain = descendantIds.has(hypothesisId);

    return (
      <div key={instanceKey}>
        <HypothesisRow
          hypothesis={hypothesis}
          onSelect={() => handleSelectInstance(hypothesisId, instanceKey)}
          isSelected={isThisInstanceSelected}
          depth={depth}
          hasChildren={hasChildren}
          childCount={getDescendantCount(hypothesisId)}
          isChildrenExpanded={isChildrenExpanded}
          onToggleChildrenExpand={() => handleToggleChildren(instanceKey)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          isDragOver={dragOverId === hypothesisId}
          dropZone={dragOverId === hypothesisId ? dragDropZone : null}
          instanceKey={instanceKey}
          isInAncestorChain={isInAncestorChain}
          isInDescendantChain={isInDescendantChain}
        />
        {isChildrenExpanded && (
          <>
            {childIds.map((childId) => renderHypothesisWithChildren(childId, depth + 1, hypothesisId))}
            {/* Add row at end of children */}
            <AddRow
              depth={depth + 1}
              parentId={hypothesisId}
              onActivate={onAddNew}
              onHighlight={onHighlightAdd ?? (() => {})}
              isHighlighted={highlightedAddParentId === hypothesisId}
              isActive={isAddingNew && addingParentId === hypothesisId}
              isEditing={editingAddParentId === hypothesisId}
              onStartEditing={onStartEditingAdd ?? (() => {})}
              onCreateWithTitle={onCreateWithTitle ?? (async () => null)}
              onLinkExisting={onLinkExisting ?? (async () => {})}
              onCancelEditing={onCancelEditingAdd ?? (() => {})}
              availableHypotheses={hypotheses}
              excludeIds={excludeIds}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div ref={listRef} className="h-full flex flex-col">
      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {hypotheses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-2">No hypotheses yet.</p>
            <p className="text-xs text-gray-400">Click below to add your first one.</p>
          </div>
        ) : rootHypotheses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">All hypotheses are nested.</p>
          </div>
        ) : (
          <div>
            {rootHypotheses.map((hypothesis) => renderHypothesisWithChildren(hypothesis.id, 0, null))}
          </div>
        )}

        {/* Add row at root level */}
        <AddRow 
          depth={0}
          parentId={null}
          onActivate={onAddNew}
          onHighlight={onHighlightAdd ?? (() => {})}
          isHighlighted={highlightedAddParentId === null}
          isActive={isAddingNew && addingParentId === null}
          isEditing={editingAddParentId === null}
          onStartEditing={onStartEditingAdd ?? (() => {})}
          onCreateWithTitle={onCreateWithTitle ?? (async () => null)}
          onLinkExisting={onLinkExisting ?? (async () => {})}
          onCancelEditing={onCancelEditingAdd ?? (() => {})}
          availableHypotheses={hypotheses}
          excludeIds={getExcludeIds(null)}
        />
      </div>

      {/* Footer with expand/collapse and shortcuts */}
      <div className="py-2 px-3 border-t border-gray-100 flex items-center justify-between">
        {/* Expand/Collapse buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExpandAll}
            className="text-[10px] text-slate-500 hover:text-slate-700 hover:underline"
            title="Expand all items"
          >
            Expand all
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={handleCollapseAll}
            className="text-[10px] text-slate-500 hover:text-slate-700 hover:underline"
            title="Collapse all items"
          >
            Collapse all
          </button>
        </div>
        
        {/* Keyboard shortcuts */}
        <div className="text-[10px] text-gray-400">
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">↑↓</kbd>
          {" nav "}
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">←→</kbd>
          {" expand "}
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd>
          {" edit "}
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">Tab</kbd>
          {" detail "}
          <kbd className="px-1 py-0.5 bg-gray-100 rounded">?</kbd>
          {" help"}
        </div>
      </div>
    </div>
  );
});
