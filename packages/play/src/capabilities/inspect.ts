/**
 * Served by the game: what state it is in (what it chose to expose) and a picture of it. The Studio's play tool calls
 * these to check that a key press did what it should.
 */
import { none, number, object, optional } from "../args";
import { type Capability, method } from "../capability";
import { PlayError } from "../protocol";
import type { Remote } from "../session";

export interface Snapshotter {
  /** A data: URL of what the game shows, at most `maxWidth` wide, or null when there is nothing to picture. */
  readonly snapshot: (maxWidth: number) => Promise<string | null>;
}

const MAX_STATE_BYTES = 64 * 1024;

/** The capability and `expose`, which the game calls with a function returning its state (score, lives, position…). */
export const inspectCapability = ({ snapshotter }: { readonly snapshotter: Snapshotter }) => {
  let read: (() => unknown) | undefined;
  const capability: Capability = {
    name: "inspect",
    version: 1,
    methods: {
      state: method(none, () => {
        if (!read) return null;
        const text = JSON.stringify(read());
        if (text === undefined) return null;
        if (new TextEncoder().encode(text).length > MAX_STATE_BYTES)
          throw new PlayError({ code: "too-big", message: `The exposed state is over ${MAX_STATE_BYTES} bytes` });
        return JSON.parse(text);
      }),
      snapshot: method(object({ maxWidth: optional(number({ min: 64, max: 2048 })) }), ({ maxWidth }) => snapshotter.snapshot(maxWidth ?? 640)),
    },
  };
  return {
    capability,
    expose: (state: () => unknown) => {
      read = state;
    },
  };
};

export interface InspectApi {
  readonly state: () => Promise<unknown>;
  readonly snapshot: (maxWidth?: number) => Promise<string | null>;
}

export const inspectApi = (remote: Remote): InspectApi => ({
  state: () => remote.call("inspect", "state"),
  snapshot: async (maxWidth) => {
    const v = await remote.call("inspect", "snapshot", maxWidth === undefined ? {} : { maxWidth });
    return typeof v === "string" ? v : null;
  },
});
