"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-types";
import { comparePositions, positionAt, positionBetween } from "@/lib/position";
import type { Segment, Shot, ShotList } from "@/lib/shots/types";
import { createClient } from "@/lib/supabase/client";
import { en } from "@/messages/en";

import {
  addCast,
  createSegment,
  createShot,
  deleteSegment,
  deleteShots,
  duplicateShots,
  moveSegment,
  moveShots,
  removeCast,
  updateSegment,
  updateShot,
} from "./actions";
import { loadShotList, type TalentName } from "./queries";
import type { ShotPatch } from "./schema";

export const shotListKey = (creativeId: string) => ["shot-list", creativeId] as const;

const sortByPosition = <T extends { position: string }>(rows: T[]) =>
  [...rows].sort((a, b) => comparePositions(a.position, b.position));

function emptyShot(id: string, segmentId: string, position: string): Shot {
  return {
    id,
    segment_id: segmentId,
    position,
    shot_number: null,
    action: null,
    audio: null,
    on_screen_text: null,
    shot_size: null,
    camera_movement: null,
    camera_angle: null,
    lens: null,
    frame_rate: null,
    equipment_note: null,
    int_ext: null,
    day_night: null,
    status: "planned",
    notes: null,
    duration_sec: 0,
    setup_min: null,
    custom_values: {},
    talent_ids: [],
    active_frame_id: null,
    frame_path: null,
  };
}

