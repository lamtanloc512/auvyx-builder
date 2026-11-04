/**
 * Builder state: block tree with undo/redo, selection, breakpoint, components
 * library, save. One reducer + a context; operations are plain functions.
 */
import apiFetch from "@wordpress/api-fetch";
import { cloneBlock, createBlock, parse, serialize, type Block } from "@wordpress/blocks";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "@wordpress/element";
import type { ReactNode } from "react";
import { setStyles, type AuvyxAttribute } from "@auvyx/block-ops";
import { getDesignSystem, getEditorUi } from "@auvyx/block-kit";
import type { BuilderConfig, ComponentData, LocationRule } from "./config";
import { commit, createHistory, redo, undo, type History } from "./history";
import {
  getBlock,
  getParentId,
  insertRelative,
  insertionPoint,
  moveRelative,
  removeById,
  updateById,
  type BuilderBlock,
  type Placement,
} from "./tree";

export type LeftTab = "layers" | "add" | "components";

export type State = {
  history: History<BuilderBlock[]>;
  /** Bumped when markup must be re-rendered (structure/content), not for style-only edits. */
  renderVersion: number;
  savedBlocks: BuilderBlock[];
  selectedId?: string;
  hoveredId?: string;
  breakpoint: string;
  title: string;
  savedTitle: string;
  locations: LocationRule[];
  savedLocations: LocationRule[];
  components: ComponentData[];
  leftTab: LeftTab;
  saving: boolean;
  notice?: { kind: "success" | "error"; text: string };
};

type Action =
  | { type: "change"; blocks: BuilderBlock[]; kind: "style" | "content"; key?: string; select?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; id?: string }
  | { type: "hover"; id?: string }
  | { type: "breakpoint"; id: string }
  | { type: "title"; title: string }
  | { type: "locations"; locations: LocationRule[] }
  | { type: "components"; components: ComponentData[] }
  | { type: "left-tab"; tab: LeftTab }
  | { type: "saving" }
  | { type: "saved" }
  | { type: "notice"; notice?: State["notice"] };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "change":
      return {
        ...state,
        history: commit(state.history, action.blocks, action.key),
        renderVersion: action.kind === "content" ? state.renderVersion + 1 : state.renderVersion,
        selectedId: action.select ?? state.selectedId,
      };
    case "undo":
    case "redo": {
      const history = action.type === "undo" ? undo(state.history) : redo(state.history);
      const selectedId =
        state.selectedId && getBlock(history.present, state.selectedId) ? state.selectedId : undefined;
      return { ...state, history, selectedId, renderVersion: state.renderVersion + 1 };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "hover":
      return state.hoveredId === action.id ? state : { ...state, hoveredId: action.id };
    case "breakpoint":
      return { ...state, breakpoint: action.id };
    case "title":
      return { ...state, title: action.title };
    case "locations":
      return { ...state, locations: action.locations };
    case "components":
      return { ...state, components: action.components, renderVersion: state.renderVersion + 1 };
    case "left-tab":
      return { ...state, leftTab: action.tab };
    case "saving":
      return { ...state, saving: true, notice: undefined };
    case "saved":
      return {
        ...state,
        saving: false,
        savedBlocks: state.history.present,
        savedTitle: state.title,
        savedLocations: state.locations,
        notice: { kind: "success", text: "Saved" },
      };
    case "notice":
      return { ...state, saving: false, notice: action.notice };
  }
};

const toBuilderBlocks = (blocks: Block[]) => blocks as unknown as BuilderBlock[];
const toWpBlocks = (blocks: readonly BuilderBlock[]) => blocks as unknown as Block[];

export const parseContent = (content: string): BuilderBlock[] =>
  toBuilderBlocks(parse(content)).filter(
    // Whitespace between top-level blocks parses as empty freeform blocks.
    (block) => !(block.name === "core/freeform" && String(block.attributes.content ?? "").trim() === "")
  );

export const serializeBlocks = (blocks: readonly BuilderBlock[]): string => serialize(toWpBlocks(blocks));

