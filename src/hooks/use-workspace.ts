"use client";

import { useSyncExternalStore } from "react";
import { createDefaultWorkspace, INVALID_SAVED_WORKSPACE_ERROR, limitWorkspace, readWorkspace, WORKSPACE_STORAGE_KEY, writeWorkspace } from "@/lib/storage";
import type { WorkspaceState } from "@/types/research";

interface StoreSnapshot { state: WorkspaceState; available: boolean; error: string | null; hydrated: boolean }
export interface WorkspaceMutationResult { ok: boolean; error: string | null }

const serverSnapshot: StoreSnapshot = { state: createDefaultWorkspace(), available: false, error: null, hydrated: false };
let snapshot: StoreSnapshot = serverSnapshot;
let initialized = false;
let invalidDataBlocked = false;
const listeners = new Set<() => void>();

function getStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

function initialize(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const read = readWorkspace(getStorage());
  invalidDataBlocked = read.error === INVALID_SAVED_WORKSPACE_ERROR;
  snapshot = { ...read, hydrated: true };
}

function emit(): void { for (const listener of listeners) listener(); }

function subscribe(listener: () => void): () => void {
  initialize();
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== WORKSPACE_STORAGE_KEY) return;
    const read = readWorkspace(getStorage());
    invalidDataBlocked = read.error === INVALID_SAVED_WORKSPACE_ERROR;
    snapshot = { ...read, hydrated: true };
    emit();
  };
  window.addEventListener("storage", handleStorage);
  queueMicrotask(listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", handleStorage); };
}

function getSnapshot(): StoreSnapshot { initialize(); return snapshot; }
function getServerSnapshot(): StoreSnapshot { return serverSnapshot; }

export function updateWorkspace(updater: (current: WorkspaceState) => WorkspaceState): WorkspaceMutationResult {
  initialize();
  if (invalidDataBlocked) {
    const error = snapshot.error ?? INVALID_SAVED_WORKSPACE_ERROR;
    return { ok: false, error };
  }
  const next = limitWorkspace(updater(snapshot.state));
  const error = writeWorkspace(getStorage(), next);
  if (error) {
    snapshot = { ...snapshot, available: false, error, hydrated: true };
    emit();
    return { ok: false, error };
  }
  snapshot = { state: next, available: true, error: null, hydrated: true };
  emit();
  return { ok: true, error: null };
}

export function replaceWorkspace(state: WorkspaceState): WorkspaceMutationResult {
  const next = limitWorkspace(state);
  const error = writeWorkspace(getStorage(), next);
  if (error) {
    snapshot = { ...snapshot, available: false, error, hydrated: true };
    initialized = true;
    emit();
    return { ok: false, error };
  }
  invalidDataBlocked = false;
  snapshot = { state: next, available: true, error: null, hydrated: true };
  initialized = true;
  emit();
  return { ok: true, error: null };
}

export function resetWorkspace(): WorkspaceMutationResult {
  return replaceWorkspace(createDefaultWorkspace());
}

export function useWorkspace(): StoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
