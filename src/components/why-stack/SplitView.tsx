"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { createHypothesis, createChildHypothesisAndEdge, linkExistingHypothesis } from "@/app/actions/hypotheses";
import { HypothesisList } from "./HypothesisList";
import type { HypothesisListHandle } from "./HypothesisList";
import { DetailPane } from "./DetailPane";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { SearchModal } from "./SearchModal";

interface SplitViewProps {
  hypotheses: HypothesisWithRelations[];
}

function getRootHypotheses(hypotheses: HypothesisWithRelations[]) {
  return hypotheses.filter((h) => h.parents.length === 0);
}

export function SplitView({ hypotheses }: SplitViewProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.name;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  // Highlighted add row (keyboard navigation only, not activated yet)
  // undefined = no add row highlighted, null = root add row highlighted, string = child add row highlighted
  const [highlightedAddParentId, setHighlightedAddParentId] = useState<string | null | undefined>(undefined);
  // Editing add row (inline title input is shown)
  const [editingAddParentId, setEditingAddParentId] = useState<string | null | undefined>(undefined);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [focusedPane, setFocusedPane] = useState<"list" | "detail">("list");

  const listRef = useRef<HypothesisListHandle>(null);
  const detailPaneRef = useRef<{ focus: () => void }>(null);

  const hypothesesMap = useMemo(
    () => new Map(hypotheses.map((h) => [h.id, h])),
    [hypotheses]
  );

  const rootHypotheses = useMemo(() => getRootHypotheses(hypotheses), [hypotheses]);

  // Auto-select first root hypothesis on initial load only
  useEffect(() => {
    if (selectedId === null && !isAddingNew && highlightedAddParentId === undefined && rootHypotheses.length > 0) {
      setSelectedId(rootHypotheses[0].id);
    }
  }, [rootHypotheses, selectedId, isAddingNew, highlightedAddParentId]);

  // Handle `?` key for shortcuts modal and Cmd/Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for search (always available)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      // Don't trigger other shortcuts if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedHypothesis = selectedId ? hypothesesMap.get(selectedId) ?? null : null;

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    setIsAddingNew(false);
    setAddingParentId(null);
    setHighlightedAddParentId(undefined); // Clear any add row highlight
  };

  // Handler for search selection - expands tree to show the selected hypothesis
  const handleSearchSelect = useCallback((id: string | null) => {
    handleSelect(id);
    if (id && listRef.current) {
      listRef.current.expandToHypothesis(id);
    }
  }, []);

  const handleAddNew = (parentId: string | null) => {
    setIsAddingNew(true);
    setAddingParentId(parentId);
    setSelectedId(null);
    setHighlightedAddParentId(undefined); // Clear highlight when activating
  };

  // Handle highlighting add row (for keyboard navigation, doesn't activate)
  const handleHighlightAdd = useCallback((parentId: string | null | undefined) => {
    if (parentId === undefined) {
      // Clear highlight
      setHighlightedAddParentId(undefined);
    } else {
      setHighlightedAddParentId(parentId);
      setSelectedId(null); // Clear hypothesis selection
      setIsAddingNew(false); // Not in add mode yet
      setEditingAddParentId(undefined); // Clear any editing state
    }
  }, []);

  // Handle starting inline editing on add row
  const handleStartEditingAdd = useCallback((parentId: string | null) => {
    setEditingAddParentId(parentId);
    setHighlightedAddParentId(undefined); // Clear highlight when editing
  }, []);

  // Handle creating hypothesis with just a title (inline creation)
  const handleCreateWithTitle = useCallback(async (parentId: string | null, title: string): Promise<string | null> => {
    try {
      let result;
      if (parentId === null) {
        // Create root hypothesis
        result = await createHypothesis({
          statement: title,
          confidence: 50,
          tags: "",
          ownerId: currentUserId,
        });
      } else {
        // Create child hypothesis
        result = await createChildHypothesisAndEdge(parentId, {
          statement: title,
          confidence: 50,
          tags: "",
          ownerId: currentUserId,
        });
      }

      if (result.ok && result.data) {
        const newId = result.data.id;
        setEditingAddParentId(undefined);
        setSelectedId(newId);
        setIsAddingNew(false);
        setAddingParentId(null);
        setHighlightedAddParentId(undefined);
        router.refresh();
        return newId;
      }
      return null;
    } catch {
      return null;
    }
  }, [router, currentUserId]);

  // Handle linking an existing hypothesis as a child
  const handleLinkExisting = useCallback(async (parentId: string | null, existingId: string): Promise<void> => {
    try {
      const result = await linkExistingHypothesis(parentId, existingId, currentUserId, currentUserName || undefined);
      
      if (result.ok) {
        setEditingAddParentId(undefined);
        setSelectedId(existingId);
        setIsAddingNew(false);
        setAddingParentId(null);
        setHighlightedAddParentId(undefined);
        router.refresh();
      }
    } catch {
      // Silently fail
    }
  }, [router, currentUserId, currentUserName]);

  // Handle canceling inline editing
  const handleCancelEditingAdd = useCallback(() => {
    setEditingAddParentId(undefined);
    // Re-highlight the add row so user can continue navigating
    // Actually, just clear editing - user can navigate again
  }, []);

  const handleCreated = (id: string) => {
    setSelectedId(id);
    setIsAddingNew(false);
    setAddingParentId(null);
  };

  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    setIsAddingNew(false);
    setAddingParentId(null);
    setFocusedPane("list");
  }, []);

  const handleFocusDetailPane = useCallback(() => {
    setFocusedPane("detail");
    detailPaneRef.current?.focus();
  }, []);

  const handleFocusListPane = useCallback(() => {
    setFocusedPane("list");
    // Focus the selected row in the list
    listRef.current?.focus();
  }, []);

  return (
    <>
      <div className="flex h-[calc(100vh-180px)] border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* Left Pane - List (60%) */}
        <div className="w-3/5 border-r border-gray-200 flex flex-col">
          <HypothesisList
            ref={listRef}
            hypotheses={hypotheses}
            selectedId={selectedId}
            onSelect={handleSelect}
            isAddingNew={isAddingNew}
            addingParentId={addingParentId}
            onAddNew={handleAddNew}
            onTabToDetail={handleFocusDetailPane}
            isFocused={focusedPane === "list"}
            highlightedAddParentId={highlightedAddParentId}
            onHighlightAdd={handleHighlightAdd}
            editingAddParentId={editingAddParentId}
            onStartEditingAdd={handleStartEditingAdd}
            onCreateWithTitle={handleCreateWithTitle}
            onLinkExisting={handleLinkExisting}
            onCancelEditingAdd={handleCancelEditingAdd}
          />
        </div>

        {/* Right Pane - Detail (40%) */}
        <div className="w-2/5 bg-gray-50">
          <DetailPane
            ref={detailPaneRef}
            hypothesis={selectedHypothesis}
            isNew={isAddingNew}
            parentId={addingParentId}
            onCreated={handleCreated}
            onDeleted={handleDeleted}
            onEscapeToList={handleFocusListPane}
          />
        </div>
      </div>

      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        hypotheses={hypotheses}
        onSelect={handleSearchSelect}
      />
    </>
  );
}