/** Path like "0.2" (from ?select=) → clientId, for deep links. */
const blockAtPath = (blocks: readonly BuilderBlock[], path: string | null): string | undefined => {
  if (!path) return undefined;
  let level = blocks;
  let found: BuilderBlock | undefined;
  for (const index of path.split(".").map(Number)) {
    found = level[index];
    if (!found) return undefined;
    level = found.innerBlocks;
  }
  return found?.clientId;
};

export const createInitialState = (config: BuilderConfig, breakpoint: string): State => {
  const blocks = parseContent(config.content);
  const component = config.components.find((c) => c.id === config.postId);
  const locations = component?.locations ?? [];
  const params = new URLSearchParams(window.location.search);
  const requestedBreakpoint = params.get("breakpoint");
  return {
    history: createHistory(blocks),
    renderVersion: 0,
    savedBlocks: blocks,
    // Deep links (?select=0.1&breakpoint=mobile) for sharing a view and for screenshots.
    selectedId: blockAtPath(blocks, params.get("select")),
    breakpoint: getDesignSystem().breakpoints.some((bp) => bp.id === requestedBreakpoint)
      ? (requestedBreakpoint as string)
      : breakpoint,
    title: config.title,
    savedTitle: config.title,
    locations,
    savedLocations: locations,
    components: config.components,
    leftTab: "layers",
    saving: false,
  };
};

/** Defaults for click-to-insert: new sections are auto-layout frames, like Figma. */
export const BLOCK_DEFAULTS: Record<string, Record<string, unknown>> = {
  "auvyx/section": {
    auvyx: {
      v: 1,
      styles: {
        base: {
          default: {
            display: "flex",
            "flex-direction": "column",
            gap: "1rem",
            "padding-block-start": "2rem",
            "padding-block-end": "2rem",
            "padding-inline-start": "2rem",
            "padding-inline-end": "2rem",
          },
        },
      },
    },
  },
  "auvyx/heading": { content: "Heading", level: 2 },
  "auvyx/text": { content: "Write something…" },
  "auvyx/button": { text: "Button", url: "#" },
};

type Context = {
  state: State;
  config: BuilderConfig;
  dispatch: (action: Action) => void;
  blocks: BuilderBlock[];
  dirty: boolean;
  actions: ReturnType<typeof createActions>;
};

const BuilderContext = createContext<Context | null>(null);

