"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { moveApplicationAction } from "@/app/actions/applications";
import type { ApplicationWithStatus } from "@/lib/applications";
import { STATUS_META, statusLabel } from "@/lib/format";
import { STATUSES, type Status } from "@/lib/stateMachine";
import { cn } from "@/lib/utils";
import { ApplicationCard } from "./card";

export function KanbanBoard({ initialItems }: { initialItems: ApplicationWithStatus[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic status while a move is in flight. Reverts to `initialItems`
  // automatically when the transition ends, so a refused move snaps back
  // without extra bookkeeping; an accepted move is confirmed by the
  // revalidated server props.
  const [items, applyOptimisticMove] = useOptimistic(
    initialItems,
    (state, move: { id: string; status: Status }) =>
      state.map((a) => (a.id === move.id ? { ...a, status: move.status, ghosted: false } : a)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(STATUSES.map((s) => [s, [] as ApplicationWithStatus[]])) as Record<
      Status,
      ApplicationWithStatus[]
    >;
    for (const app of items) groups[app.status].push(app);
    return groups;
  }, [items]);

  const activeItem = activeId ? items.find((a) => a.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as Status | undefined;
    const app = items.find((a) => a.id === id);
    if (!app || !to || !STATUSES.includes(to) || to === app.status) return;

    startTransition(async () => {
      applyOptimisticMove({ id, status: to });
      const result = await moveApplicationAction(id, to);
      if (!result.ok) {
        // Optimistic state is discarded when this transition ends -> card snaps back.
        toast.error(`Can't move to ${statusLabel(to)}`, { description: result.reason });
        return;
      }
      toast.success(`${app.company} moved to ${statusLabel(result.status)}`);
      router.refresh();
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STATUSES.map((status) => (
          <Column key={status} status={status} items={byStatus[status]} activeId={activeId} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="w-64">
            <ApplicationCard app={activeItem} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  items,
  activeId,
}: {
  status: Status;
  items: ApplicationWithStatus[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label} column`}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/40 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <span className={cn("size-2 rounded-full", meta.dot)} />
        {meta.label}
        <span className="ml-auto rounded-full bg-background px-1.5 font-mono text-[11px] text-muted-foreground">
          {items.length}
        </span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {items.map((app) => (
          <DraggableCard key={app.id} app={app} dragging={activeId === app.id} />
        ))}
        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-4 text-xs text-muted-foreground">
            Drop here
          </div>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ app, dragging }: { app: ApplicationWithStatus; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: app.id,
    data: { status: app.status },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className="touch-none"
      {...listeners}
      {...attributes}
    >
      <ApplicationCard app={app} dragging={dragging} />
    </div>
  );
}
