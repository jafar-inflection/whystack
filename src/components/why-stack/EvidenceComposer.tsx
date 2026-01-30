"use client";

import { useState, useRef, useEffect } from "react";
import {
  EvidenceFormData,
  DEFAULT_EVIDENCE_FORM,
  EVIDENCE_DIRECTIONS,
  EVIDENCE_KINDS,
  EvidenceDirection,
  EvidenceKind,
} from "./types";

interface EvidenceComposerProps {
  onSave: (data: EvidenceFormData) => Promise<void>;
  onCancel: () => void;
}

const DIRECTION_LABELS: Record<EvidenceDirection, string> = {
  SUPPORTS: "Supports",
  WEAKLY_SUPPORTS: "Weak +",
  NEUTRAL: "Neutral",
  WEAKLY_REFUTES: "Weak -",
  REFUTES: "Refutes",
};

const DIRECTION_COLORS: Record<EvidenceDirection, string> = {
  SUPPORTS: "bg-green-100 text-green-700 border-green-200",
  WEAKLY_SUPPORTS: "bg-green-50 text-green-600 border-green-100",
  NEUTRAL: "bg-gray-100 text-gray-600 border-gray-200",
  WEAKLY_REFUTES: "bg-red-50 text-red-600 border-red-100",
  REFUTES: "bg-red-100 text-red-700 border-red-200",
};

const KIND_LABELS: Record<EvidenceKind, string> = {
  EXPERIMENT: "Experiment",
  RESEARCH: "Research",
  DATA_ANALYSIS: "Data",
  EXTERNAL: "External",
  OPS: "Ops",
};

export function EvidenceComposer({ onSave, onCancel }: EvidenceComposerProps) {
  const [form, setForm] = useState<EvidenceFormData>(DEFAULT_EVIDENCE_FORM);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
      setForm(DEFAULT_EVIDENCE_FORM);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded p-2 border border-gray-200 space-y-2 text-xs" onKeyDown={handleKeyDown}>
      {/* Direction chips */}
      <div className="flex flex-wrap gap-1">
        {EVIDENCE_DIRECTIONS.map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => setForm({ ...form, direction: dir })}
            className={`px-2 py-0.5 rounded border text-[10px] ${
              form.direction === dir
                ? DIRECTION_COLORS[dir]
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {DIRECTION_LABELS[dir]}
          </button>
        ))}
      </div>

      {/* Kind and Strength */}
      <div className="flex gap-2 items-center">
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as EvidenceKind })}
          className="px-1.5 py-1 border border-gray-300 rounded bg-white"
        >
          {EVIDENCE_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <span className="text-gray-500">S:</span>
        <select
          value={form.strength}
          onChange={(e) => setForm({ ...form, strength: parseInt(e.target.value) })}
          className="px-1 py-1 border border-gray-300 rounded bg-white w-12"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-gray-500">Q:</span>
        <select
          value={form.quality}
          onChange={(e) => setForm({ ...form, quality: parseInt(e.target.value) })}
          className="px-1 py-1 border border-gray-300 rounded bg-white w-12"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <input
        ref={summaryRef}
        type="text"
        value={form.summary}
        onChange={(e) => setForm({ ...form, summary: e.target.value })}
        placeholder="Summary..."
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
      />

      {/* Source URL */}
      <input
        type="url"
        value={form.sourceUrl}
        onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
        placeholder="Source URL (optional)"
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
          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "..." : "Add"}
        </button>
      </div>
    </div>
  );
}
