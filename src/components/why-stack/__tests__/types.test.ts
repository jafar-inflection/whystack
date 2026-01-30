import { computeStatus, ComputedStatus } from "../types";

describe("computeStatus", () => {
  describe("ARCHIVED status", () => {
    it("returns ARCHIVED when isArchived is true regardless of other values", () => {
      expect(computeStatus(50, 5, 3, true)).toBe("ARCHIVED");
      expect(computeStatus(90, 0, 0, true)).toBe("ARCHIVED");
      expect(computeStatus(10, 0, 0, true)).toBe("ARCHIVED");
    });
  });

  describe("VALIDATED status", () => {
    it("returns VALIDATED when confidence > 80", () => {
      expect(computeStatus(81, 0, 0, false)).toBe("VALIDATED");
      expect(computeStatus(90, 5, 3, false)).toBe("VALIDATED");
      expect(computeStatus(100, 0, 0, false)).toBe("VALIDATED");
    });

    it("does not return VALIDATED when confidence is exactly 80", () => {
      expect(computeStatus(80, 5, 3, false)).not.toBe("VALIDATED");
    });
  });

  describe("REFUTED status", () => {
    it("returns REFUTED when confidence < 20", () => {
      expect(computeStatus(19, 0, 0, false)).toBe("REFUTED");
      expect(computeStatus(10, 5, 3, false)).toBe("REFUTED");
      expect(computeStatus(0, 0, 0, false)).toBe("REFUTED");
    });

    it("does not return REFUTED when confidence is exactly 20", () => {
      expect(computeStatus(20, 5, 3, false)).not.toBe("REFUTED");
    });
  });

  describe("NEW status", () => {
    it("returns NEW when no activity (default confidence, no evidence, no challenges, no tags)", () => {
      expect(computeStatus(50, 0, 0, false, false)).toBe("NEW");
    });

    it("returns NEW when confidence is exactly 50 and no other activity", () => {
      expect(computeStatus(50, 0, 0, false)).toBe("NEW");
    });
  });

  describe("IN_TESTING status", () => {
    it("returns IN_TESTING when has evidence (confidence 20-80)", () => {
      expect(computeStatus(50, 1, 0, false)).toBe("IN_TESTING");
      expect(computeStatus(50, 5, 0, false)).toBe("IN_TESTING");
    });

    it("returns IN_TESTING when has challenges (confidence 20-80)", () => {
      expect(computeStatus(50, 0, 1, false)).toBe("IN_TESTING");
      expect(computeStatus(50, 0, 5, false)).toBe("IN_TESTING");
    });

    it("returns IN_TESTING when has both evidence and challenges (confidence 20-80)", () => {
      expect(computeStatus(50, 3, 2, false)).toBe("IN_TESTING");
    });

    it("returns IN_TESTING when confidence is modified from default (confidence 20-80)", () => {
      expect(computeStatus(60, 0, 0, false)).toBe("IN_TESTING");
      expect(computeStatus(40, 0, 0, false)).toBe("IN_TESTING");
      expect(computeStatus(20, 0, 0, false)).toBe("IN_TESTING");
      expect(computeStatus(80, 0, 0, false)).toBe("IN_TESTING");
    });

    it("returns IN_TESTING when has tags (confidence 20-80)", () => {
      expect(computeStatus(50, 0, 0, false, true)).toBe("IN_TESTING");
    });
  });

  describe("status priority", () => {
    it("ARCHIVED takes precedence over VALIDATED", () => {
      expect(computeStatus(90, 5, 3, true)).toBe("ARCHIVED");
    });

    it("ARCHIVED takes precedence over REFUTED", () => {
      expect(computeStatus(10, 5, 3, true)).toBe("ARCHIVED");
    });

    it("VALIDATED takes precedence over IN_TESTING", () => {
      expect(computeStatus(85, 5, 3, false)).toBe("VALIDATED");
    });

    it("REFUTED takes precedence over IN_TESTING", () => {
      expect(computeStatus(15, 5, 3, false)).toBe("REFUTED");
    });
  });
});