// The shot list of one creative: a client cache that changes at once, and
// Server Actions that follow. Writes for one shot run in order, so an edit
// typed right after "new shot" never reaches the server before the insert.
export function useShotList(projectId: string, creativeId: string, initial: ShotList) {
  const queryClient = useQueryClient();
  const key = useMemo(() => shotListKey(creativeId), [creativeId]);
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => loadShotList(createClient(), creativeId),
    initialData: initial,
  });

  const queues = useRef(new Map<string, Promise<unknown>>());
  const logged = useRef(new Set<string>());
  const firstRender = useRef(true);
  const pendingWrites = useRef(0);
  const reloadWanted = useRef(false);

  // A later server render (after a column change, say) means the data may
  // have changed. It can be older than edits made here in the meantime, so
  // it is not copied into the cache; the list reloads from the database once
  // the writes in flight have finished.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (pendingWrites.current > 0) reloadWanted.current = true;
    else void queryClient.invalidateQueries({ queryKey: key });
  }, [initial, key, queryClient]);

  const update = useCallback(
    (change: (list: ShotList) => ShotList) => {
      // A reload already under way would bring back the state from before
      // this change. Drop it and reload again when the writes are through.
      if (queryClient.isFetching({ queryKey: key }) > 0) {
        void queryClient.cancelQueries({ queryKey: key });
        reloadWanted.current = true;
      }
      queryClient.setQueryData<ShotList>(key, (list) => (list ? change(list) : list));
    },
    [key, queryClient],
  );
  const current = useCallback(
    () => queryClient.getQueryData<ShotList>(key) ?? initial,
    [initial, key, queryClient],
  );
  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [key, queryClient]);

  // Runs a write after the previous one for the same row. A failure is shown
  // and the cache is reloaded from the database.
  const write = useCallback(
    <T,>(rowId: string, action: () => Promise<ActionResult<T>>): Promise<T | undefined> => {
      const previous = queues.current.get(rowId) ?? Promise.resolve();
      pendingWrites.current += 1;
      const next = previous.then(async () => {
        const result = await action();
        pendingWrites.current -= 1;
        if (!result.ok) {
          toast.error(result.error);
          reloadWanted.current = true;
        }
        if (reloadWanted.current && pendingWrites.current === 0) {
          reloadWanted.current = false;
          await reload();
        }
        return result.ok ? result.data : undefined;
      });
      queues.current.set(rowId, next);
      return next;
    },
    [reload],
  );

  const patchShot = useCallback(
    (shotId: string, patch: ShotPatch) => {
      const { custom_values: customValues, status, ...fields } = patch;
      // Only the fields present in the patch change.
      const defined = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as Partial<Shot>;
      update((list) => ({
        ...list,
        shots: list.shots.map((shot) =>
          shot.id === shotId
            ? {
                ...shot,
                ...defined,
                status: status === undefined ? shot.status : (status ?? "planned"),
                custom_values: { ...shot.custom_values, ...customValues },
              }
            : shot,
        ),
      }));
    },
    [update],
  );

  // Changes fields of a shot here and on the server.
  const saveShot = useCallback(
    (shotId: string, patch: ShotPatch) => {
      patchShot(shotId, patch);
      const logEdit = !logged.current.has(shotId);
      logged.current.add(shotId);
      void write(shotId, () => updateShot({ projectId, shotId, patch, logEdit }));
    },
    [patchShot, projectId, write],
  );

  // Adds an empty shot to a segment, after the given shot or at the end.
  const addShot = useCallback(
    (segmentId: string, afterShotId?: string): string => {
      const siblings = sortByPosition(current().shots.filter((shot) => shot.segment_id === segmentId));
      const index = afterShotId
        ? siblings.findIndex((shot) => shot.id === afterShotId) + 1
        : siblings.length;
      const position = positionAt(
        siblings.map((shot) => shot.position),
        index === 0 && afterShotId ? siblings.length : index,
      );
      const id = crypto.randomUUID();
      // Already logged as "created"; its first edits need no second entry.
      logged.current.add(id);
      update((list) => ({ ...list, shots: [...list.shots, emptyShot(id, segmentId, position)] }));
      void write(id, () => createShot({ projectId, shotId: id, segmentId, position }));
      return id;
    },
    [current, projectId, update, write],
  );

  const moveShot = useCallback(
    (shotId: string, segmentId: string, position: string) => {
      update((list) => ({
        ...list,
        shots: list.shots.map((shot) =>
          shot.id === shotId ? { ...shot, segment_id: segmentId, position } : shot,
        ),
      }));
      void write(shotId, () => moveShots({ projectId, moves: [{ shotId, segmentId, position }] }));
    },
    [projectId, update, write],
  );

  // Appends several shots to the end of a segment, keeping their order.
  const moveShotsToSegment = useCallback(
    (shotIds: string[], segmentId: string) => {
      const list = current();
      const selected = new Set(shotIds);
      let last =
        sortByPosition(
          list.shots.filter((shot) => shot.segment_id === segmentId && !selected.has(shot.id)),
        ).at(-1)?.position ?? null;
      const order = new Map(sortByPosition(list.segments).map((segment, index) => [segment.id, index]));
      const moves = list.shots
        .filter((shot) => selected.has(shot.id))
        .sort(
          (a, b) =>
            (order.get(a.segment_id) ?? 0) - (order.get(b.segment_id) ?? 0) ||
            comparePositions(a.position, b.position),
        )
        .map((shot) => {
          last = positionBetween(last, null);
          return { shotId: shot.id, segmentId, position: last };
        });
      if (moves.length === 0) return;
      const byId = new Map(moves.map((move) => [move.shotId, move]));
      update((state) => ({
        ...state,
        shots: state.shots.map((shot) => {
          const move = byId.get(shot.id);
          return move ? { ...shot, segment_id: move.segmentId, position: move.position } : shot;
        }),
      }));
      void write("bulk", () => moveShots({ projectId, moves }));
    },
    [current, projectId, update, write],
  );

  const removeShots = useCallback(
    (shotIds: string[]) => {
      const removed = new Set(shotIds);
      update((list) => ({ ...list, shots: list.shots.filter((shot) => !removed.has(shot.id)) }));
      void write("bulk", () => deleteShots({ projectId, shotIds }));
    },
    [projectId, update, write],
  );

  // Copies are made on the server; the list reloads to show them.
  const copyShots = useCallback(
    async (shotIds: string[]) => {
      await write("bulk", () => duplicateShots({ projectId, shotIds }));
      await reload();
      toast.success(en.shots.duplicated(shotIds.length));
    },
    [projectId, reload, write],
  );

  const addCastByName = useCallback(
    async (shotId: string, name: string): Promise<TalentName | undefined> => {
      const talent = await write(shotId, () => addCast({ projectId, shotId, name }));
      if (!talent) return undefined;
      update((list) => ({
        ...list,
        shots: list.shots.map((shot) =>
          shot.id === shotId && !shot.talent_ids.includes(talent.id)
            ? { ...shot, talent_ids: [...shot.talent_ids, talent.id] }
            : shot,
        ),
      }));
      return talent;
    },
    [projectId, update, write],
  );

  const removeCastMember = useCallback(
    (shotId: string, talentId: string) => {
      update((list) => ({
        ...list,
        shots: list.shots.map((shot) =>
          shot.id === shotId
            ? { ...shot, talent_ids: shot.talent_ids.filter((id) => id !== talentId) }
            : shot,
        ),
      }));
      void write(shotId, () => removeCast({ projectId, shotId, talentId }));
    },
    [projectId, update, write],
  );

  const addSegment = useCallback(
    (title: string) => {
      const last = sortByPosition(current().segments).at(-1)?.position ?? null;
      const segment: Segment = {
        id: crypto.randomUUID(),
        title,
        description: null,
        target_duration_sec: null,
        position: positionBetween(last, null),
      };
      update((list) => ({ ...list, segments: [...list.segments, segment] }));
      void write(segment.id, () =>
        createSegment({
          projectId,
          creativeId,
          segmentId: segment.id,
          title,
          position: segment.position,
        }),
      );
    },
    [creativeId, current, projectId, update, write],
  );

  const saveSegment = useCallback(
    (segmentId: string, title: string, targetDurationSec: number | null) => {
      update((list) => ({
        ...list,
        segments: list.segments.map((segment) =>
          segment.id === segmentId
            ? { ...segment, title, target_duration_sec: targetDurationSec }
            : segment,
        ),
      }));
      void write(segmentId, () => updateSegment({ projectId, segmentId, title, targetDurationSec }));
    },
    [projectId, update, write],
  );

  const reorderSegment = useCallback(
    (segmentId: string, position: string) => {
      update((list) => ({
        ...list,
        segments: list.segments.map((segment) =>
          segment.id === segmentId ? { ...segment, position } : segment,
        ),
      }));
      void write(segmentId, () => moveSegment({ projectId, segmentId, position }));
    },
    [projectId, update, write],
  );

  const removeSegment = useCallback(
    (segmentId: string) => {
      update((list) => ({
        segments: list.segments.filter((segment) => segment.id !== segmentId),
        shots: list.shots.filter((shot) => shot.segment_id !== segmentId),
      }));
      void write(segmentId, () => deleteSegment({ projectId, segmentId }));
    },
    [projectId, update, write],
  );

  // One stable object, so memoised rows and cells do not re-render for it.
  const actions = useMemo(
    () => ({
      patchShot,
      saveShot,
      addShot,
      moveShot,
      moveShotsToSegment,
      removeShots,
      copyShots,
      addCastByName,
      removeCastMember,
      addSegment,
      saveSegment,
      reorderSegment,
      removeSegment,
      reload,
    }),
    [
      patchShot,
      saveShot,
      addShot,
      moveShot,
      moveShotsToSegment,
      removeShots,
      copyShots,
      addCastByName,
      removeCastMember,
      addSegment,
      saveSegment,
      reorderSegment,
      removeSegment,
      reload,
    ],
  );

  return {
    segments: useMemo(() => sortByPosition(data.segments), [data.segments]),
    shots: data.shots,
    actions,
  };
}

export type ShotListStore = ReturnType<typeof useShotList>;
export type ShotListActions = ShotListStore["actions"];
