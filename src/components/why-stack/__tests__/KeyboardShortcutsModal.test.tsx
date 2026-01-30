import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardShortcutsModal } from "../KeyboardShortcutsModal";

describe("KeyboardShortcutsModal", () => {
  describe("Rendering", () => {
    it("does not render when isOpen is false", () => {
      render(<KeyboardShortcutsModal isOpen={false} onClose={jest.fn()} />);

      expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
    });

    it("renders when isOpen is true", () => {
      render(<KeyboardShortcutsModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    });

    it("displays all shortcut sections", () => {
      render(<KeyboardShortcutsModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("List Navigation")).toBeInTheDocument();
      expect(screen.getByText("Detail Pane")).toBeInTheDocument();
      expect(screen.getByText("General")).toBeInTheDocument();
    });

    it("displays list navigation shortcuts", () => {
      render(<KeyboardShortcutsModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Navigate items (incl. + Add)")).toBeInTheDocument();
      expect(screen.getByText("Expand to show children / + Add")).toBeInTheDocument();
      expect(screen.getByText("Collapse children")).toBeInTheDocument();
      expect(screen.getByText("Edit title / Quick add on + Add")).toBeInTheDocument();
      expect(screen.getByText("Move to detail pane (full form)")).toBeInTheDocument();
    });

    it("displays detail pane shortcuts", () => {
      render(<KeyboardShortcutsModal isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText("Next field")).toBeInTheDocument();
      expect(screen.getByText("Previous field")).toBeInTheDocument();
      expect(screen.getByText("Return to list")).toBeInTheDocument();
    });
  });

  describe("Closing", () => {
    it("calls onClose when Escape is pressed", () => {
      const onClose = jest.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      fireEvent.keyDown(window, { key: "Escape" });

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when ? is pressed", () => {
      const onClose = jest.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      fireEvent.keyDown(window, { key: "?" });

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when close button is clicked", () => {
      const onClose = jest.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      // Click the X button
      const closeButton = screen.getByRole("button");
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when clicking outside the modal", () => {
      const onClose = jest.fn();
      render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

      // Click on the backdrop (the fixed overlay)
      fireEvent.mouseDown(document.querySelector(".fixed")!);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
