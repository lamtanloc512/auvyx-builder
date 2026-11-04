/**
 * What the plugin prints as `window.auvyxEditor`: Auvyx Studio's own config (Studio::config), so both editors start from the
 * same page, links and settings. Only the fields this editor reads are typed.
 */
import type { TreeNode } from "@auvyx/editor-core";

export interface Token { slug: string; name?: string; color?: string; size?: string; value?: string }
export interface DesignSystem {
  breakpoints?: { id: string; label: string; maxWidth?: number; minWidth?: number }[];
  tokens?: { color?: Token[]; fontSize?: Token[]; spacing?: Token[] };
}

export interface EditorConfig {
  /** An AI connection's save that waits for code approval (Modules/Mcp/Pending::config). */
  mcpPending?: { token: string; time: string; where: "draft" | "autosave" | "live"; title: string; elements: { id: string; block: string; code: string; html: string }[]; canApprove: boolean; route: string; nonce: string } | null;
  postId: number;
  postType: string;
  restRoot: string;
  restBase: string;
  restId?: string;
  nonce: string;
  title: string;
  isComponent?: boolean;
  isPart?: boolean;
  partArea?: string;
  canvasUrl: string;
  webCanvasUrl: string;
  canvasPrefix?: string;
  viewUrl: string;
  previewUrl: string;
  blockEditorUrl: string;
  exitUrl: string;
  status: string;
  modified: string;
  autosaves?: boolean;
  autosave?: { blocks: TreeNode[]; modified: string } | null;
  lock?: { locked?: boolean; by?: string };
  designSystem?: DesignSystem;
  assetsUrl?: string;
  canScript?: boolean;
  blocks: TreeNode[];
  menus?: unknown;
  pageTemplates?: { slug: string; title: string }[];
  studioUrl?: string;
  canEditMenus?: boolean;
  contentTypes?: boolean;
  siteTemplates?: boolean;
  theme?: unknown;
  patterns?: { name: string; title: string; categories?: string[] }[];
}

export const config: EditorConfig = (window as unknown as { auvyxEditor: EditorConfig }).auvyxEditor;
