import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailPane } from "../DetailPane";
import { createMockHypothesis } from "./utils";

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "test-user-id",
        name: "Test User",
        email: "test@inflection.ai",
      },
    },
    status: "authenticated",
  }),
}));

// Mock the server actions
const mockUpdateHypothesis = jest.fn().mockResolvedValue({ ok: true });
const mockCreateHypothesis = jest.fn().mockResolvedValue({ ok: true, data: { id: "new-id" } });
const mockCreateChildHypothesisAndEdge = jest.fn().mockResolvedValue({ ok: true, data: { id: "child-id" } });
const mockAddEvidence = jest.fn().mockResolvedValue({ ok: true });
const mockAddRefutation = jest.fn().mockResolvedValue({ ok: true });
const mockArchiveHypothesis = jest.fn().mockResolvedValue({ ok: true });
const mockDeleteHypothesis = jest.fn().mockResolvedValue({ ok: true });
const mockGetAllUsers = jest.fn().mockResolvedValue({ ok: true, data: [] });
const mockSetHypothesisOwner = jest.fn().mockResolvedValue({ ok: true });
const mockWatchHypothesis = jest.fn().mockResolvedValue({ ok: true });
const mockUnwatchHypothesis = jest.fn().mockResolvedValue({ ok: true });

jest.mock("@/app/actions/hypotheses", () => ({
  updateHypothesis: (...args: unknown[]) => mockUpdateHypothesis(...args),
  createHypothesis: (...args: unknown[]) => mockCreateHypothesis(...args),
  createChildHypothesisAndEdge: (...args: unknown[]) => mockCreateChildHypothesisAndEdge(...args),
  addEvidence: (...args: unknown[]) => mockAddEvidence(...args),
  addRefutation: (...args: unknown[]) => mockAddRefutation(...args),
  archiveHypothesis: (...args: unknown[]) => mockArchiveHypothesis(...args),
  deleteHypothesis: (...args: unknown[]) => mockDeleteHypothesis(...args),
  getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
  setHypothesisOwner: (...args: unknown[]) => mockSetHypothesisOwner(...args),
  watchHypothesis: (...args: unknown[]) => mockWatchHypothesis(...args),
  unwatchHypothesis: (...args: unknown[]) => mockUnwatchHypothesis(...args),
}));

