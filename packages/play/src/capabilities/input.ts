/**
 * Served by the game: input as if a player gave it (keys, pointer). The Studio's play tool uses it to play-test; the
 * events reach the game the way real ones do (InputTarget, implemented on the DOM by the game runtime).
 */
import { literal, number, object, optional, string } from "../args";
import { type Capability, method } from "../capability";
import type { Remote } from "../session";

export interface KeyInput {
  readonly type: "down" | "up";
  readonly key: string;
  readonly code?: string | undefined;
}

/** x and y from 0 to 1 across the game's area. */
export interface PointerInput {
  readonly type: "down" | "move" | "up";
  readonly x: number;
  readonly y: number;
}

export interface InputTarget {
  readonly key: (input: KeyInput) => void;
  readonly pointer: (input: PointerInput) => void;
}

const unit = number({ min: 0, max: 1 });

export const inputCapability = ({ target }: { readonly target: InputTarget }): Capability => ({
  name: "input",
  version: 1,
  methods: {
    key: method(object({ type: literal("down", "up"), key: string({ max: 30 }), code: optional(string({ max: 30 })) }), (k) => {
      target.key(k);
      return null;
    }),
    pointer: method(object({ type: literal("down", "move", "up"), x: unit, y: unit }), (p) => {
      target.pointer(p);
      return null;
    }),
  },
});

export interface InputApi {
  readonly key: (input: KeyInput) => Promise<void>;
  readonly pointer: (input: PointerInput) => Promise<void>;
  /** Holds a key for `ms` (a jump, a run to the right). */
  readonly press: (key: string, ms: number, wait?: (ms: number) => Promise<void>) => Promise<void>;
  readonly tap: (x: number, y: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const inputApi = (remote: Remote): InputApi => {
  const key = async (input: KeyInput) => {
    await remote.call("input", "key", input);
  };
  const pointer = async (input: PointerInput) => {
    await remote.call("input", "pointer", input);
  };
  return {
    key,
    pointer,
    press: async (k, ms, wait = sleep) => {
      await key({ type: "down", key: k });
      await wait(ms);
      await key({ type: "up", key: k });
    },
    tap: async (x, y) => {
      await pointer({ type: "down", x, y });
      await pointer({ type: "up", x, y });
    },
  };
};
