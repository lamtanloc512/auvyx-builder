/**
 * The isolation every host applies, from shared/play.json: the frame's sandbox and allow attributes, and the document's
 * CSP. `{site-origin}` and `{runtime-origin}` are filled by the host (WordPress, EzyPlatform, the Studio).
 */
import play from "@auvyx/shared/play.json";

export const SANDBOX: string = play.sandbox.join(" ");
export const ALLOW: string = play.permissions.join("; ");
export const HEADERS: Readonly<Record<string, string>> = play.headers;

export const contentSecurityPolicy = ({ siteOrigin, runtimeOrigin }: { readonly siteOrigin: string; readonly runtimeOrigin: string }): string => {
  const fill = (source: string) => source.replaceAll("{site-origin}", siteOrigin).replaceAll("{runtime-origin}", runtimeOrigin);
  const directives = Object.entries(play.csp).map(([name, sources]) => `${name} ${sources.map(fill).join(" ")}`);
  return [`sandbox ${play.sandbox.join(" ")}`, ...directives].join("; ");
};
