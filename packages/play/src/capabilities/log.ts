/** What the game prints and the errors it throws, for whoever hosts it (the Studio shows them to the agent). */
import { literal, object, string } from "../args";
import { type Capability, method } from "../capability";
import type { Remote } from "../session";

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogSink {
  readonly write: (entry: { readonly level: LogLevel; readonly text: string }) => void;
}

export const logCapability = ({ sink }: { readonly sink: LogSink }): Capability => ({
  name: "log",
  version: 1,
  methods: {
    write: method(object({ level: literal("log", "info", "warn", "error"), text: string({ max: 4000 }) }), (entry) => {
      sink.write(entry);
      return null;
    }),
  },
});

export interface LogApi {
  readonly write: (level: LogLevel, text: string) => void;
}

/** Fire and forget: a failed log line is not worth an error of its own. */
export const logApi = (remote: Remote): LogApi => ({
  write: (level, text) => {
    remote.call("log", "write", { level, text: text.slice(0, 4000) }).catch(() => {});
  },
});
