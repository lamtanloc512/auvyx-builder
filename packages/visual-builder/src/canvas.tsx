/**
 * The canvas: the real frontend page in an iframe (theme header/footer, global
 * styles), with the post content replaced by the edited tree. Markup is
 * re-rendered only on structural/content changes; style edits just swap
 * classes and one <style> element.
 */
import { getBlockType } from "@wordpress/blocks";
import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { STATE_LABELS, getDesignSystem, useEditorUi } from "@auvyx/block-kit";
import { attachCss, CanvasOverlay, ElementOutline } from "@auvyx/canvas-tools";
import { compileBlockStyles, sortBreakpoints } from "@auvyx/style-engine";
import { annotate } from "./annotate";
import { INSTANCE_BLOCK, toCanvasTree } from "./canvas-tree";
import { blockLabel } from "./labels";
import { parseContent, serializeBlocks, useBuilder } from "./store";
import { flatten, getBlock, type BuilderBlock } from "./tree";

/** Device preview widths for the first three (desktop-first) breakpoints. */
const DEVICE_WIDTHS = ["100%", "768px", "390px"];

/** Block → attribute edited inline (double-click). */
const RICH_TEXT: Record<string, string> = {
  "auvyx/heading": "content",
  "auvyx/text": "content",
  "auvyx/button": "text",
  "core/paragraph": "content",
  "core/heading": "content",
};
const SINGLE_LINE = new Set(["auvyx/heading", "auvyx/button", "core/heading"]);

const CANVAS_CSS = `
.auvyx-instance{display:contents}
[data-auvyx-id]{cursor:default}
.wp-block-auvyx-section:empty{min-height:96px;outline:1px dashed #b4b9c2;outline-offset:-1px}
[data-auvyx-id][contenteditable="true"]{outline:2px solid #3858e9;outline-offset:2px;cursor:text}
a[data-auvyx-id],a [data-auvyx-id]{cursor:default}
`;

const AUVYX_CLASS = /^auvyx-[a-z0-9]+$/;

const resolveSelectable = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null;
  // Component instances are selected as a whole: take the outermost instance.
  let instance = target.closest<HTMLElement>("[data-auvyx-component]");
  while (instance?.parentElement?.closest("[data-auvyx-component]")) {
    instance = instance.parentElement.closest<HTMLElement>("[data-auvyx-component]");
  }
  return instance ?? target.closest<HTMLElement>("[data-auvyx-id]");
};

