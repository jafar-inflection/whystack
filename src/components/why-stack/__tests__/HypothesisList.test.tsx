import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HypothesisList } from "../HypothesisList";
import { createMockHypothesis, createMockHypothesesWithHierarchy } from "./utils";

// Mock the server action
jest.mock("@/app/actions/hypotheses", () => ({
  reorderHypotheses: jest.fn().mockResolvedValue({ ok: true }),
  updateHypothesis: jest.fn().mockResolvedValue({ ok: true }),
}));

describe("HypothesisList", () => {
  const defaultProps = {
    selectedId: null,
    onSelect: jest.fn(),
    isAddingNew: false,
    addingParentId: null,
    onAddNew: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders empty state when no hypotheses", () => {
      render(<HypothesisList hypotheses={[]} {...defaultProps} />);

      expect(screen.getByText("No hypotheses yet.")).toBeInTheDocument();
    });

    it("renders all root hypotheses", () => {
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First hypothesis" }),
        createMockHypothesis({ id: "2", statement: "Second hypothesis" }),
      ];

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      expect(screen.getByText("First hypothesis")).toBeInTheDocument();
      expect(screen.getByText("Second hypothesis")).toBeInTheDocument();
    });

    it("only renders root hypotheses initially (not children)", () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      // Parent should be visible
      expect(screen.getByText("Parent hypothesis 1")).toBeInTheDocument();
      expect(screen.getByText("Parent hypothesis 2")).toBeInTheDocument();

      // Children ARE visible because root nodes are expanded by default
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();
      expect(screen.getByText("Child hypothesis 2")).toBeInTheDocument();
    });
  });

  describe("Add Row", () => {
    it("renders +Add rows (including under expanded root nodes)", () => {
      const hypotheses = [createMockHypothesis({ id: "1" })];

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      // With root node expanded by default, there are 2 Add buttons
      const addButtons = screen.getAllByText("Add");
      expect(addButtons.length).toBe(2); // One under expanded "1", one at root
    });

    it("starts inline editing when root +Add is clicked", async () => {
      const onStartEditingAdd = jest.fn();
      const hypotheses = [createMockHypothesis({ id: "1" })];

      render(
        <HypothesisList 
          hypotheses={hypotheses} 
          {...defaultProps} 
          onStartEditingAdd={onStartEditingAdd}
        />
      );

      // With root node expanded, there are 2 Add buttons: one under expanded "1", one at root
      // Click the last one (root level)
      const addButtons = screen.getAllByText("Add");
      await userEvent.click(addButtons[addButtons.length - 1]);

      expect(onStartEditingAdd).toHaveBeenCalledWith(null);
    });

    it("renders +Add row at end of expanded children (root nodes expanded by default)", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      // Root nodes are expanded by default
      // Should have multiple Add buttons (under parent-1, under parent-2, and root level)
      const addButtons = screen.getAllByText("Add");
      expect(addButtons.length).toBeGreaterThan(1);
    });

    it("starts inline editing when child +Add is clicked", async () => {
      const onStartEditingAdd = jest.fn();
      const hypotheses = createMockHypothesesWithHierarchy();

      render(
        <HypothesisList 
          hypotheses={hypotheses} 
          {...defaultProps} 
          onStartEditingAdd={onStartEditingAdd}
        />
      );

      // Root nodes are expanded by default, so children are visible
      // Click the child-level Add button (first Add visible is under parent-1's children)
      const addButtons = screen.getAllByText("Add");
      await userEvent.click(addButtons[0]); // First +Add is under parent-1

      expect(onStartEditingAdd).toHaveBeenCalledWith("parent-1");
    });

    it("highlights +Add row when isAddingNew and addingParentId matches", () => {
      const hypotheses = [createMockHypothesis({ id: "1" })];

      const { container } = render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          isAddingNew={true}
          addingParentId={null}
        />
      );

      // The Add row should have selected styles
      const addRow = container.querySelector(".bg-blue-50");
      expect(addRow).toBeInTheDocument();
    });
  });

  describe("Hierarchical Expansion", () => {
    it("shows children by default for root hypotheses", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      // Root nodes are expanded by default, so children should be visible
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();
      expect(screen.getByText("Child hypothesis 2")).toBeInTheDocument();
    });

    it("hides children when parent is collapsed", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      // Root nodes are expanded by default, so children should be visible
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();

      // Collapse by clicking expand button
      const expandButton = screen.getAllByRole("button")[0];
      await userEvent.click(expandButton);

      expect(screen.queryByText("Child hypothesis 1")).not.toBeInTheDocument();
    });
  });

  describe("Keyboard Navigation", () => {
    it("navigates down with ArrowDown (skipping expanded add rows)", () => {
      const onSelect = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
        createMockHypothesis({ id: "2", statement: "Second" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
          onSelect={onSelect}
          onHighlightAdd={onHighlightAdd}
        />
      );

      // With root nodes expanded by default: 1 -> +add-1 -> 2 -> +add-2 -> +add-root
      // ArrowDown from "1" goes to +add-1 (highlight)
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onHighlightAdd).toHaveBeenCalledWith("1");
    });

    it("navigates up with ArrowUp (skipping expanded add rows)", () => {
      const onSelect = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
        createMockHypothesis({ id: "2", statement: "Second" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="2"
          onSelect={onSelect}
          onHighlightAdd={onHighlightAdd}
        />
      );

      // With root nodes expanded by default: 1 -> +add-1 -> 2 -> +add-2 -> +add-root
      // ArrowUp from "2" goes to +add-1 (highlight)
      fireEvent.keyDown(window, { key: "ArrowUp" });
      expect(onHighlightAdd).toHaveBeenCalledWith("1");
    });

    it("does not navigate past first item", () => {
      const onSelect = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
        createMockHypothesis({ id: "2", statement: "Second" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
          onSelect={onSelect}
        />
      );

      fireEvent.keyDown(window, { key: "ArrowUp" });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("navigates to child add row after last hypothesis (highlights, not activates)", () => {
      const onSelect = jest.fn();
      const onAddNew = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
        createMockHypothesis({ id: "2", statement: "Second" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="2"
          onSelect={onSelect}
          onAddNew={onAddNew}
          onHighlightAdd={onHighlightAdd}
        />
      );

      fireEvent.keyDown(window, { key: "ArrowDown" });

      // With root nodes expanded by default, ArrowDown goes to +add-2 (hypothesis 2's child add row)
      expect(onHighlightAdd).toHaveBeenCalledWith("2");
      expect(onAddNew).not.toHaveBeenCalled();
    });

    it("navigates from highlighted add row to previous item", () => {
      const onSelect = jest.fn();
      const onAddNew = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
        createMockHypothesis({ id: "2", statement: "Second" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          highlightedAddParentId={null} // Root add row is highlighted
          onSelect={onSelect}
          onAddNew={onAddNew}
          onHighlightAdd={onHighlightAdd}
        />
      );

      fireEvent.keyDown(window, { key: "ArrowUp" });

      // With root nodes expanded by default, ArrowUp from root add goes to add-2 (hypothesis 2's child add row)
      expect(onHighlightAdd).toHaveBeenCalledWith("2");
    });

    it("navigates from nested add row to next hypothesis", () => {
      const onSelect = jest.fn();
      const onAddNew = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = createMockHypothesesWithHierarchy();

      // Create a wrapper that tracks state like SplitView does
      const StatefulWrapper = () => {
        const [selectedId, setSelectedId] = useState<string | null>("parent-1");
        const [isAddingNew, setIsAddingNew] = useState(false);
        const [addingParentId, setAddingParentId] = useState<string | null>(null);
        const [highlightedAddParentId, setHighlightedAddParentId] = useState<string | null | undefined>(undefined);

        return (
          <HypothesisList
            hypotheses={hypotheses}
            selectedId={selectedId}
            onSelect={(id) => {
              // Like SplitView's handleSelect
              setSelectedId(id);
              setIsAddingNew(false);
              setAddingParentId(null);
              setHighlightedAddParentId(undefined);
              if (id !== null) onSelect(id);
            }}
            isAddingNew={isAddingNew}
            addingParentId={addingParentId}
            onAddNew={(parentId) => {
              // Like SplitView's handleAddNew
              setIsAddingNew(true);
              setAddingParentId(parentId);
              setSelectedId(null);
              setHighlightedAddParentId(undefined);
              onAddNew(parentId);
            }}
            highlightedAddParentId={highlightedAddParentId}
            onHighlightAdd={(parentId) => {
              // Like SplitView's handleHighlightAdd
              if (parentId === undefined) {
                setHighlightedAddParentId(undefined);
              } else {
                setHighlightedAddParentId(parentId);
                setSelectedId(null);
                setIsAddingNew(false);
              }
              onHighlightAdd(parentId);
            }}
            isFocused={true}
          />
        );
      };

      render(<StatefulWrapper />);

      // Root nodes are expanded by default, so children are already visible
      // Navigate down: parent-1 -> child-1 -> child-2 -> add-parent-1 (highlight) -> parent-2 -> add-parent-2 -> add-root (highlight)
      fireEvent.keyDown(window, { key: "ArrowDown" }); // to child-1
      expect(onSelect).toHaveBeenLastCalledWith("child-1");

      fireEvent.keyDown(window, { key: "ArrowDown" }); // to child-2
      expect(onSelect).toHaveBeenLastCalledWith("child-2");

      fireEvent.keyDown(window, { key: "ArrowDown" }); // to add-parent-1 (highlight only)
      expect(onHighlightAdd).toHaveBeenLastCalledWith("parent-1");

      fireEvent.keyDown(window, { key: "ArrowDown" }); // to parent-2
      expect(onSelect).toHaveBeenLastCalledWith("parent-2");

      fireEvent.keyDown(window, { key: "ArrowDown" }); // to add-parent-2 (highlight only, since parent-2 is also expanded)
      expect(onHighlightAdd).toHaveBeenLastCalledWith("parent-2");

      fireEvent.keyDown(window, { key: "ArrowDown" }); // to add-root (highlight only)
      expect(onHighlightAdd).toHaveBeenLastCalledWith(null);
    });

    it("starts inline editing on highlighted add row when Enter is pressed", () => {
      const onSelect = jest.fn();
      const onStartEditingAdd = jest.fn();
      const onHighlightAdd = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "First" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId={null}
          highlightedAddParentId={null} // Root add row is highlighted
          onSelect={onSelect}
          onStartEditingAdd={onStartEditingAdd}
          onHighlightAdd={onHighlightAdd}
        />
      );

      // Press Enter to start inline editing
      fireEvent.keyDown(window, { key: "Enter" });

      expect(onStartEditingAdd).toHaveBeenCalledWith(null);
    });

    it("expands children with ArrowRight", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="parent-1"
        />
      );

      // Root nodes are expanded by default, so children should be visible
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();

      // Collapse first
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.queryByText("Child hypothesis 1")).not.toBeInTheDocument();

      // Expand again with ArrowRight
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();
    });

    it("expands node without children to show add row", async () => {
      const hypotheses = [
        createMockHypothesis({ id: "1", statement: "Leaf node" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
        />
      );

      // Expand the leaf node
      fireEvent.keyDown(window, { key: "ArrowRight" });

      // Should show add row under the expanded node (check there are 2 "Add" texts - root and child)
      const addButtons = screen.getAllByText("Add");
      expect(addButtons.length).toBe(2); // Root add + child add
    });

    it("collapses children with ArrowLeft", async () => {
      const hypotheses = createMockHypothesesWithHierarchy();

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="parent-1"
        />
      );

      // Root nodes are expanded by default
      expect(screen.getByText("Child hypothesis 1")).toBeInTheDocument();

      // Collapse with ArrowLeft
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.queryByText("Child hypothesis 1")).not.toBeInTheDocument();
    });

    it("does not respond to keyboard in input fields", () => {
      const onSelect = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1" }),
        createMockHypothesis({ id: "2" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
          onSelect={onSelect}
        />
      );

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      // Dispatch event with input as target
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
      Object.defineProperty(event, "target", { value: input });
      window.dispatchEvent(event);

      expect(onSelect).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });

  describe("Selection", () => {
    it("calls onSelect when hypothesis is clicked", async () => {
      const onSelect = jest.fn();
      const hypotheses = [createMockHypothesis({ id: "test-1" })];

      render(
        <HypothesisList hypotheses={hypotheses} {...defaultProps} onSelect={onSelect} />
      );

      await userEvent.click(screen.getByText("Hypothesis test-1"));

      expect(onSelect).toHaveBeenCalledWith("test-1");
    });
  });

  describe("Keyboard Shortcuts Info", () => {
    it("displays keyboard shortcut hints", () => {
      const hypotheses = [createMockHypothesis({ id: "1" })];

      render(<HypothesisList hypotheses={hypotheses} {...defaultProps} />);

      expect(screen.getByText(/nav/)).toBeInTheDocument();
      expect(screen.getByText(/expand/)).toBeInTheDocument();
      expect(screen.getByText(/edit/)).toBeInTheDocument();
      expect(screen.getByText(/detail/)).toBeInTheDocument();
      expect(screen.getByText(/help/)).toBeInTheDocument();
    });
  });

  describe("Tab Navigation", () => {
    it("calls onTabToDetail when Tab is pressed", () => {
      const onTabToDetail = jest.fn();
      const hypotheses = [createMockHypothesis({ id: "1" })];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
          onTabToDetail={onTabToDetail}
          isFocused={true}
        />
      );

      fireEvent.keyDown(window, { key: "Tab" });

      expect(onTabToDetail).toHaveBeenCalled();
    });

    it("does not respond to keyboard when isFocused is false", () => {
      const onSelect = jest.fn();
      const hypotheses = [
        createMockHypothesis({ id: "1" }),
        createMockHypothesis({ id: "2" }),
      ];

      render(
        <HypothesisList
          hypotheses={hypotheses}
          {...defaultProps}
          selectedId="1"
          onSelect={onSelect}
          isFocused={false}
        />
      );

      fireEvent.keyDown(window, { key: "ArrowDown" });

      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
