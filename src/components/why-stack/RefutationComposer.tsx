"use client";

import { useState, useRef, useEffect } from "react";
import {
  RefutationFormData,
  DEFAULT_REFUTATION_FORM,
  REFUTATION_TYPES,
  RefutationType,
} from "./types";

interface RefutationComposerProps {
  onSave: (data: RefutationFormData) => Promise<void>;
  onCancel: () => void;
}

const TYPE_LABELS: Record<RefutationType, string> = {
  COUNTEREXAMPLE: "Counterexample",
  ALTERNATIVE_HYPOTHESIS: "Alternative",
  EVIDENCE_CRITIQUE: "Evidence Critique",
  SCOPE_MISMATCH: "Scope Mismatch",
};

export function RefutationComposer({ onSave, onCancel }: RefutationComposerProps) {
  const [form, setForm] = useState<RefutationFormData>(DEFAULT_REFUTATION_FORM);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSave = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      setForm(DEFAULT_REFUTATION_FORM);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded p-2 border border-gray-200 space-y-2 text-xs" onKeyDown={handleKeyDown}>
      {/* Type */}
      <select
        value={form.type}
        onChange={(e) => setForm({ ...form, type: e.target.value as RefutationType })}
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
      >
        {REFUTATION_TYPES.map((t) => (
          <option key={t} value={t}>{TYPE_LABELS[t]}</option>
        ))}
      </select>

      {/* Summary */}
      <textarea
        ref={summaryRef}
        value={form.summary}
        onChange={(e) => setForm({ ...form, summary: e.target.value })}
        placeholder="Challenge summary..."
        rows={2}
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white resize-none"
      />

      {/* Proposed Test */}
      <input
        type="text"
        value={form.proposedTest}
        onChange={(e) => setForm({ ...form, proposedTest: e.target.value })}
        placeholder="Proposed test (optional)"
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
      />

      {/* Actions */}
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} className="px-2 py-1 text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.summary.trim()}
          className="px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "..." : "Add"}
        </button>
      </div>
    </div>
  );
}
