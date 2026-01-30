import type { HypothesisWithRelations } from "@/app/actions/hypotheses";

// Factory function to create mock hypotheses
export function createMockHypothesis(
  overrides: Partial<HypothesisWithRelations> & { id: string }
): HypothesisWithRelations {
  return {
    id: overrides.id,
    statement: overrides.statement ?? `Hypothesis ${overrides.id}`,
    description: overrides.description ?? null,
    confidence: overrides.confidence ?? 50,
    confidenceIsManual: overrides.confidenceIsManual ?? false,
    impactScore: overrides.impactScore ?? 0,
    tags: overrides.tags ?? [],
    order: overrides.order ?? 0,
    isArchived: overrides.isArchived ?? false,
    execSummaryValidation: overrides.execSummaryValidation ?? null,
    execSummaryProgress: overrides.execSummaryProgress ?? null,
    execSummaryBigPicture: overrides.execSummaryBigPicture ?? null,
    execSummaryGeneratedAt: overrides.execSummaryGeneratedAt ?? null,
    contentUpdatedAt: overrides.contentUpdatedAt ?? new Date("2024-01-01"),
    ownerId: overrides.ownerId ?? null,
    ownerName: overrides.ownerName ?? null,
    owner: overrides.owner ?? null,
    watchers: overrides.watchers ?? [],
    createdAt: overrides.createdAt ?? new Date("2024-01-01"),
    updatedAt: overrides.updatedAt ?? new Date("2024-01-01"),
    evidence: overrides.evidence ?? [],
    refutations: overrides.refutations ?? [],
    children: overrides.children ?? [],
    parents: overrides.parents ?? [],
  };
}

// Create a set of mock hypotheses with parent-child relationships
export function createMockHypothesesWithHierarchy() {
  const parent1 = createMockHypothesis({
    id: "parent-1",
    statement: "Parent hypothesis 1",
    confidence: 50,
    children: [
      {
        id: "edge-1",
        parentId: "parent-1",
        childId: "child-1",
        label: "depends on",
        order: 0,
        createdAt: new Date(),
        child: {
          id: "child-1",
          statement: "Child hypothesis 1",
          confidence: 60,
          tags: [],
          isArchived: false,
        },
      },
      {
        id: "edge-2",
        parentId: "parent-1",
        childId: "child-2",
        label: "depends on",
        order: 1,
        createdAt: new Date(),
        child: {
          id: "child-2",
          statement: "Child hypothesis 2",
          confidence: 40,
          tags: [],
          isArchived: false,
        },
      },
    ],
  });

  const child1 = createMockHypothesis({
    id: "child-1",
    statement: "Child hypothesis 1",
    confidence: 60,
    parents: [{ parentId: "parent-1" }],
  });

  const child2 = createMockHypothesis({
    id: "child-2",
    statement: "Child hypothesis 2",
    confidence: 40,
    parents: [{ parentId: "parent-1" }],
  });

  const parent2 = createMockHypothesis({
    id: "parent-2",
    statement: "Parent hypothesis 2",
    confidence: 85, // VALIDATED status
  });

  return [parent1, child1, child2, parent2];
}

// Create hypotheses with various statuses for status testing
export function createMockHypothesesWithStatuses() {
  return [
    // NEW: no evidence, no challenges, confidence 20-80
    createMockHypothesis({
      id: "new-hypothesis",
      statement: "New hypothesis",
      confidence: 50,
      evidence: [],
      refutations: [],
    }),
    // IN_TESTING: has evidence, confidence 20-80
    createMockHypothesis({
      id: "testing-hypothesis",
      statement: "Testing hypothesis",
      confidence: 60,
      evidence: [
        {
          id: "ev-1",
          hypothesisId: "testing-hypothesis",
          kind: "RESEARCH",
          direction: "SUPPORTS",
          strength: 3,
          quality: 3,
          summary: "Some evidence",
          sourceUrl: null,
          ownerName: null,
          createdAt: new Date(),
        },
      ],
    }),
    // VALIDATED: confidence > 80
    createMockHypothesis({
      id: "supported-hypothesis",
      statement: "Supported hypothesis",
      confidence: 85,
    }),
    // REFUTED: confidence < 20
    createMockHypothesis({
      id: "refuted-hypothesis",
      statement: "Refuted hypothesis",
      confidence: 15,
    }),
  ];
}
