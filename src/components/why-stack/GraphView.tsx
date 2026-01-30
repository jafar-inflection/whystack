"use client";

import { useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  NodeDragHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import type { HypothesisWithRelations } from "@/app/actions/hypotheses";
import { saveNodePosition } from "@/app/actions/hypotheses";

interface GraphViewProps {
  hypotheses: HypothesisWithRelations[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Custom node component for hypotheses
function HypothesisNode({ data, selected }: NodeProps) {
  const { label, confidence, status } = data;

  // Determine border color based on status
  const getBorderColor = () => {
    if (status === "VALIDATED") return "border-emerald-500";
    if (status === "REFUTED") return "border-rose-500";
    return "border-slate-300";
  };

  const getStatusBgColor = () => {
    if (status === "VALIDATED") return "bg-emerald-50";
    if (status === "REFUTED") return "bg-rose-50";
    return "bg-slate-50";
  };

  const getConfidenceColor = () => {
    if (confidence >= 80) return "text-emerald-600";
    if (confidence <= 20) return "text-rose-600";
    return "text-slate-500";
  };

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 ${getBorderColor()} ${getStatusBgColor()} ${
        selected ? "ring-2 ring-blue-400 ring-offset-1" : ""
      } min-w-[120px] max-w-[200px] cursor-pointer transition-shadow hover:shadow-md`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="text-xs font-medium text-slate-800 truncate">{label}</div>
      <div className={`text-[10px] ${getConfidenceColor()} mt-1`}>
        {confidence}% confidence
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = {
  hypothesis: HypothesisNode,
};

// Helper to determine status from confidence
function getStatus(confidence: number): string {
  if (confidence >= 80) return "VALIDATED";
  if (confidence <= 20) return "REFUTED";
  return "IN_TESTING";
}

// Helper to build nodes and edges, using saved positions if available
function layoutNodes(
  hypotheses: HypothesisWithRelations[],
  selectedId: string | null
): { nodes: Node[]; edges: Edge[] } {
  const hypothesesMap = new Map(hypotheses.map((h) => [h.id, h]));
  
  // Find root hypotheses (no parents)
  const roots = hypotheses.filter((h) => h.parents.length === 0);
  
  // Calculate levels for each hypothesis using BFS (for default layout)
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = [];
  
  // Start with roots at level 0
  roots.forEach((root) => {
    queue.push({ id: root.id, level: 0 });
  });
  
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    
    if (visited.has(id)) {
      levels.set(id, Math.max(levels.get(id) || 0, level));
      continue;
    }
    
    visited.add(id);
    levels.set(id, level);
    
    const hypothesis = hypothesesMap.get(id);
    if (hypothesis) {
      hypothesis.children.forEach((edge) => {
        if (!edge.child.isArchived) {
          queue.push({ id: edge.childId, level: level + 1 });
        }
      });
    }
  }
  
  // Group hypotheses by level (for default positioning)
  const levelGroups = new Map<number, string[]>();
  levels.forEach((level, id) => {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(id);
  });
  
  // Position nodes - use saved positions if available, otherwise calculate default
  const nodes: Node[] = [];
  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 60;
  const HORIZONTAL_GAP = 40;
  const VERTICAL_GAP = 80;
  
  // Calculate default positions first
  const defaultPositions = new Map<string, { x: number; y: number }>();
  levelGroups.forEach((ids, level) => {
    const totalWidth = ids.length * NODE_WIDTH + (ids.length - 1) * HORIZONTAL_GAP;
    const startX = -totalWidth / 2;
    
    ids.forEach((id, index) => {
      const x = startX + index * (NODE_WIDTH + HORIZONTAL_GAP);
      const y = level * (NODE_HEIGHT + VERTICAL_GAP);
      defaultPositions.set(id, { x, y });
    });
  });
  
  // Create nodes with saved positions (if available) or default positions
  hypotheses.forEach((hypothesis) => {
    if (!visited.has(hypothesis.id)) return; // Skip disconnected nodes
    
    const defaultPos = defaultPositions.get(hypothesis.id) || { x: 0, y: 0 };
    
    // Use saved position if available, otherwise use default
    const x = hypothesis.graphX ?? defaultPos.x;
    const y = hypothesis.graphY ?? defaultPos.y;
    
    nodes.push({
      id: hypothesis.id,
      type: "hypothesis",
      position: { x, y },
      data: {
        label: hypothesis.statement.length > 45 
          ? hypothesis.statement.slice(0, 45) + "..." 
          : hypothesis.statement,
        fullLabel: hypothesis.statement,
        confidence: hypothesis.confidence,
        status: getStatus(hypothesis.confidence),
      },
      selected: hypothesis.id === selectedId,
    });
  });
  
  // Create edges
  const edges: Edge[] = [];
  hypotheses.forEach((hypothesis) => {
    hypothesis.children.forEach((childEdge) => {
      if (!childEdge.child.isArchived && visited.has(childEdge.childId)) {
        edges.push({
          id: `${hypothesis.id}-${childEdge.childId}`,
          source: hypothesis.id,
          target: childEdge.childId,
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color: "#94a3b8",
          },
          style: {
            stroke: "#94a3b8",
            strokeWidth: 1.5,
          },
        });
      }
    });
  });
  
  return { nodes, edges };
}

export function GraphView({ hypotheses, selectedId, onSelect }: GraphViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutNodes(hypotheses, selectedId),
    [hypotheses, selectedId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // Track if a save is pending to debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelect(node.id);
    },
    [onSelect]
  );

  // Save position when node drag ends
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_, node) => {
      // Debounce saves to avoid too many DB calls
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveNodePosition(node.id, node.position.x, node.position.y);
      }, 300);
    },
    []
  );

  // Update nodes when selection changes
  useMemo(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === selectedId,
      }))
    );
  }, [selectedId, setNodes]);

  return (
    <div className="w-full h-full bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls className="!bg-white !border-slate-200 !shadow-sm" />
      </ReactFlow>
    </div>
  );
}
