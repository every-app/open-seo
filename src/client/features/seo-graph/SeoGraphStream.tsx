'use client';

/**
 * SeoGraphStream — live SSE feed from Railway LangGraph worker
 *
 * Subscribes to /api/seo-graph-stream?run_id={runId} (our proxy route).
 * Renders one ThinkingBlock per LLM node with:
 *   - Auto-scroll to bottom as tokens arrive
 *   - Blinking cursor while node is active
 *   - Collapse toggle on node_complete
 *
 * Events consumed:
 *   node_start    { node, timestamp }
 *   thinking      { node, chunk }
 *   node_complete { node, timestamp }
 *   done          { client_report }
 *   error         { message }
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type NodeBlock = {
  node: string;
  chunks: string[];
  complete: boolean;
  startedAt: string;
  completedAt?: string;
};

type Props = {
  runId: string;
  onDone?: (clientReport: string) => void;
  onError?: (message: string) => void;
};

const NODE_LABELS: Record<string, string> = {
  gather_node: "Gathering agent data",
  technical_node: "Technical analysis",
  supervisor_node: "Supervisor routing",
  crawlability_fix_node: "Crawlability fix plan",
  authority_gap_node: "Authority gap analysis",
  content_gap_node: "Content gap analysis",
  strategy_node: "Strategy synthesis",
  synthesis_node: "Writing client report",
  flywheel_persist_node: "Persisting to ZIE flywheel",
};

export function SeoGraphStream({ runId, onDone, onError }: Props) {
  const [blocks, setBlocks] = useState<NodeBlock[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    const es = new EventSource(`/api/seo-graph-stream/?run_id=${runId}`);
    esRef.current = es;

    es.addEventListener("node_start", (e) => {
      const data = JSON.parse(e.data) as { node: string; timestamp: string };
      setBlocks((prev) => [
        ...prev,
        { node: data.node, chunks: [], complete: false, startedAt: data.timestamp },
      ]);
    });

    es.addEventListener("thinking", (e) => {
      const data = JSON.parse(e.data) as { node: string; chunk: string };
      setBlocks((prev) =>
        prev.map((b) =>
          b.node === data.node && !b.complete
            ? { ...b, chunks: [...b.chunks, data.chunk] }
            : b,
        ),
      );
      // Auto-scroll
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    es.addEventListener("node_complete", (e) => {
      const data = JSON.parse(e.data) as { node: string; timestamp: string };
      setBlocks((prev) =>
        prev.map((b) =>
          b.node === data.node ? { ...b, complete: true, completedAt: data.timestamp } : b,
        ),
      );
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data) as { client_report: string };
      setIsDone(true);
      es.close();
      onDone?.(data.client_report);
    });

    es.addEventListener("error", (e) => {
      let msg = "Stream error";
      try {
        const data = JSON.parse((e as MessageEvent).data) as { message?: string };
        msg = data.message ?? msg;
      } catch { /* ignore */ }
      setStreamError(msg);
      es.close();
      onError?.(msg);
    });

    es.onerror = () => {
      if (!isDone) {
        setStreamError("Connection to Railway lost");
        es.close();
      }
    };

    return () => {
      es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  if (streamError) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
        Stream error: {streamError}
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <Loader2 className="size-4 animate-spin" />
        Waiting for LangGraph worker…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <NodeThinkingBlock key={`${block.node}-${i}`} block={block} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── NodeThinkingBlock ────────────────────────────────────────────────────────

function NodeThinkingBlock({ block }: { block: NodeBlock }) {
  const [collapsed, setCollapsed] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const text = block.chunks.join("");
  const label = NODE_LABELS[block.node] ?? block.node;

  // Auto-scroll pre to bottom as chunks arrive
  useEffect(() => {
    if (!block.complete && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [block.chunks, block.complete]);

  // Collapse automatically when node completes (if no thinking tokens)
  useEffect(() => {
    if (block.complete && text.trim().length === 0) {
      setCollapsed(true);
    }
  }, [block.complete, text]);

  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-base-content/70 hover:text-base-content transition-colors"
      >
        <span className="flex items-center gap-2">
          {!block.complete ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : (
            <span className="size-3.5 rounded-full bg-success/60 inline-block" />
          )}
          {label}
        </span>
        {collapsed ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronUp className="size-3.5 shrink-0" />
        )}
      </button>

      {/* Thinking content */}
      {!collapsed && text.trim().length > 0 && (
        <pre
          ref={preRef}
          className="max-h-48 overflow-y-auto border-t border-base-300 bg-base-200/60 px-3 py-2.5 text-xs font-mono text-base-content/80 whitespace-pre-wrap break-words"
        >
          {text}
          {!block.complete && (
            <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-0.5 align-middle" />
          )}
        </pre>
      )}
    </div>
  );
}
