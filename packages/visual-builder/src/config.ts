/** Data printed by the VisualBuilder PHP module (window.auvyxVisualBuilder). */
export type LocationRule = {
  location: string;
  rule: "all" | "front" | "singular" | "ids" | "archive" | "blog" | "terms" | "search" | "notfound";
  postTypes: string[];
  ids: number[];
  /** Set in Auvyx Builder → Patterns & components; kept as they are here (Components::sanitize_locations). */
  terms?: string[];
  exclude?: number[];
  audience?: "all" | "in" | "out";
  roles?: string[];
  from?: string;
  until?: string;
};

export type ComponentData = {
  id: number;
  title: string;
  content: string;
  locations: LocationRule[];
};

export type BuilderConfig = {
  postId: number;
  postType: string;
  restBase: string;
  isComponent: boolean;
  title: string;
  content: string;
  status: string;
  canvasUrl: string;
  viewUrl: string;
  blockEditorUrl: string;
  exitUrl: string;
  /** Append a post id to open another post/component in the builder. */
  builderUrl: string;
  palette: unknown;
  components: ComponentData[];
  locationOptions: Record<string, string>;
  canEditLocations: boolean;
  patterns: { name: string; title: string; content: string }[];
};

declare global {
  interface Window {
    auvyxVisualBuilder?: BuilderConfig;
  }
}
