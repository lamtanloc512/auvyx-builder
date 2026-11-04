/**
 * Symmetric RPC over a Channel: either side calls the other's capabilities (with ids and a timeout), serves its own
 * from a Registry, and receives events. The handshake (hello/welcome) is the host's and the client's business.
 */
import type { Channel } from "./channel";
import type { Registry } from "./capability";
import { type Message, PlayError, toErrorInfo } from "./protocol";

export interface Peer {
  readonly call: (capability: string, method: string, args?: unknown) => Promise<unknown>;
  readonly on: (capability: string, event: string, listener: (data: unknown) => void) => () => void;
  readonly emit: (capability: string, event: string, data: unknown) => void;
  /** Handshake messages, for the host or the client on top. */
  readonly onControl: (listener: (message: Extract<Message, { kind: "hello" | "welcome" }>) => void) => () => void;
  readonly dispose: () => void;
}

export interface PeerOptions {
  readonly channel: Channel;
  readonly registry: Registry;
  readonly timeoutMs: number;
  readonly timers?: { readonly set: (fn: () => void, ms: number) => unknown; readonly clear: (handle: unknown) => void };
}

const defaultTimers = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const createPeer = ({ channel, registry, timeoutMs, timers = defaultTimers }: PeerOptions): Peer => {
  let next = 0;
  let disposed = false;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: unknown }>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const control = new Set<(m: Extract<Message, { kind: "hello" | "welcome" }>) => void>();

  const serve = (id: number, capability: string, name: string, args: unknown) => {
    registry.invoke(capability, name, args).then(
      (value) => channel.send({ kind: "result", id, ok: true, value }),
      (e: unknown) => channel.send({ kind: "result", id, ok: false, error: toErrorInfo(e) })
    );
  };

  const stop = channel.listen((message) => {
    if (disposed) return;
    switch (message.kind) {
      case "call":
        serve(message.id, message.capability, message.method, message.args);
        return;
      case "result": {
        const p = pending.get(message.id);
        if (!p) return;
        pending.delete(message.id);
        timers.clear(p.timer);
        if (message.ok) p.resolve(message.value);
        else p.reject(new PlayError(message.error));
        return;
      }
      case "event":
        for (const l of listeners.get(`${message.capability}/${message.event}`) ?? []) l(message.data);
        return;
      case "hello":
      case "welcome":
        for (const l of control) l(message);
        return;
      default: {
        const _exhaustive: never = message;
        return _exhaustive;
      }
    }
  });

  return {
    call: (capability, name, args) =>
      new Promise((resolve, reject) => {
        if (disposed) return reject(new PlayError({ code: "closed", message: "The connection is closed" }));
        const id = next++;
        const timer = timers.set(() => {
          pending.delete(id);
          reject(new PlayError({ code: "timeout", message: `${capability}.${name} did not answer in ${timeoutMs} ms` }));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        channel.send({ kind: "call", id, capability, method: name, args });
      }),
    on: (capability, event, listener) => {
      const key = `${capability}/${event}`;
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    emit: (capability, event, data) => {
      if (!disposed) channel.send({ kind: "event", capability, event, data });
    },
    onControl: (listener) => {
      control.add(listener);
      return () => control.delete(listener);
    },
    dispose: () => {
      disposed = true;
      stop();
      for (const [, p] of pending) {
        timers.clear(p.timer);
        p.reject(new PlayError({ code: "closed", message: "The connection is closed" }));
      }
      pending.clear();
      listeners.clear();
      control.clear();
    },
  };
};
