/**
 * The messages between a game (in its sandboxed frame) and the page that hosts it. Everything arriving from the other
 * side is `unknown` until `parseMessage` says what it is; nothing else in the SDK looks at raw messages.
 */
import play from "@auvyx/shared/play.json";

export const PROTOCOL: string = play.protocol;
export const LIMITS = play.limits;

/** What one side offers: a capability's name, version, method names and the events it may send. */
export interface CapabilityDescriptor {
  readonly name: string;
  readonly version: number;
  readonly methods: readonly string[];
  readonly events: readonly string[];
}

/** What a game is, as the page tells it in the handshake. */
export interface GameInfo {
  readonly id: string;
  readonly title: string;
  /** "site" on a published page, "studio" while it is being made (the Studio may play-test it). */
  readonly mode: "site" | "studio";
}

export interface ErrorInfo {
  readonly code: string;
  readonly message: string;
}

export type Message =
  | { readonly kind: "hello"; readonly sdk: string; readonly capabilities: readonly CapabilityDescriptor[] }
  | { readonly kind: "welcome"; readonly game: GameInfo; readonly capabilities: readonly CapabilityDescriptor[] }
  | { readonly kind: "call"; readonly id: number; readonly capability: string; readonly method: string; readonly args: unknown }
  | { readonly kind: "result"; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly kind: "result"; readonly id: number; readonly ok: false; readonly error: ErrorInfo }
  | { readonly kind: "event"; readonly capability: string; readonly event: string; readonly data: unknown };

/** On the wire every message carries the protocol, so other postMessage traffic on the page is ignored. */
export type Envelope = Message & { readonly protocol: string };

export const envelope = (message: Message): Envelope => ({ ...message, protocol: PROTOCOL });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const isName = (v: unknown): v is string => isString(v) && NAME.test(v);

const descriptor = (v: unknown): CapabilityDescriptor | undefined =>
  isRecord(v) && isName(v["name"]) && typeof v["version"] === "number" && isStrings(v["methods"]) && isStrings(v["events"])
    ? { name: v["name"], version: v["version"], methods: v["methods"], events: v["events"] }
    : undefined;

const descriptors = (v: unknown): CapabilityDescriptor[] | undefined => {
  if (!Array.isArray(v) || v.length > 64) return undefined;
  const out = v.map(descriptor);
  return out.every((d): d is CapabilityDescriptor => d !== undefined) ? out : undefined;
};

const gameInfo = (v: unknown): GameInfo | undefined =>
  isRecord(v) && isString(v["id"]) && isString(v["title"]) && (v["mode"] === "site" || v["mode"] === "studio")
    ? { id: v["id"], title: v["title"], mode: v["mode"] }
    : undefined;

const errorInfo = (v: unknown): ErrorInfo | undefined =>
  isRecord(v) && isString(v["code"]) && isString(v["message"]) ? { code: v["code"], message: v["message"] } : undefined;

/** The message in `data`, or undefined when it is not one of ours (wrong protocol, wrong shape). */
export const parseMessage = (data: unknown): Message | undefined => {
  if (!isRecord(data) || data["protocol"] !== PROTOCOL) return undefined;
  switch (data["kind"]) {
    case "hello": {
      const capabilities = descriptors(data["capabilities"]);
      return isString(data["sdk"]) && capabilities ? { kind: "hello", sdk: data["sdk"], capabilities } : undefined;
    }
    case "welcome": {
      const game = gameInfo(data["game"]);
      const capabilities = descriptors(data["capabilities"]);
      return game && capabilities ? { kind: "welcome", game, capabilities } : undefined;
    }
    case "call":
      return isId(data["id"]) && isName(data["capability"]) && isString(data["method"])
        ? { kind: "call", id: data["id"], capability: data["capability"], method: data["method"], args: data["args"] }
        : undefined;
    case "result": {
      if (!isId(data["id"])) return undefined;
      if (data["ok"] === true) return { kind: "result", id: data["id"], ok: true, value: data["value"] };
      const error = errorInfo(data["error"]);
      return data["ok"] === false && error ? { kind: "result", id: data["id"], ok: false, error } : undefined;
    }
    case "event":
      return isName(data["capability"]) && isString(data["event"])
        ? { kind: "event", capability: data["capability"], event: data["event"], data: data["data"] }
        : undefined;
    default:
      return undefined;
  }
};

/** An error that crosses to the other side with a code the caller can act on. */
export class PlayError extends Error {
  readonly code: string;
  constructor({ code, message }: ErrorInfo) {
    super(message);
    this.name = "PlayError";
    this.code = code;
  }
  toInfo(): ErrorInfo {
    return { code: this.code, message: this.message };
  }
}

export const toErrorInfo = (e: unknown): ErrorInfo =>
  e instanceof PlayError ? e.toInfo() : { code: "failed", message: e instanceof Error ? e.message : String(e) };
