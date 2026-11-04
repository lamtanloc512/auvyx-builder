<script lang="ts">
  // A Markdown reply as elements (U/MarkdownView.scala): built from the parsed tree, never from innerHTML, so what the
  // model writes cannot add markup; links open in a new tab.
  import { type Block, type Inline, type Item, parse } from "../../lib/agentMarkdown";
  let { text }: { text: string } = $props();
  const blocks = $derived(parse(text));
  const size = (level: number) => (level === 1 ? "text-[14px]" : level === 2 ? "text-[13px]" : "text-[12px]");
  const alignOf = (a: string | undefined) => `text-align: ${a ?? "left"}`;
  const tasks = (items: Item[]) => items.length > 0 && items.every((i) => i.done !== null);
</script>

{#snippet inlines(is: Inline[])}{#each is as i, n (n)}{#if i.t === "text"}{i.value}{:else if i.t === "bold"}<strong class="font-semibold">{@render inlines(i.children)}</strong>{:else if i.t === "italic"}<em>{@render inlines(i.children)}</em>{:else if i.t === "strike"}<span class="line-through">{@render inlines(i.children)}</span>{:else if i.t === "code"}<code class="rounded-sm bg-background/70 px-1 py-px font-mono text-[0.92em]">{i.value}</code>{:else if i.t === "link"}<a href={i.url} target="_blank" rel="noopener noreferrer" class="break-all underline underline-offset-2 hover:text-foreground">{@render inlines(i.children)}</a>{/if}{/each}{/snippet}

{#snippet item(it: Item, isTasks: boolean)}
  {#if it.done !== null}
    <li class="flex list-none items-start gap-2">
      <span class={`mt-[0.2em] inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] ${it.done ? "border-foreground bg-foreground text-background" : "border-foreground/40"}`}
        role="img" aria-label={it.done ? "done" : "not done"}>{it.done ? "✓" : ""}</span>
      <div class="flex min-w-0 flex-col gap-1">{#each it.blocks as b, n (n)}{@render block(b)}{/each}</div>
    </li>
  {:else}
    <li class={isTasks ? "list-none" : ""}><div class="flex min-w-0 flex-col gap-1">{#each it.blocks as b, n (n)}{@render block(b)}{/each}</div></li>
  {/if}
{/snippet}

{#snippet block(b: Block)}
  {#if b.t === "para"}
    <div>{#each b.lines as l, n (n)}{#if n > 0}<br />{/if}{@render inlines(l)}{/each}</div>
  {:else if b.t === "heading"}
    <div class={`pt-1 font-semibold leading-snug ${size(b.level)}`}>{@render inlines(b.text)}</div>
  {:else if b.t === "list"}
    {#if b.ordered}
      <ol class="flex list-decimal flex-col gap-1 ps-5 marker:text-muted-foreground" start={b.start}>{#each b.items as it, n (n)}{@render item(it, tasks(b.items))}{/each}</ol>
    {:else}
      <ul class={`flex flex-col gap-1 marker:text-muted-foreground ${tasks(b.items) ? "ps-0" : "list-disc ps-4"}`}>{#each b.items as it, n (n)}{@render item(it, tasks(b.items))}{/each}</ul>
    {/if}
  {:else if b.t === "quote"}
    <div class="flex flex-col gap-2 border-s-2 border-foreground/20 ps-3">{#each b.blocks as x, n (n)}{@render block(x)}{/each}</div>
  {:else if b.t === "code"}
    <pre class="overflow-x-auto rounded-md bg-background/70 p-2 font-mono text-[0.92em] leading-relaxed"><code>{b.text}</code></pre>
  {:else if b.t === "rule"}
    <hr class="border-border" />
  {:else if b.t === "table"}
    <div class="max-w-full overflow-x-auto rounded-md border border-border">
      <table class="w-full border-collapse text-[0.92em]">
        <thead><tr class="bg-background/60">{#each b.head as h, n (n)}<th class="border-b border-border px-2 py-1 font-semibold whitespace-nowrap" style={alignOf(b.align[n])}>{@render inlines(h)}</th>{/each}</tr></thead>
        <tbody>{#each b.rows as r, rn (rn)}<tr>{#each r as c, n (n)}<td class="border-b border-border px-2 py-1 align-top last:border-b-0" style={alignOf(b.align[n])}>{@render inlines(c)}</td>{/each}</tr>{/each}</tbody>
      </table>
    </div>
  {/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-2 break-words" translate="no">{#each blocks as b, n (n)}{@render block(b)}{/each}</div>
