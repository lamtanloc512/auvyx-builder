// Anchored-overlay state shared by Floating, Select and Tooltip (port of Floating.scala's Anchor and helpers).
import type { Attachment } from "svelte/attachments";
import type { ClassValue } from "svelte/elements";

export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";

export interface Placement {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  collisionPadding?: number;
  matchTriggerWidth?: boolean;
}

/** Joins class parts in order, skipping empty ones (Laminar's `cls` modifiers append). Accepts Svelte's ClassValue. */
export function cx(...parts: (ClassValue | false | null | undefined)[]): string {
  const out: string[] = [];
  const add = (v: unknown): void => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === "object") for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  };
  parts.forEach(add);
  return out.join(" ");
}

/** Open state and element handles for one trigger/panel pair. */
export class FloatingAnchor {
  isOpen = $state(false);
  trigger: HTMLElement | null = null;
  content: HTMLElement | null = null;
  /** Set for context menus, which anchor to the pointer rather than to an element. */
  point: { x: number; y: number } | null = null;
  private nested: FloatingAnchor[] = [];

  registerNested(child: FloatingAnchor): void {
    this.nested.push(child);
  }

  get panels(): HTMLElement[] {
    return [...(this.content ? [this.content] : []), ...this.nested.flatMap((n) => n.panels)];
  }

  get hasOpenNested(): boolean {
    return this.nested.some((n) => n.isOpen || n.hasOpenNested);
  }

  open(): void {
    this.point = null;
    this.isOpen = true;
  }

  close(): void {
    this.nested.forEach((n) => n.close());
    this.isOpen = false;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  openAt(x: number, y: number): void {
    this.point = { x, y };
    this.isOpen = true;
  }

  focusTrigger(): void {
    this.trigger?.focus();
  }
}

/** The ARIA and `data-state` contract every trigger carries; spread it on the trigger element. */
export function triggerAttrs(a: FloatingAnchor): { "data-state": string; "aria-expanded": "true" | "false" } {
  return { "data-state": a.isOpen ? "open" : "closed", "aria-expanded": a.isOpen ? "true" : "false" };
}

/** Captures the trigger element. */
export function triggerRef(a: FloatingAnchor): Attachment<HTMLElement> {
  return (el) => {
    a.trigger = el;
  };
}

class Timer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  cancel(): void {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
  schedule(delay: number, action: () => void): void {
    this.cancel();
    if (delay <= 0) action();
    else this.handle = setTimeout(action, delay);
  }
}

/** Hover-triggered opening with delays; focus/blur open and close at once. */
export function hoverToOpen(a: FloatingAnchor, openDelay: number, closeDelay: number): Attachment<HTMLElement> {
  return (el) => {
    const timer = new Timer();
    const enter = () => timer.schedule(openDelay, () => a.open());
    const leave = () => timer.schedule(closeDelay, () => a.close());
    const focus = () => a.open();
    const blur = () => a.close();
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focus", focus);
    el.addEventListener("blur", blur);
    return () => {
      timer.cancel();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focus", focus);
      el.removeEventListener("blur", blur);
    };
  };
}

/** Keeps a hover-triggered panel open while the pointer is inside it. */
export function hoverKeepOpen(a: FloatingAnchor, closeDelay: number): Attachment<HTMLElement> {
  return (el) => {
    const timer = new Timer();
    const enter = () => timer.cancel();
    const leave = () => timer.schedule(closeDelay, () => a.close());
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      timer.cancel();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  };
}

/** The area the trigger's `overflow` ancestors leave visible, in viewport coordinates. */
function visibleBounds(trigger: HTMLElement): { top: number; left: number; right: number; bottom: number } {
  let top = 0;
  let left = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  let node = trigger.parentElement;
  while (node && node !== document.body) {
    // A modal <dialog> paints in the top layer: nothing above it clips the panel.
    if (node.tagName.toLowerCase() === "dialog") break;
    const style = getComputedStyle(node);
    if (style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible") {
      const r = node.getBoundingClientRect();
      top = Math.max(top, r.top);
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    }
    node = node.parentElement;
  }
  return { top, left, right, bottom };
}

const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Positions the panel against its trigger (or point), flipping and clamping like Floating.scala's `place`. */
export function place(a: FloatingAnchor, placement: Placement): void {
  const panel = a.content;
  if (!panel) return;
  const side0: Side = placement.side ?? "bottom";
  const align: Align = placement.align ?? "center";
  const gap = placement.sideOffset ?? 4;
  const pad = placement.collisionPadding ?? 8;

  let rect: { left: number; top: number; width: number; height: number };
  if (a.point) rect = { left: a.point.x, top: a.point.y, width: 0, height: 0 };
  else if (a.trigger) {
    const r = a.trigger.getBoundingClientRect();
    rect = { left: r.left, top: r.top, width: r.width, height: r.height };
  } else return;
  const rRight = rect.left + rect.width;
  const rBottom = rect.top + rect.height;

  let clipped = false;
  if (!a.point && a.trigger) {
    const c = visibleBounds(a.trigger);
    clipped = rBottom <= c.top || rect.top >= c.bottom || rRight <= c.left || rect.left >= c.right;
  }

  panel.style.position = "fixed";
  panel.style.visibility = clipped ? "hidden" : "visible";
  panel.style.pointerEvents = clipped ? "none" : "auto";
  if (clipped) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (placement.matchTriggerWidth) panel.style.minWidth = `${rect.width}px`;
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;

  const room: Record<Side, number> = {
    top: rect.top - gap - pad,
    bottom: vh - pad - (rBottom + gap),
    left: rect.left - gap - pad,
    right: vw - pad - (rRight + gap)
  };
  const needed = side0 === "top" || side0 === "bottom" ? ph : pw;
  const flipped = opposite[side0];
  const side = room[side0] >= needed || room[side0] >= room[flipped] ? side0 : flipped;

  const cross = (start: number, size: number, panelSize: number) =>
    align === "start" ? start : align === "center" ? start + (size - panelSize) / 2 : start + size - panelSize;

  let rawLeft: number;
  let rawTop: number;
  if (side === "bottom") [rawLeft, rawTop] = [cross(rect.left, rect.width, pw), rBottom + gap];
  else if (side === "top") [rawLeft, rawTop] = [cross(rect.left, rect.width, pw), rect.top - gap - ph];
  else if (side === "right") [rawLeft, rawTop] = [rRight + gap, cross(rect.top, rect.height, ph)];
  else [rawLeft, rawTop] = [rect.left - gap - pw, cross(rect.top, rect.height, ph)];

  const left = Math.max(pad, Math.min(rawLeft, vw - pad - pw));
  const top = Math.max(pad, Math.min(rawTop, vh - pad - ph));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.setAttribute("data-side", side);
  panel.setAttribute("data-align", align);
}

/**
 * Where a panel is rendered: `document.body`, except inside a shadow root or a `<dialog>`, where it goes into a
 * `display: contents` host there. Returns the target and the host to remove afterwards.
 */
export function portalTarget(node: Element): { target: Element; host: Element | null } {
  const root = node.getRootNode();
  const newHost = (parent: Node) => {
    const host = (parent.ownerDocument ?? document).createElement("div");
    host.setAttribute("data-slot", "floating-portal");
    host.setAttribute("style", "display: contents");
    parent.appendChild(host);
    return { target: host, host };
  };
  if (root instanceof ShadowRoot) return newHost(root);
  const dialog = node.closest("dialog");
  if (dialog) return newHost(dialog);
  return { target: node.ownerDocument.body, host: null };
}
