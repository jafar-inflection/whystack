import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HypothesisRow } from "../HypothesisRow";
import { createMockHypothesis } from "./utils";

// Mock the server action
jest.mock("@/app/actions/hypotheses", () => ({
  updateHypothesis: jest.fn().mockResolvedValue({ ok: true }),
}));

describe("HypothesisRow", () => {
  const defaultProps = {
    onSelect: jest.fn(),
    isSelected: false,
    depth: 0,
    hasChildren: false,
    isChildrenExpanded: false,
    onToggleChildrenExpand: jest.fn(),
    onDragStart: jest.fn(),
    onDragOver: jest.fn(),
    onDrop: jest.fn(),
    isDragOver: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the hypothesis statement", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Test hypothesis statement",
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      expect(screen.getByText("Test hypothesis statement")).toBeInTheDocument();
    });

    it("renders confidence as visual indicator bar", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 75,
      });

      const { container } = render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      // Check for confidence bar with title attribute
      const confidenceBar = container.querySelector('[title="75% confidence"]');
      expect(confidenceBar).toBeInTheDocument();
      
      // Check inner bar width
      const innerBar = confidenceBar?.querySelector('div');
      expect(innerBar).toHaveStyle({ width: '75%' });
    });

    it("renders tags when present", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        tags: ["tag1", "tag2"],
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      expect(screen.getByText("tag1")).toBeInTheDocument();
      expect(screen.getByText("tag2")).toBeInTheDocument();
    });

    it("shows +N for more than 2 tags", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        tags: ["tag1", "tag2", "tag3", "tag4"],
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      expect(screen.getByText("+2")).toBeInTheDocument();
    });

    it("does not show evidence or challenges counts in list view", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        evidence: [
          {
            id: "ev-1",
            hypothesisId: "test-1",
            kind: "RESEARCH",
            direction: "SUPPORTS",
            strength: 3,
            quality: 3,
            summary: "Evidence",
            sourceUrl: null,
            ownerName: null,
            createdAt: new Date(),
          },
          {
            id: "ev-2",
            hypothesisId: "test-1",
            kind: "RESEARCH",
            direction: "SUPPORTS",
            strength: 3,
            quality: 3,
            summary: "Evidence 2",
            sourceUrl: null,
            ownerName: null,
            createdAt: new Date(),
          },
        ],
        refutations: [
          {
            id: "ref-1",
            hypothesisId: "test-1",
            type: "COUNTEREXAMPLE",
            summary: "Challenge",
            proposedTest: null,
            impact: null,
            ownerName: null,
            createdAt: new Date(),
          },
        ],
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      // Evidence and challenges counts are no longer shown in list view
      expect(screen.queryByText("2E")).not.toBeInTheDocument();
      expect(screen.queryByText("1C")).not.toBeInTheDocument();
    });
  });

  describe("Computed Status Display", () => {
    it("shows NEW status badge for new hypotheses (no evidence/challenges, default confidence)", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 50,
        evidence: [],
        refutations: [],
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      // NEW status should be shown in list view
      expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    it("shows VALIDATED status for confidence > 80", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 85,
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      expect(screen.getByText("VALIDATED")).toBeInTheDocument();
    });

    it("shows REFUTED status for confidence < 20", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 15,
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      expect(screen.getByText("REFUTED")).toBeInTheDocument();
    });

    it("does NOT show IN_TESTING status badge (most common status, hidden in list view)", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 50,
        evidence: [
          {
            id: "ev-1",
            hypothesisId: "test-1",
            kind: "RESEARCH",
            direction: "SUPPORTS",
            strength: 3,
            quality: 3,
            summary: "Evidence",
            sourceUrl: null,
            ownerName: null,
            createdAt: new Date(),
          },
        ],
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      // IN_TESTING is the default state, so we don't show it in the list
      expect(screen.queryByText("IN TESTING")).not.toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("calls onSelect when row is clicked", async () => {
      const onSelect = jest.fn();
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} onSelect={onSelect} />
      );

      await userEvent.click(screen.getByText("Hypothesis test-1"));

      expect(onSelect).toHaveBeenCalled();
    });

    it("applies selected styles when isSelected is true", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} isSelected={true} />
      );

      expect(container.firstChild).toHaveClass("bg-blue-50");
    });
  });

  describe("Inline Title Editing", () => {
    it("enters edit mode on double-click", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      const row = screen.getByText("Original statement");
      await userEvent.dblClick(row);

      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("Original statement");
    });

    it("enters edit mode on Enter key when selected", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      const { container } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} isSelected={true} />
      );

      // Focus the row and press Enter
      const row = container.firstChild as HTMLElement;
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });

      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("exits edit mode on Escape without saving", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      render(<HypothesisRow hypothesis={hypothesis} {...defaultProps} />);

      // Enter edit mode
      await userEvent.dblClick(screen.getByText("Original statement"));

      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "Changed statement");

      // Press Escape
      fireEvent.keyDown(input, { key: "Escape" });

      // Should revert to original and exit edit mode
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("Original statement")).toBeInTheDocument();
    });
  });

  describe("Hierarchical Display", () => {
    it("shows expand chevron when hasChildren is true", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} hasChildren={true} />
      );

      // Should have a button for expanding
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("calls onToggleChildrenExpand when chevron is clicked", async () => {
      const onToggle = jest.fn();
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(
        <HypothesisRow
          hypothesis={hypothesis}
          {...defaultProps}
          hasChildren={true}
          onToggleChildrenExpand={onToggle}
        />
      );

      await userEvent.click(screen.getByRole("button"));

      expect(onToggle).toHaveBeenCalled();
    });

    it("applies indentation based on depth", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} depth={2} />
      );

      // Check that padding is applied (depth * 16 + 12 = 44px for depth 2)
      const innerDiv = container.querySelector('[style*="padding-left"]');
      expect(innerDiv).toHaveStyle({ paddingLeft: "44px" });
    });

    it("continues indentation for deep levels", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} depth={5} />
      );

      // Check that padding continues (depth * 16 + 12 = 92px for depth 5)
      const innerDiv = container.querySelector('[style*="padding-left"]');
      expect(innerDiv).toHaveStyle({ paddingLeft: "92px" });
    });
  });

  describe("Drag and Drop", () => {
    it("calls onDragStart when dragging starts", () => {
      const onDragStart = jest.fn();
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container } = render(
        <HypothesisRow
          hypothesis={hypothesis}
          {...defaultProps}
          onDragStart={onDragStart}
        />
      );

      const draggableElement = container.querySelector('[draggable="true"]');
      fireEvent.dragStart(draggableElement!, {
        dataTransfer: { setData: jest.fn(), effectAllowed: "" },
      });

      expect(onDragStart).toHaveBeenCalledWith("test-1");
    });

    it("applies drag over styles when isDragOver is true (center zone)", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} isDragOver={true} dropZone="center" />
      );

      // Center drop zone shows ring for reparenting
      const innerDiv = container.querySelector(".ring-2");
      expect(innerDiv).toBeInTheDocument();
    });

    it("applies border styles for above/below drop zones", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      const { container, rerender } = render(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} isDragOver={true} dropZone="above" />
      );

      // Above drop zone shows top border
      expect(container.querySelector(".border-t-2")).toBeInTheDocument();

      rerender(
        <HypothesisRow hypothesis={hypothesis} {...defaultProps} isDragOver={true} dropZone="below" />
      );

      // Below drop zone shows bottom border
      expect(container.querySelector(".border-b-2")).toBeInTheDocument();
    });
  });
});
