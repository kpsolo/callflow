import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CollabClient } from "./client";
import { LocalStorageClient } from "./localStorageClient";

const Ctx = createContext<CollabClient | null>(null);

/**
 * Provides a singleton `CollabClient` to the React tree. Today the default
 * implementation is `LocalStorageClient` (single-browser, cross-tab); future
 * implementations can be supplied via the `client` prop without changing
 * any consumer.
 */
export function CollabProvider({
  children,
  client,
}: {
  children: ReactNode;
  /** Override for tests or for a future HTTP-backed implementation. */
  client?: CollabClient;
}) {
  const value = useMemo(() => client ?? new LocalStorageClient(), [client]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCollab(): CollabClient {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCollab must be used within <CollabProvider>");
  return ctx;
}
