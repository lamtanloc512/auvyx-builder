/**
 * "Ask for changes" on the canvas (U/AskPopover.scala): the ✦ button of the selection label opens a prompt box with
 * suggestions for that kind of element. Small on purpose (the overlay loads it with the editor): a request opens the AI
 * column and waits there for the agent panel, which is loaded on first use.
 */
import type { Kind } from "@auvyx/editor-core";
import { config } from "./config";
import { store } from "./store.svelte";

const agentConfig = (config as unknown as { agent?: { configured?: boolean } }).agent;

/** The platform's agent runs the request in the AI panel. */
export const agentReady = !!agentConfig?.configured;

export const askPopover = $state({ open: false, draft: "", status: null as string | null });

/** A request waiting for the agent panel to load (AiColumn takes it). */
export const pendingAsk = $state({ text: null as string | null });

export const toggleAsk = () => { askPopover.open = !askPopover.open; };

export function askSuggestions(kind: Kind | undefined): string[] {
  switch (kind) {
    case "Heading": case "Text": return ["Make it shorter and punchier", "Make it more persuasive", "Translate to Vietnamese"];
    case "Button": return ["Make it stand out", "Use a stronger call to action", "Make it a pill with an arrow →"];
    case "Image": return ["Round the corners and add a soft shadow", "Make it a 16:9 cover", "Make it a circle avatar"];
    case "Section": return ["Make it more spacious and elegant", "Turn it into a 3-column layout", "Give it a bold dark background"];
    default: return ["Polish the style", "Make it responsive on mobile"];
  }
}

export function submitAsk(text: string) {
  if (!text.trim() || !agentReady) return;
  store.aiOpen = true;
  pendingAsk.text = `${text}\n\n(Change only the selected element and what it holds; keep everything else as it is.)`;
  askPopover.open = false;
  askPopover.draft = "";
}
