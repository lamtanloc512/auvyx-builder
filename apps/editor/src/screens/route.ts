/**
 * Which screen the editor's address asks for (U/Main.scala start): the Site templates screen (`view=sites`, about the
 * whole site, opened on any page), the Theme Builder's "Add New Header / Footer" (`view=new-part&type=header|footer`), the
 * standalone appearance screen (`screen=customize`, only without a site, as in Auvyx Studio), else the page editor.
 */
import { connected } from "../lib/host";

export type Screen = "editor" | "sites" | "new-part" | "customize";

export function screenOf(search: string = location.search): Screen {
  const p = new URLSearchParams(search);
  if (p.get("screen") === "customize" && !connected) return "customize";
  if (p.get("view") === "sites" && connected) return "sites";
  if (p.get("view") === "new-part" && connected) return "new-part";
  return "editor";
}

export const screen: Screen = screenOf();