describe("DetailPane", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Empty State", () => {
    it("shows empty state when no hypothesis selected and not adding new", () => {
      render(<DetailPane hypothesis={null} isNew={false} />);

      expect(screen.getByText("Select a hypothesis")).toBeInTheDocument();
    });
  });

  describe("New Hypothesis Mode", () => {
    it("shows NEW status badge when creating new root hypothesis", () => {
      render(<DetailPane hypothesis={null} isNew={true} />);

      expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    it("shows NEW status badge when creating with parentId", () => {
      render(<DetailPane hypothesis={null} isNew={true} parentId="parent-1" />);

      expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    it("calls createHypothesis when saving new root hypothesis", async () => {
      const onCreated = jest.fn();
      render(<DetailPane hypothesis={null} isNew={true} onCreated={onCreated} />);

      const statementInput = screen.getByPlaceholderText("What do you believe to be true?");
      await userEvent.type(statementInput, "New hypothesis statement");
      fireEvent.blur(statementInput);

      await waitFor(() => {
        expect(mockCreateHypothesis).toHaveBeenCalledWith(
          expect.objectContaining({
            statement: "New hypothesis statement",
          })
        );
      });
    });

    it("calls createChildHypothesisAndEdge when saving with parentId", async () => {
      const onCreated = jest.fn();
      render(
        <DetailPane
          hypothesis={null}
          isNew={true}
          parentId="parent-1"
          onCreated={onCreated}
        />
      );

      const statementInput = screen.getByPlaceholderText("What do you believe to be true?");
      await userEvent.type(statementInput, "New child hypothesis");
      fireEvent.blur(statementInput);

      await waitFor(() => {
        expect(mockCreateChildHypothesisAndEdge).toHaveBeenCalledWith(
          "parent-1",
          expect.objectContaining({
            statement: "New child hypothesis",
          })
        );
      });
    });

    it("calls onCreated callback after successful creation", async () => {
      const onCreated = jest.fn();
      render(<DetailPane hypothesis={null} isNew={true} onCreated={onCreated} />);

      const statementInput = screen.getByPlaceholderText("What do you believe to be true?");
      await userEvent.type(statementInput, "New hypothesis");
      fireEvent.blur(statementInput);

      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledWith("new-id");
      });
    });
  });

  describe("Edit Hypothesis Mode", () => {
    it("shows status badge when editing existing", () => {
      // With confidence at 60 (not default 50), it should be IN_TESTING
      const hypothesis = createMockHypothesis({ id: "test-1", confidence: 60 });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Should show IN TESTING status (confidence modified from default)
      expect(screen.getByText("IN TESTING")).toBeInTheDocument();
    });

    it("populates form with hypothesis data", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Test statement",
        confidence: 75,
        tags: ["tag1", "tag2"],
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      expect(screen.getByDisplayValue("Test statement")).toBeInTheDocument();
      expect(screen.getByDisplayValue("tag1, tag2")).toBeInTheDocument();
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("calls updateHypothesis on blur", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      const statementInput = screen.getByDisplayValue("Original statement");
      await userEvent.clear(statementInput);
      await userEvent.type(statementInput, "Updated statement");
      fireEvent.blur(statementInput);

      await waitFor(() => {
        expect(mockUpdateHypothesis).toHaveBeenCalledWith(
          "test-1",
          expect.objectContaining({
            statement: "Updated statement",
          })
        );
      });
    });

    it("does not save if statement is empty", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      const statementInput = screen.getByDisplayValue("Original statement");
      await userEvent.clear(statementInput);
      fireEvent.blur(statementInput);

      await waitFor(() => {
        expect(mockUpdateHypothesis).not.toHaveBeenCalled();
      });
    });
  });

  describe("Confidence Slider", () => {
    it("saves immediately when slider is released", async () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 50,
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      const slider = screen.getByRole("slider");
      
      // Simulate changing and releasing the slider
      fireEvent.change(slider, { target: { value: "80" } });
      fireEvent.mouseUp(slider);

      await waitFor(() => {
        expect(mockUpdateHypothesis).toHaveBeenCalledWith(
          "test-1",
          expect.objectContaining({
            confidence: 80,
          })
        );
      });
    });

    it("updates displayed confidence value in real-time", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 50,
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "75" } });

      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  describe("Computed Status Display", () => {
    it("shows NEW status for new hypothesis with default confidence", () => {
      render(<DetailPane hypothesis={null} isNew={true} />);

      expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    it("shows VALIDATED status when confidence > 80", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 85,
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      expect(screen.getByText("VALIDATED")).toBeInTheDocument();
    });

    it("shows REFUTED status when confidence < 20", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 15,
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      expect(screen.getByText("REFUTED")).toBeInTheDocument();
    });

    it("updates status in real-time as confidence changes", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        confidence: 50,
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Initially should show NEW (no evidence)
      expect(screen.getByText("NEW")).toBeInTheDocument();

      // Change confidence to > 80
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "85" } });

      // Should now show VALIDATED
      expect(screen.getByText("VALIDATED")).toBeInTheDocument();
    });
  });

  describe("Archive Functionality", () => {
    it("shows Archive option in actions menu for existing hypothesis", async () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Open the actions menu
      await userEvent.click(screen.getByLabelText("More actions"));
      
      expect(screen.getByText("Archive")).toBeInTheDocument();
    });

    it("does not show actions menu for new hypothesis", () => {
      render(<DetailPane hypothesis={null} isNew={true} />);

      expect(screen.queryByLabelText("More actions")).not.toBeInTheDocument();
    });

    it("calls archiveHypothesis when Archive is clicked", async () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Open the actions menu and click Archive
      await userEvent.click(screen.getByLabelText("More actions"));
      await userEvent.click(screen.getByText("Archive"));

      expect(mockArchiveHypothesis).toHaveBeenCalledWith("test-1", true, "test-user-id", "Test User");
    });
  });

  describe("Delete Functionality", () => {
    beforeEach(() => {
      // Mock window.confirm
      jest.spyOn(window, "confirm").mockReturnValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("shows Delete option in actions menu for existing hypothesis", async () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Open the actions menu
      await userEvent.click(screen.getByLabelText("More actions"));
      
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("does not show actions menu for new hypothesis", () => {
      render(<DetailPane hypothesis={null} isNew={true} />);

      expect(screen.queryByLabelText("More actions")).not.toBeInTheDocument();
    });

    it("calls deleteHypothesis when Delete is clicked and confirmed", async () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });
      const onDeleted = jest.fn();

      render(<DetailPane hypothesis={hypothesis} isNew={false} onDeleted={onDeleted} />);

      // Open the actions menu and click Delete
      await userEvent.click(screen.getByLabelText("More actions"));
      await userEvent.click(screen.getByText("Delete"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockDeleteHypothesis).toHaveBeenCalledWith("test-1", "test-user-id", "Test User");
      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalled();
      });
    });

    it("does not call deleteHypothesis when Delete is cancelled", async () => {
      jest.spyOn(window, "confirm").mockReturnValue(false);
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Open the actions menu and click Delete
      await userEvent.click(screen.getByLabelText("More actions"));
      await userEvent.click(screen.getByText("Delete"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockDeleteHypothesis).not.toHaveBeenCalled();
    });
  });

  describe("Support Section", () => {
    it("shows support section for existing hypothesis", () => {
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      // Section header includes count
      expect(screen.getByText(/Support/)).toBeInTheDocument();
    });

    it("does not show support section for new hypothesis", () => {
      render(<DetailPane hypothesis={null} isNew={true} />);

      expect(screen.queryByText("Support")).not.toBeInTheDocument();
    });

    it("displays existing evidence", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        evidence: [
          {
            id: "ev-1",
            hypothesisId: "test-1",
            kind: "RESEARCH",
            direction: "SUPPORTS",
            strength: 4,
            quality: 3,
            summary: "Research shows positive results",
            sourceUrl: null,
            ownerName: null,
            createdAt: new Date(),
          },
        ],
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      expect(screen.getByText("Research shows positive results")).toBeInTheDocument();
    });

    it("shows Add support button when empty", () => {
      const hypothesis = createMockHypothesis({
        id: "test-1",
        evidence: [],
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      expect(screen.getByText("Add support")).toBeInTheDocument();
    });
  });

  describe("Form Persistence", () => {
    it("does not reset form when same hypothesis refreshes", async () => {
      const hypothesis1 = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      const { rerender } = render(
        <DetailPane hypothesis={hypothesis1} isNew={false} />
      );

      // Type something
      const statementInput = screen.getByDisplayValue("Original statement");
      await userEvent.clear(statementInput);
      await userEvent.type(statementInput, "Modified statement");

      // Rerender with same hypothesis ID but new object reference (simulating refresh)
      const hypothesis2 = createMockHypothesis({
        id: "test-1",
        statement: "Original statement",
      });

      rerender(<DetailPane hypothesis={hypothesis2} isNew={false} />);

      // Should keep the modified value, not reset
      expect(screen.getByDisplayValue("Modified statement")).toBeInTheDocument();
    });

    it("resets form when switching to different hypothesis", async () => {
      const hypothesis1 = createMockHypothesis({
        id: "test-1",
        statement: "First hypothesis",
      });

      const { rerender } = render(
        <DetailPane hypothesis={hypothesis1} isNew={false} />
      );

      // Type something
      const statementInput = screen.getByDisplayValue("First hypothesis");
      await userEvent.clear(statementInput);
      await userEvent.type(statementInput, "Modified");

      // Switch to different hypothesis
      const hypothesis2 = createMockHypothesis({
        id: "test-2",
        statement: "Second hypothesis",
      });

      rerender(<DetailPane hypothesis={hypothesis2} isNew={false} />);

      // Should show new hypothesis data
      expect(screen.getByDisplayValue("Second hypothesis")).toBeInTheDocument();
    });
  });

  describe("Save Status Indicator", () => {
    it("shows 'Saving...' while saving", async () => {
      // Make the mock slow to resolve
      mockUpdateHypothesis.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
      );

      const hypothesis = createMockHypothesis({
        id: "test-1",
        statement: "Test",
      });

      render(<DetailPane hypothesis={hypothesis} isNew={false} />);

      const statementInput = screen.getByDisplayValue("Test");
      await userEvent.type(statementInput, " updated");
      fireEvent.blur(statementInput);

      expect(screen.getByText("Saving")).toBeInTheDocument();
    });
  });

  describe("Escape to List", () => {
    it("calls onEscapeToList when Escape is pressed in the pane", () => {
      const onEscapeToList = jest.fn();
      const hypothesis = createMockHypothesis({ id: "test-1" });

      render(
        <DetailPane
          hypothesis={hypothesis}
          isNew={false}
          onEscapeToList={onEscapeToList}
        />
      );

      // Focus an element in the pane
      const statementInput = screen.getByDisplayValue("Hypothesis test-1");
      statementInput.focus();

      fireEvent.keyDown(statementInput, { key: "Escape" });

      expect(onEscapeToList).toHaveBeenCalled();
    });
  });
});
