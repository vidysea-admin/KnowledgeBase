/** Declarations for the adjacent scheduler implementation; importing it remains passive. */
export const POLL_MS: 300000;

export function validateSlots(value: unknown): string[];

export interface CapturePool {
  has(id: string): boolean;
  slot(preferred?: string, supports?: (slot: string) => boolean): string | undefined;
  start<T>(id: string, slot: string, body: (slot: string) => T | PromiseLike<T>): Promise<Awaited<T>>;
  drain(): Promise<void>;
  readonly size: number;
}

export function createCapturePool(slots: readonly string[]): CapturePool;

export function abortableWait(ms: number, signal?: AbortSignal): Promise<void>;

export interface AutonomousCycleOptions {
  cycle: () => unknown | PromiseLike<unknown>;
  drain: () => unknown | PromiseLike<unknown>;
  signal?: AbortSignal;
  wait?: (ms: number, signal?: AbortSignal) => unknown | PromiseLike<unknown>;
  log?: (message: string) => void;
  now?: () => number;
}

export function runAutonomousCycles(options: AutonomousCycleOptions): Promise<void>;