const createActions = (config: BuilderConfig, state: State, dispatch: (action: Action) => void) => {
  const blocks = state.history.present;
  const change = (next: BuilderBlock[], kind: "style" | "content", key?: string, select?: string) =>
    dispatch({ type: "change", blocks: next, kind, key, select });

  const insert = (newBlocks: BuilderBlock[], targetId?: string, placement?: Placement) => {
    const point = targetId === undefined ? insertionPoint(blocks, state.selectedId) : { targetId, placement: placement ?? "after" };
    let next = blocks;
    let anchor = point.targetId;
    let where: Placement = point.placement;
    for (const block of newBlocks) {
      next = insertRelative(next, block, anchor, where);
      anchor = block.clientId;
      where = "after";
    }
    change(next, "content", undefined, newBlocks[0]?.clientId);
  };

  return {
    select: (id?: string) => dispatch({ type: "select", id }),
    hover: (id?: string) => dispatch({ type: "hover", id }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),

    updateAttributes: (id: string, patch: Record<string, unknown>, key?: string) =>
      change(updateById(blocks, id, patch), "content", key),

    /** Style patch for the active breakpoint + state (canvas handles, panel). */
    updateStyles: (id: string, patch: Record<string, string | undefined>) => {
      const block = getBlock(blocks, id);
      if (!block) return;
      const target = { breakpoint: state.breakpoint, state: getEditorUi().styleState };
      const auvyx = setStyles(block.attributes.auvyx as AuvyxAttribute | undefined, target, patch);
      change(updateById(blocks, id, { auvyx }), "style", `style:${id}:${Object.keys(patch).join(",")}`);
    },

    setYb: (id: string, auvyx: AuvyxAttribute | undefined) =>
      change(updateById(blocks, id, { auvyx }), "style", `auvyx:${id}`),

    insertNew: (name: string) =>
      insert([toBuilderBlocks([createBlock(name, BLOCK_DEFAULTS[name] ?? {})])[0] as BuilderBlock]),

    insertBlocks: (newBlocks: BuilderBlock[]) => insert(newBlocks),

    insertComponent: (ref: number) =>
      insert([toBuilderBlocks([createBlock("core/block", { ref })])[0] as BuilderBlock]),

    remove: (id: string) => {
      const parent = getParentId(blocks, id);
      change(removeById(blocks, id), "content", undefined, parent);
      if (!parent) dispatch({ type: "select", id: undefined });
    },

    duplicate: (id: string) => {
      const block = getBlock(blocks, id);
      if (!block) return;
      const copy = toBuilderBlocks([cloneBlock(block as unknown as Block)])[0] as BuilderBlock;
      change(insertRelative(blocks, copy, id, "after"), "content", undefined, copy.clientId);
    },

    move: (id: string, targetId: string, placement: Placement) =>
      change(moveRelative(blocks, id, targetId, placement), "content"),

    selectParent: () => {
      if (state.selectedId) dispatch({ type: "select", id: getParentId(blocks, state.selectedId) });
    },

    /** Replace an instance by a copy of its content (like Figma "Detach instance"). */
    detach: (id: string) => {
      const block = getBlock(blocks, id);
      const component = state.components.find((c) => c.id === Number(block?.attributes.ref));
      if (!block || !component) return;
      const copies = parseContent(component.content).map(
        (inner) => toBuilderBlocks([cloneBlock(inner as unknown as Block)])[0] as BuilderBlock
      );
      let next = blocks;
      for (const copy of [...copies].reverse()) next = insertRelative(next, copy, id, "after");
      change(removeById(next, id), "content", undefined, copies[0]?.clientId);
    },

    /** Saves the selection as a new component (synced pattern) and replaces it with an instance. */
    createComponent: async (id: string, title: string) => {
      const block = getBlock(blocks, id);
      if (!block) return;
      try {
        const created = await apiFetch<{ id: number; title: { raw: string }; content: { raw: string } }>({
          path: "/wp/v2/blocks?context=edit",
          method: "POST",
          data: { title, content: serializeBlocks([block]), status: "publish" },
        });
        const component: ComponentData = {
          id: created.id,
          title: created.title.raw,
          content: created.content.raw,
          locations: [],
        };
        dispatch({ type: "components", components: [...state.components, component] });
        const instance = toBuilderBlocks([createBlock("core/block", { ref: created.id })])[0] as BuilderBlock;
        change(removeById(insertRelative(blocks, instance, id, "after"), id), "content", undefined, instance.clientId);
        dispatch({ type: "notice", notice: { kind: "success", text: `Component “${title}” created` } });
      } catch (error) {
        dispatch({ type: "notice", notice: { kind: "error", text: errorText(error) } });
      }
    },

    save: async () => {
      dispatch({ type: "saving" });
      const data: Record<string, unknown> = { content: serializeBlocks(blocks), title: state.title };
      if (config.isComponent && config.canEditLocations) {
        data.meta = { _auvyx_locations: state.locations };
      }
      try {
        await apiFetch({ path: `/wp/v2/${config.restBase}/${config.postId}`, method: "POST", data });
        dispatch({ type: "saved" });
      } catch (error) {
        dispatch({ type: "notice", notice: { kind: "error", text: errorText(error) } });
      }
    },
  };
};

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error ? String(error.message) : "Request failed";

export function BuilderProvider({
  config,
  initial,
  children,
}: {
  config: BuilderConfig;
  initial: State;
  children: ReactNode;
}) {
  const [state, rawDispatch] = useReducer(reducer, initial);
  const dispatch = useCallback((action: Action) => rawDispatch(action), []);
  const value = useMemo<Context>(() => {
    const blocks = state.history.present;
    return {
      state,
      config,
      dispatch,
      blocks,
      dirty:
        blocks !== state.savedBlocks ||
        state.title !== state.savedTitle ||
        state.locations !== state.savedLocations,
      actions: createActions(config, state, dispatch),
    };
  }, [state, config, dispatch]);
  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export const useBuilder = (): Context => {
  const context = useContext(BuilderContext);
  if (!context) throw new Error("useBuilder outside BuilderProvider");
  return context;
};
