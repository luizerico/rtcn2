"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { groupQuestionsByArea } from '@/components/surveys/SheetQuestionCard';
import {
  computeSurveyScore,
  formatAreaScore,
  formatScore,
  type ScoreableAnswer,
  type ScoreableQuestion,
  type SurveyScore,
} from '@/lib/surveyScore';

const EXPAND_ALL_QUESTION_LIMIT = 20;
const NODE_WIDTH = 228;
const NODE_HEIGHT = 72;
const H_GAP = 80;
const V_GAP = 16;
const PAD = 28;
const DRAG_THRESHOLD = 5;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.15;
const DISPOSITION_STORAGE_KEY = 'answers_tree_disposition_v1';

export type TreeDisposition = 'tree' | 'star' | 'organograma';

const DISPOSITIONS: { id: TreeDisposition; label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'star', label: 'Star' },
  { id: 'organograma', label: 'Organograma' },
];

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function readDisposition(): TreeDisposition {
  if (typeof window === 'undefined') return 'tree';
  try {
    const value = window.localStorage.getItem(DISPOSITION_STORAGE_KEY);
    if (value === 'star' || value === 'organograma' || value === 'tree') return value;
  } catch {
    // ignore
  }
  return 'tree';
}

function writeDisposition(value: TreeDisposition) {
  try {
    window.localStorage.setItem(DISPOSITION_STORAGE_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export type AnswersTreeQuestion = ScoreableQuestion & {
  code?: string;
  prompt: string;
};

export type AnswersTreeAnswer = ScoreableAnswer & {
  obs?: string;
};

export type AnswersTreeSelection = {
  id: string;
  kind: 'root' | 'area' | 'question';
  areaId?: string;
  questionId?: string;
};

type Offset = { dx: number; dy: number };

type AnswersAreaTreeProps = {
  title: string;
  questions: AnswersTreeQuestion[];
  answers: AnswersTreeAnswer[];
  rootScore?: SurveyScore;
  fileCountByQuestion?: Record<string, number>;
  layoutStorageKey?: string;
  selectedId?: string;
  onSelect?: (selection: AnswersTreeSelection) => void;
  onViewNotes?: (questionId: string) => void;
  onViewFiles?: (questionId: string) => void;
};

type NodeKind = 'root' | 'area' | 'question';

type LogicalNode = {
  id: string;
  kind: NodeKind;
  title: string;
  detail: string;
  fullTitle: string;
  expandable: boolean;
  areaId?: string;
  questionId?: string;
  hasNotes?: boolean;
  fileCount?: number;
  children: LogicalNode[];
};

type PlacedNode = LogicalNode & {
  x: number;
  y: number;
};

function truncate(text: string, max = 42) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function questionDetail(question: AnswersTreeQuestion, answer?: AnswersTreeAnswer) {
  const raw = answer?.value == null || answer.value === '' ? '' : String(answer.value);
  if (question.type === 'score') {
    return raw
      ? `${raw}${question.maxPoints != null ? ` / ${question.maxPoints}` : ''}`
      : '—';
  }
  return raw || '—';
}

function defaultExpandedIds(areaIds: string[], questionCount: number) {
  if (questionCount <= EXPAND_ALL_QUESTION_LIMIT) return new Set(areaIds);
  return new Set(areaIds.slice(0, 1));
}

function visibleChildren(node: LogicalNode, expanded: Set<string>) {
  return node.kind === 'area' && !expanded.has(node.id) ? [] : node.children;
}

function normalizePlaced(placed: PlacedNode[]): PlacedNode[] {
  if (!placed.length) return placed;
  const minX = Math.min(...placed.map((node) => node.x));
  const minY = Math.min(...placed.map((node) => node.y));
  const dx = PAD - minX;
  const dy = PAD - minY;
  return placed.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
}

function layoutTree(root: LogicalNode, expanded: Set<string>): PlacedNode[] {
  const placed: PlacedNode[] = [];

  const place = (node: LogicalNode, x: number, yStart: number): { midY: number; yEnd: number } => {
    const kids = visibleChildren(node, expanded);
    if (kids.length === 0) {
      placed.push({ ...node, x, y: yStart });
      return { midY: yStart + NODE_HEIGHT / 2, yEnd: yStart + NODE_HEIGHT };
    }

    let y = yStart;
    const mids: number[] = [];
    kids.forEach((child, index) => {
      const result = place(child, x + NODE_WIDTH + H_GAP, y);
      mids.push(result.midY);
      y = result.yEnd + (index < kids.length - 1 ? V_GAP : 0);
    });

    const midY = (mids[0] + mids[mids.length - 1]) / 2;
    placed.push({ ...node, x, y: midY - NODE_HEIGHT / 2 });
    return { midY, yEnd: y };
  };

  place(root, 0, 0);
  return normalizePlaced(placed);
}

function layoutOrganograma(root: LogicalNode, expanded: Set<string>): PlacedNode[] {
  const placed: PlacedNode[] = [];
  const rowGap = NODE_HEIGHT + 48;

  const place = (node: LogicalNode, y: number, xStart: number): { midX: number; xEnd: number } => {
    const kids = visibleChildren(node, expanded);
    if (kids.length === 0) {
      placed.push({ ...node, x: xStart, y });
      return { midX: xStart + NODE_WIDTH / 2, xEnd: xStart + NODE_WIDTH };
    }

    let x = xStart;
    const mids: number[] = [];
    kids.forEach((child, index) => {
      const result = place(child, y + rowGap, x);
      mids.push(result.midX);
      x = result.xEnd + (index < kids.length - 1 ? 28 : 0);
    });

    const midX = (mids[0] + mids[mids.length - 1]) / 2;
    placed.push({ ...node, x: midX - NODE_WIDTH / 2, y });
    return { midX, xEnd: Math.max(x, midX + NODE_WIDTH / 2) };
  };

  place(root, 0, 0);
  return normalizePlaced(placed);
}

function layoutStar(root: LogicalNode, expanded: Set<string>): PlacedNode[] {
  const placed: PlacedNode[] = [];
  const areas = visibleChildren(root, expanded);
  const count = Math.max(areas.length, 1);
  const areaRadius = Math.max(280, 90 + count * 48);

  placed.push({
    ...root,
    x: -NODE_WIDTH / 2,
    y: -NODE_HEIGHT / 2,
  });

  areas.forEach((area, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    const ax = Math.cos(angle) * areaRadius;
    const ay = Math.sin(angle) * areaRadius;
    placed.push({ ...area, x: ax - NODE_WIDTH / 2, y: ay - NODE_HEIGHT / 2 });

    const questions = visibleChildren(area, expanded);
    if (!questions.length) return;
    const qCount = questions.length;
    const qRadius = Math.max(190, 80 + qCount * 16);
    const spread = Math.min(Math.PI * 0.75, 0.38 * qCount);
    questions.forEach((question, qIndex) => {
      const t =
        qCount === 1 ? angle : angle - spread / 2 + (spread * qIndex) / Math.max(1, qCount - 1);
      placed.push({
        ...question,
        x: ax + Math.cos(t) * qRadius - NODE_WIDTH / 2,
        y: ay + Math.sin(t) * qRadius - NODE_HEIGHT / 2,
      });
    });
  });

  return normalizePlaced(placed);
}

function layoutByDisposition(
  root: LogicalNode,
  expanded: Set<string>,
  disposition: TreeDisposition
): PlacedNode[] {
  if (disposition === 'star') return layoutStar(root, expanded);
  if (disposition === 'organograma') return layoutOrganograma(root, expanded);
  return layoutTree(root, expanded);
}

function rectEdgePoint(node: PlacedNode, towardX: number, towardY: number) {
  const cx = node.x + NODE_WIDTH / 2;
  const cy = node.y + NODE_HEIGHT / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  const t = Math.min(
    NODE_WIDTH / 2 / Math.max(Math.abs(ux), 1e-6),
    NODE_HEIGHT / 2 / Math.max(Math.abs(uy), 1e-6)
  );
  return { x: cx + ux * t, y: cy + uy * t };
}

function edgePath(from: PlacedNode, to: PlacedNode, disposition: TreeDisposition) {
  if (disposition === 'organograma') {
    const x1 = from.x + NODE_WIDTH / 2;
    const y1 = from.y + NODE_HEIGHT;
    const x2 = to.x + NODE_WIDTH / 2;
    const y2 = to.y;
    const bend = Math.max(24, (y2 - y1) * 0.45);
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  }
  if (disposition === 'star') {
    const start = rectEdgePoint(from, to.x + NODE_WIDTH / 2, to.y + NODE_HEIGHT / 2);
    const end = rectEdgePoint(to, from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT / 2);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    return `M ${start.x} ${start.y} Q ${mx} ${my}, ${end.x} ${end.y}`;
  }
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x - 2;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(36, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function flattenVisible(root: LogicalNode, expanded: Set<string>): LogicalNode[] {
  const out: LogicalNode[] = [];
  const walk = (node: LogicalNode) => {
    out.push(node);
    if (node.kind === 'area' && !expanded.has(node.id)) return;
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}

function readOffsets(key?: string): Record<string, Offset> {
  if (!key || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Offset>;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, Offset> = {};
    for (const [id, offset] of Object.entries(parsed)) {
      const dx = Number(offset?.dx);
      const dy = Number(offset?.dy);
      if (Number.isFinite(dx) && Number.isFinite(dy)) next[id] = { dx, dy };
    }
    return next;
  } catch {
    return {};
  }
}

function writeOffsets(key: string | undefined, offsets: Record<string, Offset>) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(offsets));
  } catch {
    // ignore quota / private mode
  }
}

function selectionOf(node: LogicalNode): AnswersTreeSelection {
  return {
    id: node.id,
    kind: node.kind,
    areaId: node.areaId,
    questionId: node.questionId,
  };
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export default function AnswersAreaTree({
  title,
  questions,
  answers,
  rootScore,
  fileCountByQuestion = {},
  layoutStorageKey,
  selectedId,
  onSelect,
  onViewNotes,
  onViewFiles,
}: AnswersAreaTreeProps) {
  const markerUid = useId().replace(/:/g, '');
  const arrowId = `answers-tree-arrow-${markerUid}`;
  const dragRef = useRef<{
    ids: string[];
    startX: number;
    startY: number;
    orig: Record<string, Offset>;
    moved: boolean;
    shift: boolean;
  } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    add: boolean;
    moved: boolean;
  } | null>(null);

  const answersByQuestion = useMemo(
    () => new Map(answers.map((row) => [String(row.questionId), row])),
    [answers]
  );

  const groups = useMemo(() => groupQuestionsByArea(questions), [questions]);

  const logicalRoot = useMemo<LogicalNode>(() => {
    const areaNodes: LogicalNode[] = groups.map((group) => {
      const areaScore = computeSurveyScore(
        group.questions.map((question) => ({
          ...question,
          weight: question.weight == null ? 1 : question.weight,
        })),
        answers
      );
      return {
        id: `area:${group.id}`,
        kind: 'area' as const,
        title: group.label,
        detail: formatAreaScore(areaScore),
        fullTitle: `${group.label} · ${formatAreaScore(areaScore)}`,
        expandable: group.questions.length > 0,
        areaId: group.id,
        children: group.questions.map((question) => {
          const answer = answersByQuestion.get(question.questionId);
          const label = question.code
            ? `${question.code} · ${question.prompt}`
            : question.prompt;
          return {
            id: `question:${question.questionId}`,
            kind: 'question' as const,
            title: truncate(label),
            detail: questionDetail(question, answer),
            fullTitle: label,
            expandable: false,
            areaId: group.id,
            questionId: question.questionId,
            hasNotes: Boolean(answer?.obs?.trim()),
            fileCount: fileCountByQuestion[question.questionId] || 0,
            children: [],
          };
        }),
      };
    });

    return {
      id: 'root',
      kind: 'root',
      title: truncate(title || 'Instrument sheet', 36),
      detail: formatScore(rootScore),
      fullTitle: `${title || 'Instrument sheet'} · ${formatScore(rootScore)}`,
      expandable: false,
      children: areaNodes,
    };
  }, [answers, answersByQuestion, fileCountByQuestion, groups, rootScore, title]);

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultExpandedIds(
      groups.map((group) => `area:${group.id}`),
      questions.length
    )
  );
  const [internalSelectedId, setInternalSelectedId] = useState('root');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [boxedIds, setBoxedIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [offsets, setOffsets] = useState<Record<string, Offset>>({});
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [disposition, setDisposition] = useState<TreeDisposition>('tree');
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const boxedIdsRef = useRef(boxedIds);
  boxedIdsRef.current = boxedIds;

  const activeSelectedId = selectedId ?? internalSelectedId;

  useEffect(() => {
    setOffsets(readOffsets(layoutStorageKey));
  }, [layoutStorageKey]);

  useEffect(() => {
    setDisposition(readDisposition());
  }, []);

  const placed = useMemo(
    () => layoutByDisposition(logicalRoot, expanded, disposition),
    [disposition, expanded, logicalRoot]
  );
  const visible = useMemo(() => flattenVisible(logicalRoot, expanded), [expanded, logicalRoot]);

  const displayNodes = useMemo(
    () =>
      placed.map((node) => {
        const offset = offsets[node.id];
        return {
          ...node,
          x: Math.max(8, node.x + (offset?.dx || 0)),
          y: Math.max(8, node.y + (offset?.dy || 0)),
        };
      }),
    [offsets, placed]
  );

  const placedById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);
  const displayNodesRef = useRef(displayNodes);
  displayNodesRef.current = displayNodes;

  const canvasWidth = Math.max(
    NODE_WIDTH + PAD * 2,
    ...displayNodes.map((node) => node.x + NODE_WIDTH + PAD)
  );
  const canvasHeight = Math.max(
    NODE_HEIGHT + PAD * 2,
    ...displayNodes.map((node) => node.y + NODE_HEIGHT + PAD)
  );

  const edges = useMemo(() => {
    const lines: Array<{ from: PlacedNode; to: PlacedNode }> = [];
    for (const node of displayNodes) {
      if (node.kind === 'area' && !expanded.has(node.id)) continue;
      for (const child of node.children) {
        const to = placedById.get(child.id);
        if (to) lines.push({ from: node, to });
      }
    }
    return lines;
  }, [displayNodes, expanded, placedById]);

  const hasCustomLayout = Object.keys(offsets).length > 0;

  const commitOffsets = useCallback(
    (next: Record<string, Offset>) => {
      setOffsets(next);
      writeOffsets(layoutStorageKey, next);
    },
    [layoutStorageKey]
  );

  const toggleArea = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectNode = useCallback(
    (node: LogicalNode) => {
      setInternalSelectedId(node.id);
      onSelect?.(selectionOf(node));
    },
    [onSelect]
  );

  const focusNode = useCallback(
    (id: string) => {
      const node = visible.find((item) => item.id === id);
      if (node) selectNode(node);
      requestAnimationFrame(() => {
        document.getElementById(`answers-tree-${id}`)?.focus();
      });
    },
    [selectNode, visible]
  );

  const onKeyDown = (event: KeyboardEvent, node: PlacedNode) => {
    const index = visible.findIndex((item) => item.id === node.id);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = visible[Math.min(visible.length - 1, index + 1)];
      if (next) focusNode(next.id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = visible[Math.max(0, index - 1)];
      if (prev) focusNode(prev.id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (visible[0]) focusNode(visible[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = visible[visible.length - 1];
      if (last) focusNode(last.id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (node.kind === 'area' && !expanded.has(node.id)) {
        toggleArea(node.id);
      } else if (node.children[0] && (node.kind !== 'area' || expanded.has(node.id))) {
        focusNode(node.children[0].id);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (node.kind === 'area' && expanded.has(node.id)) {
        toggleArea(node.id);
      } else {
        const parent = displayNodes.find((item) => item.children.some((child) => child.id === node.id));
        if (parent) focusNode(parent.id);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(node);
      if (node.kind === 'area' && node.expandable && !onSelect) {
        toggleArea(node.id);
      }
    }
  };

  const finishPointer = useCallback(
    (node: PlacedNode, wasDrag: boolean, shift: boolean) => {
      dragRef.current = null;
      setDraggingId(null);
      if (wasDrag) {
        setOffsets((prev) => {
          writeOffsets(layoutStorageKey, prev);
          return prev;
        });
        return;
      }
      if (!shift) {
        setBoxedIds(new Set([node.id]));
        selectNode(node);
        if (node.kind === 'area' && node.expandable) {
          if (onSelect) {
            setExpanded((prev) => {
              if (prev.has(node.id)) return prev;
              const next = new Set(prev);
              next.add(node.id);
              return next;
            });
          } else {
            toggleArea(node.id);
          }
        }
      }
    },
    [layoutStorageKey, onSelect, selectNode, toggleArea]
  );

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (clientX - left - v.x) / (v.zoom || 1),
      y: (clientY - top - v.y) / (v.zoom || 1),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, node: PlacedNode) => {
    if (event.button != null && event.button !== 0) return;
    const startX = Number(event.clientX) || 0;
    const startY = Number(event.clientY) || 0;
    const shift = Boolean(event.shiftKey);
    const currentBox = boxedIdsRef.current;
    let ids: string[];
    if (shift) {
      const next = new Set(currentBox);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      setBoxedIds(next);
      ids = next.size ? [...next] : [node.id];
    } else if (currentBox.has(node.id) && currentBox.size > 1) {
      ids = [...currentBox];
    } else {
      ids = [node.id];
      setBoxedIds(new Set([node.id]));
    }
    const orig: Record<string, Offset> = {};
    for (const id of ids) orig[id] = offsets[id] || { dx: 0, dy: 0 };
    dragRef.current = { ids, startX, startY, orig, moved: false, shift };

    const onMove = (ev: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = (Number(ev.clientX) || 0) - drag.startX;
      const deltaY = (Number(ev.clientY) || 0) - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
        drag.moved = true;
        setDraggingId(node.id);
      }
      if (!drag.moved) return;
      const zoom = viewRef.current.zoom || 1;
      setOffsets((prev) => {
        const next = { ...prev };
        for (const id of drag.ids) {
          const base = drag.orig[id] || { dx: 0, dy: 0 };
          next[id] = { dx: base.dx + deltaX / zoom, dy: base.dy + deltaY / zoom };
        }
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const drag = dragRef.current;
      finishPointer(node, Boolean(drag?.moved), Boolean(drag?.shift));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = Number(event.clientX) || 0;
    const startY = Number(event.clientY) || 0;
    const orig = viewRef.current;
    setPanning(true);

    const onMove = (ev: globalThis.PointerEvent) => {
      setView({
        zoom: orig.zoom,
        x: orig.x + ((Number(ev.clientX) || 0) - startX),
        y: orig.y + ((Number(ev.clientY) || 0) - startY),
      });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      startPan(event);
      return;
    }
    if (event.button != null && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="treeitem"]')) return;
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const startX = (Number(event.clientX) || 0) - left;
    const startY = (Number(event.clientY) || 0) - top;
    marqueeRef.current = {
      startX,
      startY,
      add: Boolean(event.shiftKey),
      moved: false,
    };
    setMarquee({ x: startX, y: startY, w: 0, h: 0 });

    const onMove = (ev: globalThis.PointerEvent) => {
      const session = marqueeRef.current;
      if (!session) return;
      const x = (Number(ev.clientX) || 0) - left;
      const y = (Number(ev.clientY) || 0) - top;
      if (!session.moved && Math.hypot(x - session.startX, y - session.startY) >= DRAG_THRESHOLD) {
        session.moved = true;
      }
      setMarquee({
        x: Math.min(session.startX, x),
        y: Math.min(session.startY, y),
        w: Math.abs(x - session.startX),
        h: Math.abs(y - session.startY),
      });
    };

    const onUp = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const session = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (!session) return;
      if (!session.moved) {
        if (!session.add) setBoxedIds(new Set());
        return;
      }
      const a = clientToWorld(left + session.startX, top + session.startY);
      const b = clientToWorld(Number(ev.clientX) || 0, Number(ev.clientY) || 0);
      const rx = Math.min(a.x, b.x);
      const ry = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x);
      const rh = Math.abs(b.y - a.y);
      const hits = displayNodesRef.current
        .filter((node) => rectsOverlap(rx, ry, rw, rh, node.x, node.y, NODE_WIDTH, NODE_HEIGHT))
        .map((node) => node.id);
      setBoxedIds((prev) => {
        if (!session.add) return new Set(hits);
        const next = new Set(prev);
        for (const id of hits) next.add(id);
        return next;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const zoomBy = useCallback((factor: number, origin?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const prev = viewRef.current;
    const rect = viewport?.getBoundingClientRect();
    const cx = origin?.x ?? (rect ? rect.width / 2 : 0);
    const cy = origin?.y ?? (rect ? rect.height / 2 : 0);
    const nextZoom = clampZoom(prev.zoom * factor);
    const worldX = (cx - prev.x) / prev.zoom;
    const worldY = (cy - prev.y) / prev.zoom;
    setView({
      zoom: nextZoom,
      x: cx - worldX * nextZoom,
      y: cy - worldY * nextZoom,
    });
  }, []);

  const resetView = useCallback(() => {
    setView({ zoom: 1, x: 0, y: 0 });
  }, []);

  const setDispositionAndSave = (next: TreeDisposition) => {
    setDisposition(next);
    writeDisposition(next);
    resetView();
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, questions.length]);

  if (questions.length === 0) {
    return <p className="p-5 text-sm text-[var(--muted)]">No questions on this instrument.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div
          className="inline-flex rounded-md border border-[var(--border)] p-0.5"
          role="group"
          aria-label="Tree disposition"
        >
          {DISPOSITIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={disposition === option.id}
              onClick={() => setDispositionAndSave(option.id)}
              className={`rounded px-3 py-1 text-sm ${
                disposition === option.id
                  ? 'bg-[var(--accent)] font-medium text-white'
                  : 'text-[var(--foreground)] hover:bg-[var(--accent-soft)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex items-center gap-1" role="group" aria-label="Tree zoom">
            <button
              type="button"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--accent-soft)]"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="min-w-[3.5rem] text-center text-xs text-[var(--muted)]">{Math.round(view.zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--accent-soft)]"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={resetView}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
          >
            Reset view
          </button>
          <button
            type="button"
            disabled={!hasCustomLayout}
            onClick={() => commitOffsets({})}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-40"
          >
            Reset positions
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={onViewportPointerDown}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onAuxClick={(event) => event.preventDefault()}
        className={`relative h-[min(70vh,52rem)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--accent-soft)]/25 ${
          panning ? 'cursor-grabbing' : marquee ? 'cursor-crosshair' : 'cursor-crosshair'
        }`}
      >
        <div
          role="tree"
          aria-label="Survey answers by area"
          className="relative origin-top-left"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 text-[var(--muted)]"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={arrowId}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" opacity="0.7" />
              </marker>
            </defs>
            {edges.map(({ from, to }) => (
              <path
                key={`${from.id}-${to.id}`}
                d={edgePath(from, to, disposition)}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                opacity="0.65"
                markerEnd={`url(#${arrowId})`}
              />
            ))}
          </svg>

          {displayNodes.map((node) => {
            const selected = activeSelectedId === node.id || boxedIds.has(node.id);
            const hovered = hoveredId === node.id;
            const active = selected || hovered || draggingId === node.id || boxedIds.has(node.id);
            const expandedArea = node.kind === 'area' && expanded.has(node.id);
            const borderClass =
              node.kind === 'root'
                ? active
                  ? 'border-[3px] border-[var(--accent)] bg-[var(--accent-soft)]/70 shadow-sm'
                  : 'border-2 border-[var(--accent)] bg-[var(--accent-soft)]/50'
                : active
                  ? 'border-[3px] border-[var(--accent)] bg-[var(--surface)] shadow-sm'
                  : 'border border-[var(--border)] bg-[var(--surface)]';

            return (
              <div
                key={node.id}
                id={`answers-tree-${node.id}`}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={node.kind === 'area' ? expandedArea : undefined}
                aria-level={node.kind === 'root' ? 1 : node.kind === 'area' ? 2 : 3}
                aria-label={node.fullTitle}
                tabIndex={selected ? 0 : -1}
                title={`${node.fullTitle} · Drag to reposition · Shift+click to add to selection`}
                onPointerDown={(event) => {
                  if (event.button === 1) return;
                  event.stopPropagation();
                  onPointerDown(event, node);
                }}
                onKeyDown={(event) => onKeyDown(event, node)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === node.id ? null : prev))}
                className={`absolute flex select-none flex-col justify-center rounded-xl px-3 py-2 text-left outline-none touch-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  draggingId === node.id ? 'z-10 cursor-grabbing' : 'cursor-grab'
                } ${borderClass}`}
                style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold leading-5">{node.title}</p>
                  {node.kind === 'area' && node.expandable ? (
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-[10px] text-[var(--muted)] hover:text-[var(--accent)]"
                      aria-label={expandedArea ? `Collapse ${node.title}` : `Expand ${node.title}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleArea(node.id);
                      }}
                    >
                      {expandedArea ? '▾' : '▸'}
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 flex items-center gap-2 truncate text-xs text-[var(--muted)]">
                  <span className="truncate">{node.detail}</span>
                  {node.kind === 'question' && node.hasNotes ? (
                    <button
                      type="button"
                      className="shrink-0 hover:text-[var(--accent)]"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (node.questionId) onViewNotes?.(node.questionId);
                      }}
                    >
                      Notes
                    </button>
                  ) : null}
                  {node.kind === 'question' && node.fileCount ? (
                    <button
                      type="button"
                      className="shrink-0 hover:text-[var(--accent)]"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (node.questionId) onViewFiles?.(node.questionId);
                      }}
                    >
                      Files ({node.fileCount})
                    </button>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
        {marquee && marquee.w + marquee.h > 0 ? (
          <div
            className="pointer-events-none absolute z-20 border border-[var(--accent)] bg-[var(--accent)]/15"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
