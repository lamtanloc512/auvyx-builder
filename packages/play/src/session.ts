/**
 * The two ends of a connection: the host (the page around the frame) and the client (the game). Both serve a Registry
 * and call what the other side granted in the handshake, nothing else.
 */
import type { Channel } from "./channel";
import type { Registry } from "./capability";
import { createPeer } from "./peer";
import { type CapabilityDescriptor, type GameInfo, LIMITS, PlayError } from "./protocol";

/** One side's view of the other: what it granted, and how to use it. */
export interface Remote {
  readonly granted: readonly CapabilityDescriptor[];
  readonly has: (capability: string, version?: number) => boolean;
  readonly call: (capability: string, method: string, args?: unknown) => Promise<unknown>;
  readonly on: (capability: string, event: string, listener: (data: unknown) => void) => () => void;
}

const remote = (peer: ReturnType<typeof createPeer>, granted: readonly CapabilityDescriptor[]): Remote => {
  const find = (name: string) => granted.find((d) => d.name === name);
  return {
    granted,
    has: (name, version) => {
      const d = find(name);
      return d !== undefined && (version === undefined || d.version >= version);
    },
    call: (capability, method, args) => {
      const d = find(capability);
      if (!d) return Promise.reject(new PlayError({ code: "not-granted", message: `The page did not grant ${capability}` }));
      if (!d.methods.includes(method)) return Promise.reject(new PlayError({ code: "no-method", message: `${capability} has no method ${method}` }));
      return peer.call(capability, method, args);
    },
    on: (capability, event, listener) => peer.on(capability, event, listener),
  };
};

export interface HostConnection {
  /** The game, once it has said hello (again after it reloads). */
  readonly ready: Promise<Remote>;
  readonly dispose: () => void;
}

/** The page's end: answers every hello with the game and the page's capabilities, and starts their events. */
export const mountHost = ({
  channel,
  registry,
  game,
  timeoutMs = LIMITS.callTimeoutMs,
}: {
  readonly channel: Channel;
  readonly registry: Registry;
  readonly game: GameInfo;
  readonly timeoutMs?: number;
}): HostConnection => {
  const peer = createPeer({ channel, registry, timeoutMs });
  let stopEvents: (() => void) | undefined;
  let resolveReady: (r: Remote) => void = () => {};
  const ready = new Promise<Remote>((resolve) => {
    resolveReady = resolve;
  });
  const stopControl = peer.onControl((message) => {
    if (message.kind !== "hello") return;
    channel.send({ kind: "welcome", game, capabilities: registry.describe() });
    stopEvents?.();
    stopEvents = registry.start((capability, event, data) => peer.emit(capability, event, data));
    resolveReady(remote(peer, message.capabilities));
  });
  return {
    ready,
    dispose: () => {
      stopControl();
      stopEvents?.();
      peer.dispose();
    },
  };
};

export interface ClientSession extends Remote {
  readonly game: GameInfo;
  readonly dispose: () => void;
}

/** The game's end: says hello until the page welcomes it (the page may still be setting up), then serves its registry. */
export const connect = ({
  channel,
  registry,
  sdk,
  timeoutMs = LIMITS.callTimeoutMs,
  helloEveryMs = 100,
}: {
  readonly channel: Channel;
  readonly registry: Registry;
  readonly sdk: string;
  readonly timeoutMs?: number;
  readonly helloEveryMs?: number;
}): Promise<ClientSession> =>
  new Promise((resolve, reject) => {
    const peer = createPeer({ channel, registry, timeoutMs });
    let stopEvents: (() => void) | undefined;
    const hello = () => channel.send({ kind: "hello", sdk, capabilities: registry.describe() });
    const again = setInterval(hello, helloEveryMs);
    const giveUp = setTimeout(() => {
      finish();
      peer.dispose();
      reject(new PlayError({ code: "no-host", message: `No page answered in ${timeoutMs} ms` }));
    }, timeoutMs);
    const finish = () => {
      clearInterval(again);
      clearTimeout(giveUp);
      stopControl();
    };
    const stopControl = peer.onControl((message) => {
      if (message.kind !== "welcome") return;
      finish();
      stopEvents = registry.start((capability, event, data) => peer.emit(capability, event, data));
      resolve({
        ...remote(peer, message.capabilities),
        game: message.game,
        dispose: () => {
          stopEvents?.();
          peer.dispose();
        },
      });
    });
    hello();
  });
