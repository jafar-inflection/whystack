import { calculateConfidence, calculateNewConfidence } from "../confidence";

describe("calculateConfidence", () => {
  describe("base case", () => {
    it("returns 50 when no evidence exists", () => {
      expect(calculateConfidence([])).toBe(50);
    });
  });

  describe("supporting evidence", () => {
    it("increases confidence for SUPPORTS direction", () => {
      const evidence = [{ direction: "SUPPORTS" as const, strength: 3 }];
      // 50 + (1 × 3 × 3) = 59
      expect(calculateConfidence(evidence)).toBe(59);
    });

    it("increases confidence less for WEAKLY_SUPPORTS", () => {
      const evidence = [{ direction: "WEAKLY_SUPPORTS" as const, strength: 3 }];
      // 50 + (0.5 × 3 × 3) = 54.5 → 55
      expect(calculateConfidence(evidence)).toBe(55);
    });

    it("increases more with higher strength", () => {
      const evidence = [{ direction: "SUPPORTS" as const, strength: 5 }];
      // 50 + (1 × 5 × 3) = 65
      expect(calculateConfidence(evidence)).toBe(65);
    });
  });

  describe("refuting evidence", () => {
    it("decreases confidence for REFUTES direction", () => {
      const evidence = [{ direction: "REFUTES" as const, strength: 3 }];
      // 50 + (-1 × 3 × 3) = 41
      expect(calculateConfidence(evidence)).toBe(41);
    });

    it("decreases confidence less for WEAKLY_REFUTES", () => {
      const evidence = [{ direction: "WEAKLY_REFUTES" as const, strength: 3 }];
      // 50 + (-0.5 × 3 × 3) = 45.5 → 46
      expect(calculateConfidence(evidence)).toBe(46);
    });
  });

  describe("neutral evidence", () => {
    it("does not change confidence for NEUTRAL direction", () => {
      const evidence = [{ direction: "NEUTRAL" as const, strength: 5 }];
      // 50 + (0 × 5 × 3) = 50
      expect(calculateConfidence(evidence)).toBe(50);
    });
  });

  describe("multiple evidence", () => {
    it("combines multiple supporting evidence", () => {
      const evidence = [
        { direction: "SUPPORTS" as const, strength: 4 },
        { direction: "SUPPORTS" as const, strength: 3 },
      ];
      // 50 + (1 × 4 × 3) + (1 × 3 × 3) = 50 + 12 + 9 = 71
      expect(calculateConfidence(evidence)).toBe(71);
    });

    it("balances supporting and refuting evidence", () => {
      const evidence = [
        { direction: "SUPPORTS" as const, strength: 4 },
        { direction: "REFUTES" as const, strength: 3 },
      ];
      // 50 + (1 × 4 × 3) + (-1 × 3 × 3) = 50 + 12 - 9 = 53
      expect(calculateConfidence(evidence)).toBe(53);
    });

    it("handles mixed evidence types", () => {
      const evidence = [
        { direction: "SUPPORTS" as const, strength: 5 },
        { direction: "WEAKLY_SUPPORTS" as const, strength: 3 },
        { direction: "NEUTRAL" as const, strength: 4 },
        { direction: "WEAKLY_REFUTES" as const, strength: 2 },
      ];
      // 50 + (1×5×3) + (0.5×3×3) + (0×4×3) + (-0.5×2×3)
      // = 50 + 15 + 4.5 + 0 - 3 = 66.5 → 67
      expect(calculateConfidence(evidence)).toBe(67);
    });
  });

  describe("edge cases", () => {
    it("clamps to maximum 100", () => {
      const evidence = [
        { direction: "SUPPORTS" as const, strength: 5 },
        { direction: "SUPPORTS" as const, strength: 5 },
        { direction: "SUPPORTS" as const, strength: 5 },
        { direction: "SUPPORTS" as const, strength: 5 },
        { direction: "SUPPORTS" as const, strength: 5 },
      ];
      // Would be 50 + (5 × 15) = 125, clamped to 100
      expect(calculateConfidence(evidence)).toBe(100);
    });

    it("clamps to minimum 0", () => {
      const evidence = [
        { direction: "REFUTES" as const, strength: 5 },
        { direction: "REFUTES" as const, strength: 5 },
        { direction: "REFUTES" as const, strength: 5 },
        { direction: "REFUTES" as const, strength: 5 },
        { direction: "REFUTES" as const, strength: 5 },
      ];
      // Would be 50 + (5 × -15) = -25, clamped to 0
      expect(calculateConfidence(evidence)).toBe(0);
    });

    it("clamps strength values to 1-5 range", () => {
      const evidence = [{ direction: "SUPPORTS" as const, strength: 10 }];
      // Strength clamped to 5: 50 + (1 × 5 × 3) = 65
      expect(calculateConfidence(evidence)).toBe(65);
    });
  });
});

describe("calculateNewConfidence", () => {
  it("calculates confidence including new evidence", () => {
    const currentEvidence = [{ direction: "SUPPORTS" as const, strength: 3 }];
    const newEvidence = { direction: "SUPPORTS" as const, strength: 4 };
    
    // 50 + (1×3×3) + (1×4×3) = 50 + 9 + 12 = 71
    expect(calculateNewConfidence(currentEvidence, newEvidence)).toBe(71);
  });

  it("shows impact of adding refuting evidence", () => {
    const currentEvidence = [{ direction: "SUPPORTS" as const, strength: 4 }];
    const newEvidence = { direction: "REFUTES" as const, strength: 5 };
    
    // 50 + (1×4×3) + (-1×5×3) = 50 + 12 - 15 = 47
    expect(calculateNewConfidence(currentEvidence, newEvidence)).toBe(47);
  });
});
