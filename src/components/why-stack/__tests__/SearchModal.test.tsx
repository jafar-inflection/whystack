import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchModal } from "../SearchModal";
import { createMockHypothesis } from "./utils";

describe("SearchModal", () => {
  const mockOnClose = jest.fn();
  const mockOnSelect = jest.fn();

  const mockHypotheses = [
    createMockHypothesis({ id: "1", statement: "First hypothesis about testing" }),
    createMockHypothesis({ id: "2", statement: "Second hypothesis about design" }),
    createMockHypothesis({ id: "3", statement: "Third hypothesis about architecture", tags: ["tech", "system"] }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("does not render when closed", () => {
      render(
        <SearchModal
          isOpen={false}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.queryByPlaceholderText("Search hypotheses...")).not.toBeInTheDocument();
    });

    it("renders search input when open", () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByPlaceholderText("Search hypotheses...")).toBeInTheDocument();
    });

    it("shows all hypotheses when no query", () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText(/First hypothesis/)).toBeInTheDocument();
      expect(screen.getByText(/Second hypothesis/)).toBeInTheDocument();
      expect(screen.getByText(/Third hypothesis/)).toBeInTheDocument();
    });
  });

  describe("filtering", () => {
    it("filters hypotheses by statement", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      await userEvent.type(input, "design");

      expect(screen.queryByText(/First hypothesis/)).not.toBeInTheDocument();
      expect(screen.getByText(/Second hypothesis/)).toBeInTheDocument();
      expect(screen.queryByText(/Third hypothesis/)).not.toBeInTheDocument();
    });

    it("filters hypotheses by tags", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      await userEvent.type(input, "tech");

      expect(screen.queryByText(/First hypothesis/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Second hypothesis/)).not.toBeInTheDocument();
      expect(screen.getByText(/Third hypothesis/)).toBeInTheDocument();
    });

    it("shows no results message when no matches", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      await userEvent.type(input, "nonexistent");

      expect(screen.getByText("No hypotheses found")).toBeInTheDocument();
    });
  });

  describe("keyboard navigation", () => {
    it("closes on Escape", () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      fireEvent.keyDown(input, { key: "Escape" });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("selects hypothesis on Enter", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnSelect).toHaveBeenCalledWith("1"); // First hypothesis
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("navigates with arrow keys", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      const input = screen.getByPlaceholderText("Search hypotheses...");
      
      // Move down to second item
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnSelect).toHaveBeenCalledWith("2"); // Second hypothesis
    });
  });

  describe("click interactions", () => {
    it("selects hypothesis on click", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      await userEvent.click(screen.getByText(/Second hypothesis/));

      expect(mockOnSelect).toHaveBeenCalledWith("2");
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("closes on backdrop click", async () => {
      render(
        <SearchModal
          isOpen={true}
          onClose={mockOnClose}
          hypotheses={mockHypotheses}
          onSelect={mockOnSelect}
        />
      );

      // Click the backdrop (the outer div)
      const backdrop = screen.getByPlaceholderText("Search hypotheses...").closest(".fixed");
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });
  });
});
