// Dialog class recipes (verbatim from Dialog.scala) and the context DialogClose uses.
import { getContext, setContext } from "svelte";

/** Holds the exit frame so the panel does not snap back to full opacity before close(). */
export const dialogExitFillClass = "data-closed:fill-mode-forwards";

/** Fades the backdrop on `data-closed`, on the panel's clock. */
export function dialogRootExitClass(exitMs: number): string {
  const maskDuration = exitMs > 150 ? "backdrop:duration-200" : "backdrop:duration-100";
  return `backdrop:transition-opacity ${maskDuration} data-closed:transition-none! data-closed:backdrop:opacity-0!`;
}

/** Position, surface and animation of the content panel (everything but the box model). */
export const dialogContentShellClass = `cn-dialog-content fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-sm text-popover-foreground outline-none ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 ${dialogExitFillClass}`;

/** Upstream's default box model for the content panel. Its layout lives here, not in the shell: a box class that
 *  says `flex flex-col` (Menus, Page templates) then really is a column, not a grid of stretched rows. */
export const dialogContentBoxClass = "grid grid-cols-[minmax(0,1fr)] gap-6 p-6 sm:max-w-md";

const key = Symbol("auvyx-dialog");

export interface DialogContext {
  close(): void;
}

export function setDialogContext(ctx: DialogContext): void {
  setContext(key, ctx);
}

export function getDialogContext(): DialogContext | undefined {
  return getContext<DialogContext | undefined>(key);
}
