import {
  EvidenceDirection,
  EvidenceKind,
  RefutationType,
} from "@prisma/client";

export type { EvidenceDirection, EvidenceKind, RefutationType };

// Computed status based on confidence and activity
export type ComputedStatus = "NEW" | "IN_TESTING" | "VALIDATED" | "REFUTED" | "ARCHIVED";

export function computeStatus(
  confidence: number,
  evidenceCount: number,
  refutationCount: number,
  isArchived: boolean,
  hasTags: boolean = false
): ComputedStatus {
  if (isArchived) return "ARCHIVED";
  if (confidence > 80) return "VALIDATED";
  if (confidence < 20) return "REFUTED";
  
  // Check if hypothesis has any activity that moves it from NEW to IN_TESTING:
  // - Evidence or challenges added
  // - Confidence manually modified (different from default 50)
  // - Tags added
  const hasActivity = evidenceCount > 0 || refutationCount > 0 || confidence !== 50 || hasTags;
  
  if (hasActivity) return "IN_TESTING";
  return "NEW";
}

export const STATUS_COLORS: Record<ComputedStatus, string> = {
  NEW: "bg-gray-100 text-gray-600",
  IN_TESTING: "bg-blue-100 text-blue-700",
  VALIDATED: "bg-green-100 text-green-700",
  REFUTED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-gray-200 text-gray-500",
};

export const EVIDENCE_DIRECTIONS: EvidenceDirection[] = [
  "SUPPORTS",
  "WEAKLY_SUPPORTS",
  "NEUTRAL",
  "WEAKLY_REFUTES",
  "REFUTES",
];

export const EVIDENCE_KINDS: EvidenceKind[] = [
  "EXPERIMENT",
  "RESEARCH",
  "DATA_ANALYSIS",
  "EXTERNAL",
  "OPS",
];

export const REFUTATION_TYPES: RefutationType[] = [
  "COUNTEREXAMPLE",
  "ALTERNATIVE_HYPOTHESIS",
  "EVIDENCE_CRITIQUE",
  "SCOPE_MISMATCH",
];

// Form data types
export interface HypothesisFormData {
  statement: string;
  description: string;
  confidence: number;
  tags: string;
}

export interface EvidenceFormData {
  direction: EvidenceDirection;
  kind: EvidenceKind;
  strength: number;
  quality: number;
  summary: string;
  sourceUrl: string;
}

export interface RefutationFormData {
  type: RefutationType;
  summary: string;
  proposedTest: string;
  impact: string;
}

// Default values
export const DEFAULT_HYPOTHESIS_FORM: HypothesisFormData = {
  statement: "",
  description: "",
  confidence: 50,
  tags: "",
};

export const DEFAULT_EVIDENCE_FORM: EvidenceFormData = {
  direction: "SUPPORTS",
  kind: "RESEARCH",
  strength: 3,
  quality: 3,
  summary: "",
  sourceUrl: "",
};

export const DEFAULT_REFUTATION_FORM: RefutationFormData = {
  type: "COUNTEREXAMPLE",
  summary: "",
  proposedTest: "",
  impact: "",
};
