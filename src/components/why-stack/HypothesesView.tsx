"use client";

import { useState, useCallback } from "react";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { SplitView } from "./SplitView";
import { GraphView } from "./GraphView";
import { DetailPane } from "./DetailPane";

type ViewMode = "list" | "graph";

interface HypothesesViewProps {
  hypotheses: HypothesisWithRelations[];
}

export function HypothesesView({ hypotheses }: HypothesesViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [graphSelectedId, setGraphSelectedId] = useState<string | null>(null);

  const graphSelectedHypothesis = hypotheses.find((h) => h.id === graphSelectedId) || null;

  const handleSelectFromGraph = useCallback((id: string) => {
    setGraphSelectedId(id);
  }, []);

  // List view - use the original SplitView as-is
  if (viewMode === "list") {
    return (
      <div>
        {/* View Toggle */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                List
              </span>
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "graph"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Graph
              </span>
            </button>
          </div>
        </div>

        <SplitView hypotheses={hypotheses} />
      </div>
    );
  }

  // Graph view with detail pane
  return (
    <div>
      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              List
            </span>
          </button>
          <button
            onClick={() => setViewMode("graph")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === "graph"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Graph
            </span>
          </button>
        </div>
      </div>

      {/* Graph + Detail Split - same layout as list view */}
      <div className="flex h-[calc(100vh-180px)] border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* Left Pane - Graph (60%) */}
        <div className="w-3/5 border-r border-gray-200 flex flex-col">
          <GraphView
            hypotheses={hypotheses}
            selectedId={graphSelectedId}
            onSelect={handleSelectFromGraph}
          />
        </div>

        {/* Right Pane - Detail (40%) */}
        <div className="w-2/5 bg-gray-50">
          {graphSelectedHypothesis ? (
            <DetailPane
              hypothesis={graphSelectedHypothesis}
              isNew={false}
              onDeleted={() => setGraphSelectedId(null)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Click a node to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
