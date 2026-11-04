/**
 * A capability is one thing a side offers the other: a name, a version, methods (each with its own argument parser)
 * and the events it may send. A Registry is the set a side offers; nothing in the protocol, the peer or the client
 * knows any capability by name, so a new one is a new module registered by whoever composes the runtime.
 */
import type { Parser } from "./args";
import { type CapabilityDescriptor, PlayError } from "./protocol";

export interface Method {
  readonly invoke: (args: unknown) => Promise<unknown>;
}

/** A method from its argument parser and what it does with the parsed arguments. */
export const method = <A, R>(parse: Parser<A>, run: (args: A) => R | Promise<R>): Method => ({
  invoke: async (args) => run(parse(args)),
});

export type Emit = (event: string, data: unknown) => void;

export interface Capability {
  readonly name: string;
  readonly version: number;
  readonly methods: Readonly<Record<string, Method>>;
  readonly events?: readonly string[];
  /** Starts what sends events; returns how to stop. Called once the other side is connected. */
  readonly start?: (emit: Emit) => () => void;
}

export interface Registry {
  readonly describe: () => readonly CapabilityDescriptor[];
  readonly invoke: (capability: string, method: string, args: unknown) => Promise<unknown>;
  /** Starts every capability's events; `emit` sends them to the other side. */
  readonly start: (emit: (capability: string, event: string, data: unknown) => void) => () => void;
}

export const createRegistry = (capabilities: readonly Capability[]): Registry => {
  const byName = new Map<string, Capability>();
  for (const c of capabilities) {
    if (byName.has(c.name)) throw new Error(`Capability ${c.name} is registered twice`);
    byName.set(c.name, c);
  }
  return {
    describe: () =>
      [...byName.values()].map((c) => ({ name: c.name, version: c.version, methods: Object.keys(c.methods), events: c.events ?? [] })),
    invoke: async (capability, name, args) => {
      const c = byName.get(capability);
      if (!c) throw new PlayError({ code: "not-granted", message: `No capability ${capability}` });
      const m = Object.hasOwn(c.methods, name) ? c.methods[name] : undefined;
      if (!m) throw new PlayError({ code: "no-method", message: `${capability} has no method ${name}` });
      return m.invoke(args);
    },
    start: (emit) => {
      const stops = [...byName.values()].flatMap((c) => {
        if (!c.start) return [];
        const allowed = new Set(c.events ?? []);
        return [c.start((event, data) => (allowed.has(event) ? emit(c.name, event, data) : undefined))];
      });
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
};
