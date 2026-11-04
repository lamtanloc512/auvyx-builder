import { useBlockProps } from "@wordpress/block-editor";
import type { BlockEditProps } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { code } from "@wordpress/icons";
import type { AuvyxAttribute } from "@auvyx/block-ops";
import { useYbBlock } from "@auvyx/block-kit";
import metadata from "./block.json";

type Attributes = {
  code?: string;
  language?: string;
  theme?: "dark" | "light";
  auvyx?: AuvyxAttribute;
};

function Edit({ attributes, setAttributes, isSelected }: BlockEditProps<Attributes>) {
  const { code: snippet = "", language = "sql", theme = "dark" } = attributes;
  const { className, ref, controls } = useYbBlock({
    auvyx: attributes.auvyx,
    setYb: (next) => setAttributes({ auvyx: next }),
    isSelected,
    title: __("Code", "auvyx-builder"),
    initialOpen: ["spacing", "layout"],
  });
  return (
    <>
      {controls}
      <div
        {...useBlockProps({
          className: `${className ?? ""} auvyx-snippet auvyx-snippet--${theme}`.trim(),
          ref,
        })}
        data-auvyx-snippet="1"
        data-theme={theme}
      >
        <pre>
          <code className={`language-${language}`}>{snippet}</code>
        </pre>
        <button type="button" className="auvyx-snippet__copy" disabled>
          {__("Copy", "auvyx-builder")}
        </button>
      </div>
    </>
  );
}

function highlight(code: string): string {
  const re =
    /(--[^\n]*|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b(?:import|from|const|let|await|return|select|where|as|function)\b)/gi;
  let out = "";
  let i = 0;
  for (const match of code.matchAll(re)) {
    const start = match.index ?? 0;
    out += escapeHtml(code.slice(i, start));
    const raw = match[0];
    const kind = raw.startsWith("//") || raw.startsWith("--") ? "token-comment" : raw.startsWith("'") || raw.startsWith('"') || raw.startsWith("`") ? "token-string" : "token-keyword";
    out += `<span class="${kind}">${escapeHtml(raw)}</span>`;
    i = start + raw.length;
  }
  out += escapeHtml(code.slice(i));
  return out;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function save({ attributes }: { attributes: Attributes }) {
  const { code: snippet = "", language = "sql", theme = "dark" } = attributes;
  return (
    <div
      {...useBlockProps.save({
        className: `auvyx-snippet auvyx-snippet--${theme}`,
        "data-auvyx-snippet": "1",
        "data-theme": theme,
      })}
    >
      <pre>
        <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: highlight(snippet) }} />
      </pre>
      <button type="button" className="auvyx-snippet__copy" aria-label="Copy code">
        Copy
      </button>
    </div>
  );
}

export const snippetBlock = { metadata, settings: { edit: Edit, save, icon: code } };
