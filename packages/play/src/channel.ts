/**
 * How messages travel. The peer only knows this interface; a frame, the parent window and an in-memory pair (tests,
 * the Studio's own frames) are interchangeable.
 */
import { type Envelope, type Message, envelope, parseMessage } from "./protocol";

export interface Channel {
  send(message: Message): void;
  /** Calls `receive` with every valid message from the other side; returns how to stop. */
  listen(receive: (message: Message) => void): () => void;
}

/** What a window-based channel needs of `window` (narrow, so it runs in tests and workers alike). */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}
export interface MessageSource {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/**
 * A channel to one window, accepting messages only from that window. The sandboxed side has an opaque origin
 * ("null"), so the origin cannot identify it: `event.source` does. Messages are posted with "*" for the same reason;
 * they carry nothing the game may not see.
 */
export const windowChannel = ({ self, other }: { readonly self: MessageSource; readonly other: () => MessageTarget | null }): Channel => ({
  send: (message) => other()?.postMessage(envelope(message), "*"),
  listen: (receive) => {
    const onMessage = (event: MessageEvent) => {
      const from = other();
      if (from === null || event.source !== from) return;
      const message = parseMessage(event.data);
      if (message) receive(message);
    };
    self.addEventListener("message", onMessage);
    return () => self.removeEventListener("message", onMessage);
  },
});

/** The page's side: the frame a game runs in. */
export const frameChannel = (frame: HTMLIFrameElement, page: MessageSource = window): Channel =>
  windowChannel({ self: page, other: () => frame.contentWindow });

/**
 * The game's side: the page around its frame. It answers its parent, and hears its parent or the top window: in the
 * Studio the game's frame sits in the canvas frame while the code that talks to it runs in the Studio's window, so the
 * messages come from there. Any other window (another frame on the page) is not heard.
 */
export const parentChannel = (game: Window = window): Channel => {
  const parent = () => (game.parent === game ? null : game.parent);
  return {
    send: (message) => parent()?.postMessage(envelope(message), "*"),
    listen: (receive) => {
      const onMessage = (event: MessageEvent) => {
        if (parent() === null || (event.source !== game.parent && event.source !== game.top)) return;
        const message = parseMessage(event.data);
        if (message) receive(message);
      };
      game.addEventListener("message", onMessage);
      return () => game.removeEventListener("message", onMessage);
    },
  };
};

/** Two connected channels in memory, delivering asynchronously like postMessage (and through the same parser). */
export const memoryPair = (): readonly [Channel, Channel] => {
  const listeners: [Set<(m: Message) => void>, Set<(m: Message) => void>] = [new Set(), new Set()];
  const side = (mine: 0 | 1): Channel => ({
    send: (message) => {
      const wire: Envelope = structuredClone(envelope(message));
      queueMicrotask(() => {
        const parsed = parseMessage(wire);
        if (parsed) for (const l of listeners[mine === 0 ? 1 : 0]) l(parsed);
      });
    },
    listen: (receive) => {
      listeners[mine].add(receive);
      return () => listeners[mine].delete(receive);
    },
  });
  return [side(0), side(1)];
};
