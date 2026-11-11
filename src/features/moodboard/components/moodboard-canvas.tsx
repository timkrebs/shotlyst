"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowRight,
  BringToFront,
  Copy,
  Download,
  Group,
  ImagePlus,
  Images,
  Link as LinkIcon,
  Palette,
  Redo2,
  SendToBack,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { registerFile } from "@/features/files/actions";
import { prepareFile, uploadThumbnail, uploadToStorage } from "@/features/files/upload";
import { MAX_UPLOAD_BYTES, MEDIA_BUCKET } from "@/lib/files";
import { alignRects, diffRows, fitNodeSize, type Alignment } from "@/lib/moodboard/layout";
import { dominantColors } from "@/lib/moodboard/palette";
import { useSignedUrl } from "@/lib/storage-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";

import { saveBoardChanges } from "../actions";
import type { LibraryImage } from "../queries";
import type { BoardNodeType, EdgeRow, NodeRow } from "../schema";
import { BoardEditContext, boardNodeTypes, type BoardNode } from "./board-nodes";

const SAVE_INTERVAL_MS = 500;
const HISTORY_LIMIT = 50;
const IMAGE_EDGE = 320;
const EXPORT_MAX_EDGE = 4096;

type BoardEdge = Edge<{ label: string; arrow: boolean }>;
interface Snapshot {
  nodes: BoardNode[];
  edges: BoardEdge[];
}
type SaveState = "saved" | "saving" | "error";

const round = (value: number) => Math.round(value * 100) / 100;

function toFlowNode(row: NodeRow): BoardNode {
  return {
    id: row.id,
    type: row.type,
    position: { x: row.x, y: row.y },
    width: row.width,
    height: row.height,
    zIndex: row.z,
    data: row.data,
  };
}

function toNodeRow(node: BoardNode): NodeRow {
  return {
    id: node.id,
    type: node.type as BoardNodeType,
    x: round(node.position.x),
    y: round(node.position.y),
    width: round(node.width ?? node.measured?.width ?? 100),
    height: round(node.height ?? node.measured?.height ?? 100),
    z: node.zIndex ?? 0,
    data: node.data,
    fileId: typeof node.data.fileId === "string" ? node.data.fileId : null,
  };
}

function toFlowEdge(row: EdgeRow): BoardEdge {
  const label = typeof row.style.label === "string" ? row.style.label : "";
  const arrow = row.style.arrow === true;
  return {
    id: row.id,
    source: row.sourceNodeId,
    target: row.targetNodeId,
    sourceHandle: typeof row.style.sourceHandle === "string" ? row.style.sourceHandle : null,
    targetHandle: typeof row.style.targetHandle === "string" ? row.style.targetHandle : null,
    label: label || undefined,
    markerEnd: arrow ? { type: MarkerType.ArrowClosed } : undefined,
    data: { label, arrow },
  };
}

function toEdgeRow(edge: BoardEdge): EdgeRow {
  return {
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    style: {
      label: edge.data?.label ?? "",
      arrow: edge.data?.arrow ?? false,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    },
  };
}

const serialise = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, JSON.stringify(row)]));

function ToolButton({
  icon: Icon,
  label,
  disabled,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex size-8 items-center justify-center rounded-md disabled:opacity-40",
        active && "bg-accent",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function LibraryThumb({ image, onPick }: { image: LibraryImage; onPick: () => void }) {
  const url = useSignedUrl(image.path);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={en.moodboard.place(image.name)}
      className="bg-muted hover:ring-ring aspect-square overflow-hidden rounded-md hover:ring-2"
    >
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : null}
    </button>
  );
}

