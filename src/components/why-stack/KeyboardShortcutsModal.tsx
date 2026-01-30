"use client";

import { useEffect, useRef } from "react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  {
    section: "List Navigation",
    items: [
      { keys: ["↑", "↓"], description: "Navigate items (incl. + Add)" },
      { keys: ["→"], description: "Expand to show children / + Add" },
      { keys: ["←"], description: "Collapse children" },
      { keys: ["Enter"], description: "Edit title / Quick add on + Add" },
      { keys: ["Tab"], description: "Move to detail pane (full form)" },
    ],
  },
  {
    section: "Detail Pane",
    items: [
      { keys: ["Tab"], description: "Next field" },
      { keys: ["Shift", "Tab"], description: "Previous field" },
      { keys: ["Esc"], description: "Return to list" },
    ],
  },
  {
    section: "General",
    items: [
      { keys: ["⌘", "K"], description: "Quick search" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {shortcuts.map((section) => (
            <div key={section.section}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {section.section}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-300 rounded">
                            {key}
                          </kbd>
                          {keyIndex < item.keys.length - 1 && (
                            <span className="mx-1 text-gray-400">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 text-center rounded-b-lg">
          Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">?</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
