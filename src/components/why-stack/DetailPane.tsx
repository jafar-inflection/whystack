"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { updateHypothesis, createHypothesis, createChildHypothesisAndEdge, addEvidenceSimple, addChallengeSimple, updateEvidence, deleteEvidence, archiveHypothesis, deleteHypothesis, generateAIExecutiveSummary, deleteExecutiveSummary, ExecutiveSummaryData, generateValidationSuggestions, ValidationSuggestionsData, removeValidationSuggestion, deleteValidationSuggestions } from "@/app/actions/hypotheses";
import { OwnerWatcherSection } from "./OwnerWatcherSection";
import {
  HypothesisFormData,
  DEFAULT_HYPOTHESIS_FORM,
  computeStatus,
  ComputedStatus,
} from "./types";

// Helper to detect and render links in text
function renderTextWithLinks(text: string): React.ReactNode {
  // URL regex pattern
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlPattern);
  
  return parts.map((part, index) => {
    if (urlPattern.test(part)) {
      // Reset regex lastIndex
      urlPattern.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// Summary field component with auto-expand and link rendering
function SummaryField({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 24)}px`;
    }
  }, []);

  useEffect(() => {
    if (isEditing) {
      adjustHeight();
    }
  }, [value, isEditing, adjustHeight]);

  const handleFocus = () => {
    setIsEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      adjustHeight();
    }, 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onBlur();
  };

  // When not editing, show rendered text with clickable links
  if (!isEditing && value) {
    return (
      <div
        onClick={handleFocus}
        className="text-sm text-slate-600 leading-relaxed cursor-text whitespace-pre-wrap min-h-[24px] py-1 hover:bg-slate-50 rounded transition-colors"
      >
        {renderTextWithLinks(value)}
      </div>
    );
  }

  // When editing or empty, show textarea
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        adjustHeight();
      }}
      onFocus={() => setIsEditing(true)}
      onBlur={handleBlur}
      placeholder={placeholder}
      rows={1}
      className="w-full px-0 py-1 text-sm text-slate-600 placeholder:text-slate-400 border-0 focus:outline-none focus:ring-0 resize-none leading-relaxed bg-transparent"
      style={{ minHeight: "24px" }}
    />
  );
}

interface DetailPaneProps {
  hypothesis: HypothesisWithRelations | null;
  isNew: boolean;
  parentId?: string | null;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
  onEscapeToList?: () => void;
}

export interface DetailPaneHandle {
  focus: () => void;
}

// Modern status styling with icons
const STATUS_CONFIG: Record<ComputedStatus, { bg: string; text: string; icon: string }> = {
  NEW: { bg: "bg-slate-100", text: "text-slate-600", icon: "○" },
  IN_TESTING: { bg: "bg-amber-50", text: "text-amber-700", icon: "◐" },
  VALIDATED: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "✓" },
  REFUTED: { bg: "bg-rose-50", text: "text-rose-700", icon: "✗" },
  ARCHIVED: { bg: "bg-gray-100", text: "text-gray-500", icon: "▣" },
};


export const DetailPane = forwardRef<DetailPaneHandle, DetailPaneProps>(
  function DetailPane({ hypothesis, isNew, parentId, onCreated, onDeleted, onEscapeToList }, ref) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [form, setForm] = useState<HypothesisFormData>(DEFAULT_HYPOTHESIS_FORM);
  const [isAddingEvidence, setIsAddingEvidence] = useState(false);
  const [newEvidenceText, setNewEvidenceText] = useState("");
  const [saving, setSaving] = useState(false);
  const evidenceInputRef = useRef<HTMLTextAreaElement>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const statementRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentHypothesisId = useRef<string | null>(null);

  // Evidence navigation and editing state (for supporting evidence)
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState<number>(-1);
  const [editingEvidenceId, setEditingEvidenceId] = useState<string | null>(null);
  const [editingEvidenceText, setEditingEvidenceText] = useState("");
  const editingEvidenceRef = useRef<HTMLTextAreaElement>(null);
  const evidenceListRef = useRef<HTMLDivElement>(null);

  // Challenge navigation and editing state (for refuting evidence)
  const [isAddingChallenge, setIsAddingChallenge] = useState(false);
  const [newChallengeText, setNewChallengeText] = useState("");
  const [selectedChallengeIndex, setSelectedChallengeIndex] = useState<number>(-1);
  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const [editingChallengeText, setEditingChallengeText] = useState("");
  const editingChallengeRef = useRef<HTMLTextAreaElement>(null);
  const challengeListRef = useRef<HTMLDivElement>(null);
  const challengeInputRef = useRef<HTMLTextAreaElement>(null);

  // Track if form has been modified since last save
  const [hasBeenModified, setHasBeenModified] = useState(false);
  
  // Executive Summary state
  const [isGeneratingExecSummary, setIsGeneratingExecSummary] = useState(false);
  const [execSummary, setExecSummary] = useState<ExecutiveSummaryData | null>(null);
  const [execSummaryGeneratedAt, setExecSummaryGeneratedAt] = useState<Date | null>(null);
  const [showExecSummary, setShowExecSummary] = useState(false);
  
  // Validation Suggestions state
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [validationSuggestions, setValidationSuggestions] = useState<ValidationSuggestionsData | null>(null);
  const [suggestionsGeneratedAt, setSuggestionsGeneratedAt] = useState<Date | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingSuggestionIndex, setAddingSuggestionIndex] = useState<number | null>(null);
  
  // Actions menu state
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  
  // Check if executive summary is stale (content updated after summary was generated)
  // Uses contentUpdatedAt which tracks meaningful changes (not just any update like saving the summary)
  const execSummaryIsStale = hypothesis && execSummaryGeneratedAt && hypothesis.contentUpdatedAt
    ? new Date(hypothesis.contentUpdatedAt) > new Date(execSummaryGeneratedAt)
    : false;
    
  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    if (showActionsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showActionsMenu]);

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      statementRef.current?.focus();
    },
  }));

  // Handle Escape to return to list and Tab trapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in the detail pane
      if (!containerRef.current?.contains(e.target as Node)) {
        return;
      }

      if (e.key === "Escape") {
        // Handle editing evidence escape
        if (editingEvidenceId) {
          e.preventDefault();
          setEditingEvidenceId(null);
          setEditingEvidenceText("");
          return;
        }
        // Handle adding evidence escape
        if (isAddingEvidence) {
          setIsAddingEvidence(false);
          setNewEvidenceText("");
          return;
        }
        // Handle selected evidence escape
        if (selectedEvidenceIndex >= 0) {
          e.preventDefault();
          setSelectedEvidenceIndex(-1);
          return;
        }
        // Handle editing challenge escape
        if (editingChallengeId) {
          e.preventDefault();
          setEditingChallengeId(null);
          setEditingChallengeText("");
          return;
        }
        // Handle adding challenge escape
        if (isAddingChallenge) {
          setIsAddingChallenge(false);
          setNewChallengeText("");
          return;
        }
        // Handle selected challenge escape
        if (selectedChallengeIndex >= 0) {
          e.preventDefault();
          setSelectedChallengeIndex(-1);
          return;
        }
        e.preventDefault();
        onEscapeToList?.();
        return;
      }

      // Trap Tab within the detail pane
      if (e.key === "Tab") {
        const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
          'textarea, input, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusableArray = Array.from(focusableElements);
        
        if (focusableArray.length === 0) return;

        const currentIndex = focusableArray.indexOf(e.target as HTMLElement);
        
        if (e.shiftKey) {
          // Shift+Tab: go to previous, or wrap to last
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
          focusableArray[prevIndex].focus();
        } else {
          // Tab: go to next, or wrap to first
          e.preventDefault();
          const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
          focusableArray[nextIndex].focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscapeToList, isAddingEvidence, editingEvidenceId, selectedEvidenceIndex, isAddingChallenge, editingChallengeId, selectedChallengeIndex]);

  // Only reset form when switching to a DIFFERENT hypothesis (not on refresh of same one)
  useEffect(() => {
    const newId = hypothesis?.id ?? null;
    const prevId = currentHypothesisId.current;
    
    // Only reset if we're switching to a different hypothesis
    if (newId !== prevId) {
      currentHypothesisId.current = newId;
      
      if (hypothesis) {
        setForm({
          statement: hypothesis.statement,
          description: hypothesis.description || "",
          confidence: hypothesis.confidence,
          tags: hypothesis.tags.join(", "),
        });
        // Load saved executive summary if it exists
        if (hypothesis.execSummaryValidation || hypothesis.execSummaryProgress) {
          setExecSummary({
            validationPlan: hypothesis.execSummaryValidation || "",
            progressSummary: hypothesis.execSummaryProgress || "",
            biggerPicture: hypothesis.execSummaryBigPicture || null,
          });
          setExecSummaryGeneratedAt(hypothesis.execSummaryGeneratedAt ? new Date(hypothesis.execSummaryGeneratedAt) : null);
          setShowExecSummary(true);
        } else {
          setExecSummary(null);
          setExecSummaryGeneratedAt(null);
          setShowExecSummary(false);
        }
        // Load stored suggestions if available
        if (hypothesis.validationSuggestions && Array.isArray(hypothesis.validationSuggestions)) {
          setValidationSuggestions({
            suggestions: hypothesis.validationSuggestions as Array<{ statement: string; reasoning: string }>,
          });
          setSuggestionsGeneratedAt(hypothesis.validationSuggestionsAt ? new Date(hypothesis.validationSuggestionsAt) : null);
          setShowSuggestions(true);
        } else {
          setValidationSuggestions(null);
          setSuggestionsGeneratedAt(null);
          setShowSuggestions(false);
        }
        setHasBeenModified(false);
      } else if (isNew) {
        setForm(DEFAULT_HYPOTHESIS_FORM);
        setHasBeenModified(false);
        // Focus statement for new hypothesis
        setTimeout(() => statementRef.current?.focus(), 100);
      }
      setLastSaved(null);
      // Reset evidence selection state
      setSelectedEvidenceIndex(-1);
      setEditingEvidenceId(null);
      setEditingEvidenceText("");
      // Reset challenge selection state
      setSelectedChallengeIndex(-1);
      setEditingChallengeId(null);
      setEditingChallengeText("");
    }
  }, [hypothesis, isNew]);

  // Save on blur - called when focus leaves a field
  const handleSave = async () => {
    if (!hasBeenModified) return;
    if (!form.statement.trim()) return;

    setSaving(true);
    try {
      const hypothesisId = currentHypothesisId.current;
      if (hypothesisId) {
        // Update existing
        await updateHypothesis(hypothesisId, { ...form, actorId: currentUserId, actorName: session?.user?.name || undefined });
        setLastSaved(new Date());
        setHasBeenModified(false);
        router.refresh();
      } else if (isNew) {
        // Create new (either root or as child of parent)
        // Set current user as owner
        const formWithOwner = { ...form, ownerId: currentUserId };
        const result = parentId
          ? await createChildHypothesisAndEdge(parentId, formWithOwner)
          : await createHypothesis(formWithOwner);
        if (result.ok && result.data) {
          setLastSaved(new Date());
          setHasBeenModified(false);
          onCreated?.(result.data.id);
          router.refresh();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // Save confidence immediately when slider stops
  const handleConfidenceSave = async (newConfidence: number) => {
    const hypothesisId = currentHypothesisId.current;
    if (!hypothesisId) return;
    
    setSaving(true);
    try {
      await updateHypothesis(hypothesisId, { ...form, confidence: newConfidence, actorId: currentUserId, actorName: session?.user?.name || undefined });
      setLastSaved(new Date());
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleFormChange = (updates: Partial<HypothesisFormData>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setHasBeenModified(true);
  };

  const handleAddEvidence = async () => {
    if (!hypothesis || !newEvidenceText.trim()) return;
    const result = await addEvidenceSimple(hypothesis.id, newEvidenceText.trim(), currentUserId, session?.user?.name || undefined);
    if (result.ok) {
      setNewEvidenceText("");
      setIsAddingEvidence(false);
      // Update confidence immediately if cascade result is available
      if (result.data?.cascadeResult?.updated) {
        const thisUpdate = result.data.cascadeResult.updated.find(
          (u: { id: string; new: number }) => u.id === hypothesis.id
        );
        if (thisUpdate) {
          setForm((prev) => ({ ...prev, confidence: thisUpdate.new }));
        }
      }
      router.refresh();
    }
  };

  const handleStartAddEvidence = () => {
    setIsAddingEvidence(true);
    setTimeout(() => evidenceInputRef.current?.focus(), 50);
  };

  const handleEvidenceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddEvidence();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsAddingEvidence(false);
      setNewEvidenceText("");
    }
  };

  // Handle evidence list keyboard navigation
  const handleEvidenceListKeyDown = (e: React.KeyboardEvent) => {
    if (!hypothesis || editingEvidenceId || isAddingEvidence) return;
    
    const evidenceCount = supportingEvidence.length;
    
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (selectedEvidenceIndex < evidenceCount - 1) {
        setSelectedEvidenceIndex(selectedEvidenceIndex + 1);
      } else if (e.key === "ArrowDown") {
        // Move to +Add button at the end
        setSelectedEvidenceIndex(evidenceCount);
      }
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      if (selectedEvidenceIndex > 0) {
        setSelectedEvidenceIndex(selectedEvidenceIndex - 1);
      } else if (selectedEvidenceIndex === 0) {
        setSelectedEvidenceIndex(-1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedEvidenceIndex >= 0 && selectedEvidenceIndex < evidenceCount) {
        // Start editing selected evidence
        const ev = supportingEvidence[selectedEvidenceIndex];
        setEditingEvidenceId(ev.id);
        setEditingEvidenceText(ev.summary);
        setTimeout(() => editingEvidenceRef.current?.focus(), 50);
      } else if (selectedEvidenceIndex === evidenceCount) {
        // Start adding new evidence
        handleStartAddEvidence();
      }
    }
  };

  // Handle editing evidence keyboard events
  const handleEditingEvidenceKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSaveEditedEvidence();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingEvidenceId(null);
      setEditingEvidenceText("");
    }
  };

  // Save edited evidence
  const handleSaveEditedEvidence = async () => {
    if (!editingEvidenceId || !editingEvidenceText.trim()) return;
    
    setSaving(true);
    try {
      const result = await updateEvidence(editingEvidenceId, editingEvidenceText.trim(), currentUserId, session?.user?.name || undefined);
      if (result.ok) {
        setEditingEvidenceId(null);
        setEditingEvidenceText("");
        setLastSaved(new Date());
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete evidence
  const handleDeleteEvidence = async (evidenceId: string) => {
    const confirmed = window.confirm("Delete this evidence? This cannot be undone.");
    if (!confirmed) return;

    const result = await deleteEvidence(evidenceId, currentUserId, session?.user?.name || undefined);
    if (result.ok) {
      router.refresh();
    }
  };

  // Start editing an evidence item
  const handleStartEditEvidence = (ev: { id: string; summary: string }, index: number) => {
    setSelectedEvidenceIndex(index);
    setEditingEvidenceId(ev.id);
    setEditingEvidenceText(ev.summary);
    setTimeout(() => editingEvidenceRef.current?.focus(), 50);
  };

  // Filter evidence into supporting and challenging
  const supportingEvidence = hypothesis?.evidence.filter(
    (ev) => ev.direction === "SUPPORTS" || ev.direction === "WEAKLY_SUPPORTS" || ev.direction === "NEUTRAL"
  ) || [];
  const challengingEvidence = hypothesis?.evidence.filter(
    (ev) => ev.direction === "REFUTES" || ev.direction === "WEAKLY_REFUTES"
  ) || [];

  // Challenge handlers (similar to evidence handlers)
  const handleAddChallenge = async () => {
    if (!hypothesis || !newChallengeText.trim()) return;
    const result = await addChallengeSimple(hypothesis.id, newChallengeText.trim(), currentUserId, session?.user?.name || undefined);
    if (result.ok) {
      setNewChallengeText("");
      setIsAddingChallenge(false);
      // Update confidence immediately if cascade result is available
      if (result.data?.cascadeResult?.updated) {
        const thisUpdate = result.data.cascadeResult.updated.find(
          (u: { id: string; new: number }) => u.id === hypothesis.id
        );
        if (thisUpdate) {
          setForm((prev) => ({ ...prev, confidence: thisUpdate.new }));
        }
      }
      router.refresh();
    }
  };

  const handleStartAddChallenge = () => {
    setIsAddingChallenge(true);
    setTimeout(() => challengeInputRef.current?.focus(), 50);
  };

  const handleChallengeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddChallenge();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsAddingChallenge(false);
      setNewChallengeText("");
    }
  };

  // Handle challenge list keyboard navigation
  const handleChallengeListKeyDown = (e: React.KeyboardEvent) => {
    if (!hypothesis || editingChallengeId || isAddingChallenge) return;
    
    const challengeCount = challengingEvidence.length;
    
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (selectedChallengeIndex < challengeCount - 1) {
        setSelectedChallengeIndex(selectedChallengeIndex + 1);
      } else if (e.key === "ArrowDown") {
        // Move to +Add button at the end
        setSelectedChallengeIndex(challengeCount);
      }
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      if (selectedChallengeIndex > 0) {
        setSelectedChallengeIndex(selectedChallengeIndex - 1);
      } else if (selectedChallengeIndex === 0) {
        setSelectedChallengeIndex(-1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedChallengeIndex >= 0 && selectedChallengeIndex < challengeCount) {
        // Start editing selected challenge
        const ev = challengingEvidence[selectedChallengeIndex];
        setEditingChallengeId(ev.id);
        setEditingChallengeText(ev.summary);
        setTimeout(() => editingChallengeRef.current?.focus(), 50);
      } else if (selectedChallengeIndex === challengeCount) {
        // Start adding new challenge
        handleStartAddChallenge();
      }
    }
  };

  // Handle editing challenge keyboard events
  const handleEditingChallengeKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSaveEditedChallenge();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingChallengeId(null);
      setEditingChallengeText("");
    }
  };

  // Save edited challenge
  const handleSaveEditedChallenge = async () => {
    if (!editingChallengeId || !editingChallengeText.trim()) return;
    
    setSaving(true);
    try {
      const result = await updateEvidence(editingChallengeId, editingChallengeText.trim(), currentUserId, session?.user?.name || undefined);
      if (result.ok) {
        setEditingChallengeId(null);
        setEditingChallengeText("");
        setLastSaved(new Date());
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  // Start editing a challenge item
  const handleStartEditChallenge = (ev: { id: string; summary: string }, index: number) => {
    setSelectedChallengeIndex(index);
    setEditingChallengeId(ev.id);
    setEditingChallengeText(ev.summary);
    setTimeout(() => editingChallengeRef.current?.focus(), 50);
  };

  // Generate Executive Summary
  const handleGenerateExecSummary = async () => {
    if (!hypothesis) return;
    
    setIsGeneratingExecSummary(true);
    setShowExecSummary(true);
    try {
      const result = await generateAIExecutiveSummary(hypothesis.id);
      if (result.ok && result.data) {
        setExecSummary({
          validationPlan: result.data.validationPlan,
          progressSummary: result.data.progressSummary,
          biggerPicture: result.data.biggerPicture,
        });
        setExecSummaryGeneratedAt(result.data.generatedAt);
      } else {
        console.error("Failed to generate executive summary:", result.error);
        setExecSummary(null);
        setExecSummaryGeneratedAt(null);
      }
    } finally {
      setIsGeneratingExecSummary(false);
    }
  };
  
  // Format date for display
  const formatSummaryDate = (date: Date | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Generate validation suggestions
  const handleGenerateSuggestions = async () => {
    if (!hypothesis) return;
    
    setIsGeneratingSuggestions(true);
    setShowSuggestions(true);
    try {
      const result = await generateValidationSuggestions(hypothesis.id);
      if (result.ok && result.data) {
        setValidationSuggestions(result.data);
        setSuggestionsGeneratedAt(result.data.generatedAt || new Date());
        router.refresh();
      } else {
        console.error("Failed to generate suggestions:", result.error);
        setValidationSuggestions(null);
        setSuggestionsGeneratedAt(null);
      }
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  // Add a suggested hypothesis as a child
  const handleAddSuggestion = async (suggestion: { statement: string; reasoning: string }, index: number) => {
    if (!hypothesis || !currentUserId) return;
    
    setAddingSuggestionIndex(index);
    try {
      const result = await createChildHypothesisAndEdge(hypothesis.id, {
        statement: suggestion.statement,
        description: suggestion.reasoning, // Add reasoning as description
        confidence: 50, // Default confidence for new hypotheses
        tags: "",
        ownerId: currentUserId,
      });
      if (result.ok) {
        // Remove the suggestion from the stored list in database
        await removeValidationSuggestion(hypothesis.id, index);
        // Update local state
        if (validationSuggestions) {
          setValidationSuggestions({
            suggestions: validationSuggestions.suggestions.filter((_, i) => i !== index),
          });
        }
        router.refresh();
      }
    } finally {
      setAddingSuggestionIndex(null);
    }
  };

  const handleArchive = async () => {
    if (!hypothesis) return;
    const result = await archiveHypothesis(hypothesis.id, true, currentUserId, session?.user?.name || undefined);
    if (result.ok) {
      router.refresh();
    }
  };

  const handleDelete = async () => {
    if (!hypothesis) return;
    
    // Confirm before deleting
    const confirmed = window.confirm(
      `Delete "${hypothesis.statement.slice(0, 50)}${hypothesis.statement.length > 50 ? '...' : ''}"?\n\nThis will also remove all evidence, challenges, and child relationships. This cannot be undone.`
    );
    
    if (!confirmed) return;
    
    const result = await deleteHypothesis(hypothesis.id, currentUserId, session?.user?.name || undefined);
    if (result.ok) {
      onDeleted?.();
      router.refresh();
    }
  };

  // Compute status for display (use form.confidence for real-time feedback)
  const hasTags = form.tags.trim().length > 0;
  const displayStatus = hypothesis
    ? computeStatus(
        form.confidence,
        hypothesis.evidence.length,
        hypothesis.refutations.length,
        hypothesis.isArchived,
        hasTags
      )
    : computeStatus(form.confidence, 0, 0, false, hasTags);

  const statusConfig = STATUS_CONFIG[displayStatus];

  // Get confidence color based on value
  const getConfidenceColor = (value: number) => {
    if (value > 80) return "text-emerald-600";
    if (value < 20) return "text-rose-600";
    return "text-slate-600";
  };

  // Empty state
  if (!hypothesis && !isNew) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 font-medium">Select a hypothesis</p>
        <p className="text-xs text-slate-400 mt-1">Choose from the list or create a new one</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Status Badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
              <span className="text-[10px]">{statusConfig.icon}</span>
              {displayStatus.replace("_", " ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                Saving
              </span>
            )}
            {!saving && lastSaved && (
              <span className="text-xs text-slate-400">
                ✓ Saved
              </span>
            )}
            
            {/* Actions Menu */}
            {hypothesis && (
              <div className="relative" ref={actionsMenuRef}>
                <button
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                  aria-label="More actions"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="18" r="2" />
                  </svg>
                </button>
                
                {showActionsMenu && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                    <button
                      onClick={() => {
                        handleArchive();
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => {
                        handleDelete();
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Owner and Watch - only for existing hypothesis */}
        {hypothesis && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <OwnerWatcherSection
              hypothesisId={hypothesis.id}
              owner={hypothesis.owner || null}
              watchers={hypothesis.watchers || []}
            />
          </div>
        )}
      </div>

        {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {/* Title (Statement) - Bold and larger */}
          <div>
            <textarea
              ref={statementRef}
              value={form.statement}
              onChange={(e) => handleFormChange({ statement: e.target.value })}
              onBlur={handleSave}
              placeholder="What do you believe to be true?"
              rows={2}
              className="w-full px-0 py-0 text-lg font-semibold text-slate-900 placeholder:text-slate-300 border-0 focus:outline-none focus:ring-0 resize-none leading-snug"
            />
          </div>

          {/* Description - Inline, expandable */}
          <SummaryField
            value={form.description}
            onChange={(value) => handleFormChange({ description: value })}
            onBlur={handleSave}
            placeholder="Add description..."
          />

          {/* Tags - Compact inline input */}
          <input
            type="text"
            value={form.tags}
            onChange={(e) => handleFormChange({ tags: e.target.value })}
            onBlur={handleSave}
            placeholder="Add tags..."
            className="w-full px-0 py-1 text-sm text-slate-600 placeholder:text-slate-400 border-0 focus:outline-none focus:ring-0 bg-transparent"
          />

          {/* Executive Summary & Validation Suggestions - AI generated */}
          {hypothesis && (
            <div className="space-y-2">
              {/* AI Buttons Row */}
              <div className="flex flex-wrap gap-2">
                {!showExecSummary && (
                  <button
                    onClick={handleGenerateExecSummary}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-md transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    Executive Summary
                  </button>
                )}
                {!showSuggestions && (
                  <button
                    onClick={handleGenerateSuggestions}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Suggest Validation Ideas
                  </button>
                )}
              </div>
              
              {/* Executive Summary Panel */}
              {showExecSummary && (
                <div className={`rounded-lg p-3 space-y-3 ${execSummaryIsStale ? 'bg-amber-50/50' : 'bg-violet-50/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-violet-700 uppercase tracking-wide">Executive Summary</span>
                      {execSummaryGeneratedAt && (
                        <span className="text-[10px] text-slate-400">
                          {formatSummaryDate(execSummaryGeneratedAt)}
                        </span>
                      )}
                      {execSummaryIsStale && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                          outdated
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {execSummary && (
                        <button
                          onClick={() => {
                            const text = [
                              "VALIDATION APPROACH",
                              execSummary.validationPlan,
                              "",
                              "PROGRESS",
                              execSummary.progressSummary,
                              execSummary.biggerPicture ? `\nBIGGER PICTURE\n${execSummary.biggerPicture}` : ""
                            ].join("\n");
                            navigator.clipboard.writeText(text);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 p-1"
                          title="Copy to clipboard"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (hypothesis) {
                            await deleteExecutiveSummary(hypothesis.id);
                            setExecSummary(null);
                            setExecSummaryGeneratedAt(null);
                            setShowExecSummary(false);
                            router.refresh();
                          }
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600 p-1"
                        title="Delete summary"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  
                  {/* Prominent regenerate button when stale */}
                  {execSummaryIsStale && !isGeneratingExecSummary && (
                    <button
                      onClick={handleGenerateExecSummary}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh summary with latest updates
                    </button>
                  )}
                  
                  {isGeneratingExecSummary ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <svg className="w-4 h-4 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm text-slate-500">Generating summary...</span>
                    </div>
                  ) : execSummary ? (
                    <div className="space-y-3 text-sm text-slate-600">
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Validation Approach</p>
                        <p className="leading-relaxed">{execSummary.validationPlan}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Progress</p>
                        <p className="leading-relaxed">{execSummary.progressSummary}</p>
                      </div>
                      {execSummary.biggerPicture && (
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Bigger Picture</p>
                          <p className="leading-relaxed">{execSummary.biggerPicture}</p>
                        </div>
                      )}
                      {!execSummaryIsStale && (
                        <button
                          onClick={handleGenerateExecSummary}
                          className="text-xs text-violet-600 hover:text-violet-700"
                        >
                          ↻ Regenerate
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-2">Failed to generate summary. Try again.</p>
                  )}
                </div>
              )}
              
              {/* Validation Suggestions Panel */}
              {showSuggestions && (
                <div className="rounded-lg p-3 space-y-3 bg-emerald-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                        Validation Ideas
                      </span>
                      {suggestionsGeneratedAt && (
                        <span className="text-[10px] text-slate-400">
                          {formatSummaryDate(suggestionsGeneratedAt)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (hypothesis) {
                          await deleteValidationSuggestions(hypothesis.id);
                          setValidationSuggestions(null);
                          setSuggestionsGeneratedAt(null);
                          setShowSuggestions(false);
                          router.refresh();
                        }
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 p-1"
                      title="Delete suggestions"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {isGeneratingSuggestions ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <svg className="w-4 h-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm text-slate-500">Generating suggestions...</span>
                    </div>
                  ) : validationSuggestions && validationSuggestions.suggestions.length > 0 ? (
                    <div className="space-y-2">
                      {validationSuggestions.suggestions.map((suggestion, index) => (
                        <div 
                          key={index}
                          className="p-2 bg-white rounded-md border border-emerald-200 hover:border-emerald-300 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 font-medium">{suggestion.statement}</p>
                              <p className="text-xs text-slate-500 mt-1">{suggestion.reasoning}</p>
                            </div>
                            <button
                              onClick={() => handleAddSuggestion(suggestion, index)}
                              disabled={addingSuggestionIndex === index}
                              className="shrink-0 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded transition-colors disabled:opacity-50"
                              title="Add as sub-hypothesis"
                            >
                              {addingSuggestionIndex === index ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                "+ Add"
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={handleGenerateSuggestions}
                        className="w-full text-xs text-emerald-600 hover:text-emerald-700 py-1"
                      >
                        ↻ Generate more ideas
                      </button>
                    </div>
                  ) : validationSuggestions && validationSuggestions.suggestions.length === 0 ? (
                    <div className="text-sm text-slate-500 py-2">
                      All suggestions have been added! 
                      <button
                        onClick={handleGenerateSuggestions}
                        className="ml-1 text-emerald-600 hover:text-emerald-700"
                      >
                        Generate more
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-2">Failed to generate suggestions. Try again.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confidence - Segmented bar with labels */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Refuted</span>
              <span className="font-medium text-slate-600">Confidence</span>
              <span>Validated</span>
            </div>
            <div className="relative">
              <div className="absolute inset-0 h-2 rounded-full bg-gradient-to-r from-rose-200 via-amber-200 to-emerald-200 opacity-60" />
              <input
                type="range"
                value={form.confidence}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value);
                  setForm((prev) => ({ ...prev, confidence: newValue }));
                }}
                onMouseUp={(e) => {
                  const newValue = parseInt((e.target as HTMLInputElement).value);
                  handleConfidenceSave(newValue);
                }}
                onTouchEnd={(e) => {
                  const newValue = parseInt((e.target as HTMLInputElement).value);
                  handleConfidenceSave(newValue);
                }}
                min={0}
                max={100}
                className="relative w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:border-slate-400"
              />
            </div>
            <div className="text-center">
              <span className={`text-sm font-medium tabular-nums ${getConfidenceColor(form.confidence)}`}>
                {form.confidence}%
              </span>
            </div>
          </div>

          {/* Support Section - only for existing hypothesis */}
          {hypothesis && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Support ({supportingEvidence.length})
                </label>
                <span className="text-[10px] text-slate-400">↑↓ navigate, Enter edit</span>
              </div>
              
              {/* Evidence list with keyboard navigation */}
              <div 
                ref={evidenceListRef}
                className="space-y-2"
                tabIndex={0}
                onKeyDown={handleEvidenceListKeyDown}
                onFocus={() => {
                  if (selectedEvidenceIndex < 0 && supportingEvidence.length > 0) {
                    setSelectedEvidenceIndex(0);
                  }
                }}
                onBlur={(e) => {
                  // Only clear selection if focus moves outside evidence section
                  if (!evidenceListRef.current?.contains(e.relatedTarget as Node)) {
                    setSelectedEvidenceIndex(-1);
                  }
                }}
              >
                {supportingEvidence.map((ev, index) => (
                  editingEvidenceId === ev.id ? (
                    // Editing mode
                    <div 
                      key={ev.id} 
                      className="rounded-lg border-2 border-blue-400 bg-white overflow-hidden"
                    >
                      <textarea
                        ref={editingEvidenceRef}
                        value={editingEvidenceText}
                        onChange={(e) => setEditingEvidenceText(e.target.value)}
                        onKeyDown={handleEditingEvidenceKeyDown}
                        rows={3}
                        className="w-full px-3 py-2 text-sm text-slate-700 border-0 focus:outline-none focus:ring-0 resize-none"
                      />
                      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Enter to save, Esc to cancel</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingEvidenceId(null);
                              setEditingEvidenceText("");
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEditedEvidence}
                            disabled={!editingEvidenceText.trim()}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div 
                      key={ev.id} 
                      className={`group p-3 rounded-lg border transition-all ${
                        selectedEvidenceIndex === index
                          ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div 
                        onClick={() => handleStartEditEvidence(ev, index)}
                        className="cursor-pointer"
                      >
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ev.summary}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-400">
                          {new Date(ev.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          }).replace(/(\d+)/, (day) => {
                            const n = parseInt(day);
                            const suffix = n === 1 || n === 21 || n === 31 ? 'st' 
                              : n === 2 || n === 22 ? 'nd' 
                              : n === 3 || n === 23 ? 'rd' : 'th';
                            return n + suffix;
                          })}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvidence(ev.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-rose-500 transition-opacity"
                          title="Delete evidence"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                ))}
                
                {/* Add support row */}
                {isAddingEvidence ? (
                  <div className="rounded-lg border-2 border-blue-400 bg-white overflow-hidden">
                    <textarea
                      ref={evidenceInputRef}
                      value={newEvidenceText}
                      onChange={(e) => setNewEvidenceText(e.target.value)}
                      onKeyDown={handleEvidenceKeyDown}
                      placeholder="Add supporting evidence, notes, or links..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 border-0 focus:outline-none focus:ring-0 resize-none"
                    />
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">⌘+Enter to save, Esc to cancel</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsAddingEvidence(false);
                            setNewEvidenceText("");
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddEvidence}
                          disabled={!newEvidenceText.trim()}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleStartAddEvidence}
                    className={`w-full py-2 text-xs border border-dashed rounded-lg transition-colors flex items-center justify-center gap-1 ${
                      selectedEvidenceIndex === supportingEvidence.length
                        ? "text-blue-600 bg-blue-50 border-blue-300"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add support
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Challenges Section - only for existing hypothesis */}
          {hypothesis && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Challenges ({challengingEvidence.length})
                </label>
                <span className="text-[10px] text-slate-400">↑↓ navigate, Enter edit</span>
              </div>
              
              {/* Challenge list with keyboard navigation */}
              <div 
                ref={challengeListRef}
                className="space-y-2"
                tabIndex={0}
                onKeyDown={handleChallengeListKeyDown}
                onFocus={() => {
                  if (selectedChallengeIndex < 0 && challengingEvidence.length > 0) {
                    setSelectedChallengeIndex(0);
                  }
                }}
                onBlur={(e) => {
                  // Only clear selection if focus moves outside challenge section
                  if (!challengeListRef.current?.contains(e.relatedTarget as Node)) {
                    setSelectedChallengeIndex(-1);
                  }
                }}
              >
                {challengingEvidence.map((ev, index) => (
                  editingChallengeId === ev.id ? (
                    // Editing mode
                    <div 
                      key={ev.id} 
                      className="rounded-lg border-2 border-rose-400 bg-white overflow-hidden"
                    >
                      <textarea
                        ref={editingChallengeRef}
                        value={editingChallengeText}
                        onChange={(e) => setEditingChallengeText(e.target.value)}
                        onKeyDown={handleEditingChallengeKeyDown}
                        rows={3}
                        className="w-full px-3 py-2 text-sm text-slate-700 border-0 focus:outline-none focus:ring-0 resize-none"
                      />
                      <div className="px-3 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Enter to save, Esc to cancel</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingChallengeId(null);
                              setEditingChallengeText("");
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEditedChallenge}
                            disabled={!editingChallengeText.trim()}
                            className="text-xs px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div 
                      key={ev.id} 
                      className={`group p-3 rounded-lg border transition-all ${
                        selectedChallengeIndex === index
                          ? "bg-rose-50 border-rose-300 ring-2 ring-rose-200"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div 
                        onClick={() => handleStartEditChallenge(ev, index)}
                        className="cursor-pointer"
                      >
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ev.summary}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-400">
                          {new Date(ev.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          }).replace(/(\d+)/, (day) => {
                            const n = parseInt(day);
                            const suffix = n === 1 || n === 21 || n === 31 ? 'st' 
                              : n === 2 || n === 22 ? 'nd' 
                              : n === 3 || n === 23 ? 'rd' : 'th';
                            return n + suffix;
                          })}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvidence(ev.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-rose-500 transition-opacity"
                          title="Delete challenge"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                ))}
                
                {/* Add challenge row */}
                {isAddingChallenge ? (
                  <div className="rounded-lg border-2 border-rose-400 bg-white overflow-hidden">
                    <textarea
                      ref={challengeInputRef}
                      value={newChallengeText}
                      onChange={(e) => setNewChallengeText(e.target.value)}
                      onKeyDown={handleChallengeKeyDown}
                      placeholder="Add a challenge, counter-argument, or risk..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 border-0 focus:outline-none focus:ring-0 resize-none"
                    />
                    <div className="px-3 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">⌘+Enter to save, Esc to cancel</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsAddingChallenge(false);
                            setNewChallengeText("");
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddChallenge}
                          disabled={!newChallengeText.trim()}
                          className="text-xs px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleStartAddChallenge}
                    className={`w-full py-2 text-xs border border-dashed rounded-lg transition-colors flex items-center justify-center gap-1 ${
                      selectedChallengeIndex === challengingEvidence.length
                        ? "text-rose-600 bg-rose-50 border-rose-300"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add challenge
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
});
