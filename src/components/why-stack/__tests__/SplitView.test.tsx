import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SplitView } from "../SplitView";
import { createMockHypothesis, createMockHypothesesWithHierarchy } from "./utils";

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
jest.mock("@/app/actions/hypotheses", () => ({
  updateHypothesis: jest.fn().mockResolvedValue({ ok: true }),
  createHypothesis: jest.fn().mockResolvedValue({ ok: true, data: { id: "new-id" } }),
  createChildHypothesisAndEdge: jest.fn().mockResolvedValue({ ok: true, data: { id: "child-id" } }),
  addEvidence: jest.fn().mockResolvedValue({ ok: true }),
  addRefutation: jest.fn().mockResolvedValue({ ok: true }),
  archiveHypothesis: jest.fn().mockResolvedValue({ ok: true }),
  reorderHypotheses: jest.fn().mockResolvedValue({ ok: true }),
  getAllUsers: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  setHypothesisOwner: jest.fn().mockResolvedValue({ ok: true }),
  watchHypothesis: jest.fn().mockResolvedValue({ ok: true }),
  unwatchHypothesis: jest.fn().mockResolvedValue({ ok: true }),
}));

describe("SplitView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial Load", () => {
    it("renders both list and detail panes", () => {
      const hypotheses = [createMockHypothesis({ id: "1" })];

      render(<SplitView hypotheses={hypotheses} />);

      // List pane should show hypothesis (appears in both list and detail)
      expect(screen.getAllByText("Hypothesis 1").length).toBeGreaterThanOrEqual(1);

      // Detail pane should show confidence slider (auto-selected first item)
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("auto-selects first root hypothesis on load", async () => {
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First hypothesis" }),
        createMockHypothesis({ id: "2", statement: "Second hypothesis" }),
      ];

      render(<SplitView hypotheses={hypotheses} />);

      // First hypothesis should be selected and shown in detail pane
      await waitFor(() => {
        expect(screen.getByDisplayValue("First hypothesis")).toBeInTheDocument();
      });
    });

    it("shows empty detail pane when no hypotheses exist", () => {
      render(<SplitView hypotheses={[]} />);

      expect(screen.getByText("Select a hypothesis")).toBeInTheDocument();
    });
  });

  describe("Selection Flow", () => {
    it("updates detail pane when different hypothesis is selected", async () => {
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First hypothesis" }),
        createMockHypothesis({ id: "2", statement: "Second hypothesis" }),
      ];

      render(<SplitView hypotheses={hypotheses} />);

      // Initially first hypothesis is selected
      await waitFor(() => {
        expect(screen.getByDisplayValue("First hypothesis")).toBeInTheDocument();
      });

      // Click second hypothesis
      await userEvent.click(screen.getByText("Second hypothesis"));

      // Detail pane should now show second hypothesis
      await waitFor(() => {
        expect(screen.getByDisplayValue("Second hypothesis")).toBeInTheDocument();
      });
    });

    it("shows inline editing when clicking +Add", async () => {
      const hypotheses = [createMockHypothesis({ id: "1", statement: "Existing hypothesis" })];

      render(<SplitView hypotheses={hypotheses} />);

      // Initially shows existing hypothesis
      await waitFor(() => {
        expect(screen.getByDisplayValue("Existing hypothesis")).toBeInTheDocument();
      });

      // Click the last Add button (root level)
      // Note: root nodes are expanded by default, so there may be 2 Add buttons
      const addButtons = screen.getAllByText("Add");
      await userEvent.click(addButtons[addButtons.length - 1]);

      // Should show inline input in the list for search/create
      expect(screen.getByPlaceholderText("Search or create...")).toBeInTheDocument();
    });
  });

  describe("Add New Hypothesis Flow", () => {
    it("shows inline title input when +Add is clicked at root level", async () => {
      // Use a simple hypothesis without children to have only one Add button
      const hypotheses = [createMockHypothesis({ id: "1", statement: "Root only" })];

      render(<SplitView hypotheses={hypotheses} />);

      // There's only the root +Add since this hypothesis has no children
      const addButtons = screen.getAllByText("Add");
      await userEvent.click(addButtons[addButtons.length - 1]); // Last one is always root

      // Should show inline input for search/create
      expect(screen.getByPlaceholderText("Search or create...")).toBeInTheDocument();
    });

    it("shows inline title input when +Add is clicked under parent", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<SplitView hypotheses={hypotheses} />);

      // Root nodes are expanded by default, so child +Add is already visible
      // Click the first child-level Add button (not the root one)
      const addButtons = screen.getAllByText("Add");
      await userEvent.click(addButtons[0]); // First Add is under expanded parent

      // Should show inline input for search/create
      expect(screen.getByPlaceholderText("Search or create...")).toBeInTheDocument();
    });
  });

  describe("Hierarchical Navigation", () => {
    it("shows children in list when parent is expanded (default for root nodes)", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<SplitView hypotheses={hypotheses} />);

      // Root nodes are expanded by default, so children should be visible
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();
      expect(screen.getByText("Child hypothesis 2")).toBeInTheDocument();
    });

    it("shows +Add row at end of expanded children", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<SplitView hypotheses={hypotheses} />);

      // Root nodes are expanded by default
      // Should have multiple Add buttons
      const addButtons = screen.getAllByText("Add");
      expect(addButtons.length).toBeGreaterThan(1);
    });
  });

  describe("List-Detail Synchronization", () => {
    it("shows selected hypothesis details in right pane", async () => {
      const hypotheses = [
        createMockHypothesis({
          id: "1",
          statement: "Test hypothesis",
          confidence: 75,
          tags: ["tag1"],
        }),
      ];

      render(<SplitView hypotheses={hypotheses} />);

      // Auto-selected, so should show in detail pane
      await waitFor(() => {
        expect(screen.getByDisplayValue("Test hypothesis")).toBeInTheDocument();
        expect(screen.getByDisplayValue("tag1")).toBeInTheDocument();
        // Confidence slider should be present with correct value
        const slider = screen.getByRole("slider");
        expect(slider).toHaveValue("75");
      });
    });
  });

  describe("Status Display Consistency", () => {
    it("shows consistent status between list and detail", async () => {
      const hypotheses = [
        createMockHypothesis({
          id: "1",
          statement: "Supported hypothesis",
          confidence: 85,
        }),
      ];

      render(<SplitView hypotheses={hypotheses} />);

      // Both list row and detail pane should show VALIDATED
      const validatedBadges = screen.getAllByText("VALIDATED");
      expect(validatedBadges.length).toBe(2); // One in list, one in detail
    });
  });

  describe("Empty States", () => {
    it("shows helpful message when list is empty", () => {
      render(<SplitView hypotheses={[]} />);

      expect(screen.getByText("No hypotheses yet.")).toBeInTheDocument();
      expect(screen.getByText("Click below to add your first one.")).toBeInTheDocument();
    });

    it("still shows +Add row when list is empty", () => {
      render(<SplitView hypotheses={[]} />);

      expect(screen.getByText("Add")).toBeInTheDocument();
    });
  });
});