export function Canvas() {
  const { state, blocks, actions, config } = useBuilder();
  const { styleState } = useEditorUi();
  const iframe = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [elements, setElements] = useState<Map<string, HTMLElement>>(() => new Map());
  const [error, setError] = useState<string>();
  const parseCache = useRef(new Map<string, BuilderBlock[]>());

  const components = state.components;
  const canvasTree = useMemo(
    () =>
      toCanvasTree(
        blocks,
        (ref) => components.find((c) => c.id === ref)?.content,
        (content) => {
          let parsed = parseCache.current.get(content);
          if (!parsed) {
            parsed = parseContent(content);
            parseCache.current.set(content, parsed);
          }
          return parsed;
        }
      ),
    [blocks, components]
  );
  const latestTree = useRef(canvasTree);
  latestTree.current = canvasTree;
  const latestActions = useRef(actions);
  latestActions.current = actions;
  const latestState = useRef(state);
  latestState.current = state;

  // 1. Find the content root in the loaded page and wire events.
  const onLoad = () => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    const walker = doc.createTreeWalker(doc.body, 128);
    let marker: Comment | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node as Comment).data.trim() === "auvyx-canvas-root") {
        marker = node as Comment;
        break;
      }
    }
    if (!marker?.parentElement) {
      setError(__("This page template does not display the post content, so it cannot be edited here.", "auvyx-builder"));
      return;
    }
    const contentRoot = marker.parentElement;
    marker.remove();
    attachCss(doc, "auvyx-canvas", CANVAS_CSS);

    // Never navigate away from the canvas.
    doc.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest?.("a")) event.preventDefault();
    }, true);
    doc.addEventListener("submit", (event) => event.preventDefault(), true);

    contentRoot.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).isContentEditable) return;
      const element = resolveSelectable(event.target);
      latestActions.current.select(element?.dataset.auvyxId);
    });
    contentRoot.addEventListener("mouseover", (event) => {
      latestActions.current.hover(resolveSelectable(event.target)?.dataset.auvyxId);
    });
    contentRoot.addEventListener("mouseleave", () => latestActions.current.hover(undefined));
    contentRoot.addEventListener("dblclick", (event) => startTextEditing(event.target));
    doc.addEventListener("keydown", (event) => handleShortcut(event, latestActions.current, latestState.current));
    setRoot(contentRoot);
  };

  const startTextEditing = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-auvyx-id]") : null;
    const id = element?.dataset.auvyxId;
    if (!element || !id || element.closest("[data-auvyx-component]")) return;
    const block = getBlock(latestTree.current, id);
    const attribute = block ? RICH_TEXT[block.name] : undefined;
    if (!block || !attribute) return;
    latestActions.current.select(id);
    element.contentEditable = "true";
    element.focus();
    const finish = () => {
      element.removeEventListener("blur", finish);
      element.removeEventListener("keydown", onKey);
      element.removeAttribute("contenteditable");
      if (element.innerHTML !== String(block.attributes[attribute] ?? "")) {
        latestActions.current.updateAttributes(id, { [attribute]: element.innerHTML });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey && SINGLE_LINE.has(block.name))) {
        event.preventDefault();
        element.blur();
      }
    };
    element.addEventListener("blur", finish);
    element.addEventListener("keydown", onKey);
  };

  // 2. Render markup (structure/content changes only).
  useEffect(() => {
    if (!root) return;
    root.innerHTML = serializeBlocks(latestTree.current);
    setElements(annotate(root, latestTree.current));
  }, [root, state.renderVersion]);

  // 3. Styles: per-block classes + one stylesheet, simulated for the active breakpoint.
  const breakpoints = getDesignSystem().breakpoints;
  useEffect(() => {
    const doc = root?.ownerDocument;
    if (!doc) return;
    let css = "";
    for (const { block } of flatten(canvasTree)) {
      const element = elements.get(block.clientId);
      if (!element) continue;
      const forceState = block.clientId === state.selectedId && styleState !== "default" ? styleState : undefined;
      const compiled = compileBlockStyles((block.attributes.auvyx as { styles?: unknown } | undefined)?.styles, breakpoints, {
        simulateBreakpoint: state.breakpoint,
        forceState,
      });
      for (const name of Array.from(element.classList)) { // copy: we remove while iterating
        if (AUVYX_CLASS.test(name) && name !== compiled?.className) element.classList.remove(name);
      }
      if (compiled) {
        element.classList.add(compiled.className);
        css += compiled.css;
      }
    }
    let style = doc.getElementById("auvyx-canvas-styles");
    if (!style) {
      style = doc.createElement("style");
      style.id = "auvyx-canvas-styles";
      doc.head.appendChild(style);
    }
    style.textContent = css;
  }, [root, elements, canvasTree, state.breakpoint, state.selectedId, styleState, breakpoints]);

  // Bring the selection into view (selecting from Layers, deep links, inserts).
  useEffect(() => {
    const element = state.selectedId ? elements.get(state.selectedId) : undefined;
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return;
    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > view.innerHeight) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [state.selectedId, elements]);

  // Keyboard shortcuts in the builder window too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleShortcut(event, latestActions.current, latestState.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panelBreakpoints = sortBreakpoints(breakpoints).slice(0, DEVICE_WIDTHS.length);
  const deviceIndex = Math.max(0, panelBreakpoints.findIndex((bp) => bp.id === state.breakpoint));
  const selected = state.selectedId ? getBlock(blocks, state.selectedId) : undefined;
  const selectedElement = state.selectedId ? elements.get(state.selectedId) : undefined;
  const hovered = state.hoveredId && state.hoveredId !== state.selectedId ? getBlock(blocks, state.hoveredId) : undefined;
  const hoveredElement = hovered ? elements.get(hovered.clientId) : undefined;
  const isInstance = (block?: BuilderBlock) => block?.name === "core/block";
  const supportsYb = (block?: BuilderBlock) => Boolean(block && getBlockType(block.name)?.attributes?.auvyx);
  const label = (block: BuilderBlock) => blockLabel(block, components);
  const stateSuffix = styleState === "default" ? "" : ` · ${STATE_LABELS[styleState]}`;

  return (
    <div className="auvyx-vb-canvas">
      {error && <div className="auvyx-vb-canvas__error">{error}</div>}
      {!config.canvasUrl && (
        <div className="auvyx-vb-canvas__error">{__("Create and publish at least one page to edit components.", "auvyx-builder")}</div>
      )}
      <div className="auvyx-vb-canvas__frame" style={{ width: DEVICE_WIDTHS[deviceIndex] }}>
        {config.canvasUrl && <iframe ref={iframe} title={__("Canvas", "auvyx-builder")} src={config.canvasUrl} onLoad={onLoad} />}
      </div>
      {hovered && hoveredElement && (
        <ElementOutline element={hoveredElement} label={label(hovered)} variant={isInstance(hovered) ? "component" : "hover"} />
      )}
      {selected && selectedElement && (
        <ElementOutline
          element={selectedElement}
          label={`${label(selected)}${supportsYb(selected) ? stateSuffix : ""}`}
          variant={isInstance(selected) ? "component" : "selected"}
        />
      )}
      {selected && selectedElement && supportsYb(selected) && selected.name !== INSTANCE_BLOCK && (
        <CanvasOverlay
          element={selectedElement}
          label=""
          spacingTokens={getDesignSystem().tokens.spacing}
          onChange={(patch) => latestActions.current.updateStyles(selected.clientId, patch)}
        />
      )}
    </div>
  );
}

const isTyping = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  return Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
};

type Actions = ReturnType<typeof useBuilder>["actions"];
type BuilderState = ReturnType<typeof useBuilder>["state"];

function handleShortcut(event: KeyboardEvent, actions: Actions, state: BuilderState) {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === "s") {
    event.preventDefault();
    void actions.save();
    return;
  }
  if (isTyping(event)) return;
  if (mod && key === "z") {
    event.preventDefault();
    if (event.shiftKey) actions.redo();
    else actions.undo();
  } else if (mod && key === "y") {
    event.preventDefault();
    actions.redo();
  } else if (mod && key === "d" && state.selectedId) {
    event.preventDefault();
    actions.duplicate(state.selectedId);
  } else if ((key === "delete" || key === "backspace") && state.selectedId) {
    event.preventDefault();
    actions.remove(state.selectedId);
  } else if (key === "escape") {
    actions.selectParent();
  }
}