function Canvas({
  projectId,
  boardId,
  initialNodes,
  initialEdges,
  libraryImages,
  canEdit,
}: {
  projectId: string;
  boardId: string;
  initialNodes: NodeRow[];
  initialEdges: EdgeRow[];
  libraryImages: LibraryImage[];
  canEdit: boolean;
}) {
  const flow = useReactFlow<BoardNode, BoardEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>(initialNodes.map(toFlowNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<BoardEdge>(initialEdges.map(toFlowEdge));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // What the database holds, as serialised rows, to find changes against.
  const saved = useRef({
    nodes: serialise(initialNodes.map(toFlowNode).map(toNodeRow)),
    edges: serialise(initialEdges.map(toFlowEdge).map(toEdgeRow)),
  });
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const saving = useRef(false);
  const dragging = useRef(false);
  const logged = useRef(false);
  const spawned = useRef(0);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdge = edges.find((edge) => edge.selected);

  // --- Saving: changes go out in batches, at most every 500 ms. ---

  const flush = useCallback(async () => {
    if (!canEdit || saving.current || dragging.current) return;
    const nodeRows = flow.getNodes().map(toNodeRow);
    const edgeRows = flow.getEdges().map(toEdgeRow);
    const nodeDiff = diffRows(saved.current.nodes, nodeRows);
    const edgeDiff = diffRows(saved.current.edges, edgeRows);
    if (
      nodeDiff.changed.length + nodeDiff.removedIds.length === 0 &&
      edgeDiff.changed.length + edgeDiff.removedIds.length === 0
    ) {
      return;
    }

    saving.current = true;
    setSaveState("saving");
    const result = await saveBoardChanges({
      projectId,
      boardId,
      nodes: nodeDiff.changed,
      edges: edgeDiff.changed,
      removedNodeIds: nodeDiff.removedIds,
      removedEdgeIds: edgeDiff.removedIds,
      logEdit: !logged.current,
    });
    saving.current = false;
    if (result.ok) {
      logged.current = true;
      saved.current = { nodes: serialise(nodeRows), edges: serialise(edgeRows) };
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  }, [boardId, canEdit, flow, projectId]);

  useEffect(() => {
    if (!canEdit) return;
    const interval = setInterval(() => void flush(), SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      void flush();
    };
  }, [canEdit, flush]);

  // --- Undo and redo: snapshots of the member's own changes. ---

  const commit = useCallback(() => {
    undoStack.current = [
      ...undoStack.current.slice(-(HISTORY_LIMIT - 1)),
      { nodes: flow.getNodes(), edges: flow.getEdges() },
    ];
    redoStack.current = [];
    setHistory({ undo: undoStack.current.length, redo: 0 });
  }, [flow]);

  const restore = useCallback(
    (from: Snapshot[], to: Snapshot[]) => {
      const snapshot = from.pop();
      if (!snapshot) return;
      to.push({ nodes: flow.getNodes(), edges: flow.getEdges() });
      setNodes(snapshot.nodes.map((node) => ({ ...node, selected: false })));
      setEdges(snapshot.edges.map((edge) => ({ ...edge, selected: false })));
      setHistory({ undo: undoStack.current.length, redo: redoStack.current.length });
    },
    [flow, setEdges, setNodes],
  );
  const undo = useCallback(() => restore(undoStack.current, redoStack.current), [restore]);
  const redo = useCallback(() => restore(redoStack.current, undoStack.current), [restore]);

  // --- Adding elements. ---

  const centre = useCallback(() => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // Step each new element a little further, so they do not hide each other.
    const step = (spawned.current % 8) * 28;
    spawned.current += 1;
    return flow.screenToFlowPosition({
      x: rect.left + rect.width / 2 + step,
      y: rect.top + rect.height / 2 + step,
    });
  }, [flow]);

  const insert = useCallback(
    (additions: Omit<BoardNode, "id">[]) => {
      commit();
      setNodes((current) => {
        const top = current.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0);
        const bottom = current.reduce((min, node) => Math.min(min, node.zIndex ?? 0), 0);
        return [
          ...current.map((node) => ({ ...node, selected: false })),
          ...additions.map((node, index) => ({
            ...node,
            id: crypto.randomUUID(),
            // Groups go behind everything, the rest on top.
            zIndex: node.type === "group" ? bottom - 1 - index : top + 1 + index,
            selected: true,
          })),
        ];
      });
    },
    [commit, setNodes],
  );

  function addElement(type: Exclude<BoardNodeType, "image">) {
    const sizes = {
      note: { width: 200, height: 160 },
      text: { width: 260, height: 60 },
      color: { width: 120, height: 120 },
      link: { width: 240, height: 80 },
      group: { width: 480, height: 320 },
    };
    const data = {
      note: { text: "" },
      text: { text: "" },
      color: { color: "#4f46e5" },
      link: { title: "", url: "" },
      group: { label: "" },
    };
    const { width, height } = sizes[type];
    const { x, y } = centre();
    insert([
      { type, position: { x: x - width / 2, y: y - height / 2 }, width, height, data: data[type] },
    ]);
  }

  const addImages = useCallback(
    (
      images: { fileId: string; path: string; thumbPath: string | null; name: string; width: number | null; height: number | null }[],
      at?: { x: number; y: number },
    ) => {
      const origin = at ?? centre();
      insert(
        images.map((image, index) => {
          const size = fitNodeSize(image.width, image.height, IMAGE_EDGE);
          return {
            type: "image",
            position: {
              x: origin.x - size.width / 2 + index * 24,
              y: origin.y - size.height / 2 + index * 24,
            },
            ...size,
            data: {
              fileId: image.fileId,
              path: image.path,
              thumbPath: image.thumbPath,
              name: image.name,
            },
          };
        }),
      );
    },
    [centre, insert],
  );

  // Uploads go straight to storage; the canvas then shows the small preview.
  const uploadImages = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      setBusy(true);
      const uploaded = [];
      for (const file of images) {
        try {
          if (file.size > MAX_UPLOAD_BYTES) throw new Error(en.files.errors.tooLarge);
          const prepared = await prepareFile(file);
          const path = await uploadToStorage(prepared, projectId, "moodboard");
          const thumbPath = await uploadThumbnail(prepared, path);
          const result = await registerFile({
            projectId,
            path,
            name: prepared.name || "image",
            mime: prepared.mime,
            size: prepared.blob.size,
            width: prepared.width,
            height: prepared.height,
            folder: en.moodboard.folder,
          });
          if (!result.ok) throw new Error(result.error);
          uploaded.push({
            fileId: result.data.id,
            path,
            thumbPath,
            name: prepared.name,
            width: prepared.width,
            height: prepared.height,
          });
        } catch (error) {
          toast.error(en.files.errors.uploadFailed(file.name), {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }
      if (uploaded.length > 0) addImages(uploaded, at);
      setBusy(false);
    },
    [addImages, projectId],
  );

  // --- Selection tools. ---

  function patchSelected(patch: (node: BoardNode) => Partial<BoardNode>) {
    commit();
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, ...patch(node) } : node)),
    );
  }

  function align(alignment: Alignment) {
    const positions = alignRects(
      selectedNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? 0,
        height: node.height ?? 0,
      })),
      alignment,
    );
    patchSelected((node) => ({ position: positions.get(node.id) ?? node.position }));
  }

  function reorder(direction: "front" | "back") {
    const all = nodes.map((node) => node.zIndex ?? 0);
    const edge = direction === "front" ? Math.max(0, ...all) : Math.min(0, ...all);
    let step = 0;
    patchSelected(() => {
      step += 1;
      return { zIndex: direction === "front" ? edge + step : edge - step };
    });
  }

  const duplicate = useCallback(() => {
    const originals = flow.getNodes().filter((node) => node.selected);
    if (originals.length === 0) return;
    insert(
      originals.map((node) => ({
        type: node.type,
        position: { x: node.position.x + 24, y: node.position.y + 24 },
        width: node.width,
        height: node.height,
        data: { ...node.data },
      })),
    );
  }, [flow, insert]);

  function removeSelected() {
    commit();
    const removed = new Set(selectedNodes.map((node) => node.id));
    setNodes((current) => current.filter((node) => !node.selected));
    setEdges((current) =>
      current.filter(
        (edge) => !edge.selected && !removed.has(edge.source) && !removed.has(edge.target),
      ),
    );
  }

  function patchEdge(id: string, data: { label: string; arrow: boolean }) {
    setEdges((current) =>
      current.map((edge) =>
        edge.id === id
          ? {
              ...edge,
              data,
              label: data.label || undefined,
              markerEnd: data.arrow ? { type: MarkerType.ArrowClosed } : undefined,
            }
          : edge,
      ),
    );
  }

  // Five dominant colours of the selected image, as swatches beside it.
  async function pullPalette() {
    const image = selectedNodes[0];
    const path = image?.data.thumbPath ?? image?.data.path;
    if (!image || typeof path !== "string") return;
    setBusy(true);
    try {
      const { data: blob, error } = await createClient().storage.from(MEDIA_BUCKET).download(path);
      if (error) throw error;
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.drawImage(bitmap, 0, 0, 64, 64);
      bitmap.close();
      const colors = dominantColors(context.getImageData(0, 0, 64, 64).data, 5);
      const size = 72;
      insert(
        colors.map((color, index) => ({
          type: "color",
          position: {
            x: image.position.x + index * (size + 8),
            y: image.position.y + (image.height ?? 0) + 16,
          },
          width: size,
          height: size + 24,
          data: { color },
        })),
      );
    } catch {
      toast.error(en.moodboard.errors.paletteFailed);
    } finally {
      setBusy(false);
    }
  }

  // The selection, or the whole board when nothing is selected, as a PNG.
  async function exportPng() {
    const targets = selectedNodes.length > 0 ? selectedNodes : nodes;
    const viewportElement = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (targets.length === 0 || !viewportElement) return;
    setBusy(true);
    try {
      const bounds = getNodesBounds(targets);
      const scale = Math.min(2, EXPORT_MAX_EDGE / Math.max(bounds.width, bounds.height));
      const width = Math.ceil(bounds.width * scale) + 64;
      const height = Math.ceil(bounds.height * scale) + 64;
      const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0);
      const onlySelected = selectedNodes.length > 0;
      const dataUrl = await toPng(viewportElement, {
        backgroundColor: "#ffffff",
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        filter: (element) =>
          !(
            onlySelected &&
            element instanceof HTMLElement &&
            element.classList.contains("react-flow__node") &&
            !element.classList.contains("selected")
          ),
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "moodboard.png";
      link.click();
    } catch {
      toast.error(en.moodboard.errors.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  // --- Keyboard and clipboard. ---

  useEffect(() => {
    if (!canEdit) return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    function onKeyDown(event: KeyboardEvent) {
      if (typing(event.target) || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "d") {
        event.preventDefault();
        duplicate();
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (typing(event.target)) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length > 0) {
        event.preventDefault();
        void uploadImages(files);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [canEdit, duplicate, redo, undo, uploadImages]);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!canEdit || event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    void uploadImages(
      [...event.dataTransfer.files],
      flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      commit();
      setEdges((current) =>
        addEdge(
          { ...connection, id: crypto.randomUUID(), data: { label: "", arrow: false } },
          current,
        ),
      );
    },
    [commit, setEdges],
  );

  const editContext = useMemo(() => ({ canEdit, commit }), [canEdit, commit]);
  const labels = en.moodboard.tools;
  const hasSelection = selectedNodes.length > 0 || selectedEdge !== undefined;
  const singleImage = selectedNodes.length === 1 && selectedNodes[0].type === "image";

  return (
    <BoardEditContext.Provider value={editContext}>
      <div
        ref={wrapper}
        data-testid="moodboard"
        className="h-[calc(100dvh-15rem)] min-h-[28rem] overflow-hidden rounded-lg border"
        onDragOver={(event) => {
          if (canEdit) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={boardNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={(connection) => connection.source !== connection.target}
          connectionMode={ConnectionMode.Loose}
          onNodeDragStart={() => {
            commit();
            dragging.current = true;
          }}
          onNodeDragStop={() => {
            dragging.current = false;
          }}
          onSelectionDragStart={() => {
            commit();
            dragging.current = true;
          }}
          onSelectionDragStop={() => {
            dragging.current = false;
          }}
          onBeforeDelete={async () => {
            commit();
            return true;
          }}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          minZoom={0.05}
          maxZoom={4}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          {canEdit ? (
            <Panel position="top-left">
              <div
                role="toolbar"
                aria-label={labels.toolbar}
                className="bg-background flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-0.5 rounded-lg border p-1 shadow-sm"
              >
                <ToolButton icon={ImagePlus} label={labels.upload} disabled={busy} onClick={() => fileInput.current?.click()} />
                <ToolButton icon={Images} label={labels.fromLibrary} onClick={() => setLibraryOpen(true)} />
                <ToolButton icon={StickyNote} label={labels.note} onClick={() => addElement("note")} />
                <ToolButton icon={Type} label={labels.text} onClick={() => addElement("text")} />
                <ToolButton icon={Square} label={labels.color} onClick={() => addElement("color")} />
                <ToolButton icon={LinkIcon} label={labels.link} onClick={() => addElement("link")} />
                <ToolButton icon={Group} label={labels.group} onClick={() => addElement("group")} />
                <span className="bg-border mx-1 h-5 w-px" />
                <ToolButton icon={Undo2} label={labels.undo} disabled={history.undo === 0} onClick={undo} />
                <ToolButton icon={Redo2} label={labels.redo} disabled={history.redo === 0} onClick={redo} />
                <ToolButton icon={Copy} label={labels.duplicate} disabled={selectedNodes.length === 0} onClick={duplicate} />
                <ToolButton icon={Trash2} label={labels.delete} disabled={!hasSelection} onClick={removeSelected} />
                <ToolButton icon={BringToFront} label={labels.front} disabled={selectedNodes.length === 0} onClick={() => reorder("front")} />
                <ToolButton icon={SendToBack} label={labels.back} disabled={selectedNodes.length === 0} onClick={() => reorder("back")} />
                {selectedNodes.length > 1 ? (
                  <>
                    <span className="bg-border mx-1 h-5 w-px" />
                    <ToolButton icon={AlignStartVertical} label={labels.alignLeft} onClick={() => align("left")} />
                    <ToolButton icon={AlignCenterVertical} label={labels.alignCenter} onClick={() => align("center")} />
                    <ToolButton icon={AlignEndVertical} label={labels.alignRight} onClick={() => align("right")} />
                    <ToolButton icon={AlignStartHorizontal} label={labels.alignTop} onClick={() => align("top")} />
                    <ToolButton icon={AlignCenterHorizontal} label={labels.alignMiddle} onClick={() => align("middle")} />
                    <ToolButton icon={AlignEndHorizontal} label={labels.alignBottom} onClick={() => align("bottom")} />
                  </>
                ) : null}
                {singleImage ? (
                  <ToolButton icon={Palette} label={labels.palette} disabled={busy} onClick={() => void pullPalette()} />
                ) : null}
                <span className="bg-border mx-1 h-5 w-px" />
                <ToolButton icon={Download} label={labels.exportPng} disabled={busy || nodes.length === 0} onClick={() => void exportPng()} />
              </div>
              {selectedEdge ? (
                <div className="bg-background mt-2 flex w-fit items-center gap-1 rounded-lg border p-1 shadow-sm">
                  <Input
                    value={selectedEdge.data?.label ?? ""}
                    placeholder={labels.lineLabel}
                    aria-label={labels.lineLabel}
                    className="h-8 w-44"
                    maxLength={80}
                    onFocus={commit}
                    onChange={(event) =>
                      patchEdge(selectedEdge.id, {
                        label: event.target.value,
                        arrow: selectedEdge.data?.arrow ?? false,
                      })
                    }
                  />
                  <ToolButton
                    icon={ArrowRight}
                    label={labels.arrow}
                    active={selectedEdge.data?.arrow ?? false}
                    onClick={() => {
                      commit();
                      patchEdge(selectedEdge.id, {
                        label: selectedEdge.data?.label ?? "",
                        arrow: !(selectedEdge.data?.arrow ?? false),
                      });
                    }}
                  />
                </div>
              ) : null}
            </Panel>
          ) : null}
          {canEdit ? (
            <Panel position="bottom-right">
              <p
                role="status"
                data-testid="board-save-state"
                className="bg-background text-muted-foreground rounded-md border px-2 py-1 text-xs"
              >
                {en.moodboard.saveState[saveState]}
              </p>
            </Panel>
          ) : null}
        </ReactFlow>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        data-testid="moodboard-file-input"
        aria-label={labels.upload}
        onChange={(event) => {
          void uploadImages([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{labels.fromLibrary}</DialogTitle>
          </DialogHeader>
          {libraryImages.length === 0 ? (
            <p className="text-muted-foreground text-sm">{en.moodboard.libraryEmpty}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {libraryImages.map((image) => (
                <LibraryThumb
                  key={image.id}
                  image={image}
                  onPick={() => {
                    addImages([
                      {
                        fileId: image.id,
                        path: image.path,
                        thumbPath: null,
                        name: image.name,
                        width: image.width,
                        height: image.height,
                      },
                    ]);
                    setLibraryOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BoardEditContext.Provider>
  );
}

// The moodboard: an infinite canvas of images, notes, text, colour swatches,
// link cards and groups, joined by connector lines.
export function MoodboardCanvas(props: Parameters<typeof Canvas>[0]) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
