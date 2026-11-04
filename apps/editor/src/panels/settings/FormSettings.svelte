<script lang="ts">
  // A form's settings (U/FormSettings.scala): its fields (label, kind, required, choices), the button's text, the
  // message after sending and what happens then. The definition lives in the element; the site checks what visitors
  // send against the published one.
  import { FormSettings as F } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { proLocked, proShown, session } from "../../lib/session.svelte";
  import ProBadge from "./ProBadge.svelte";
  let { id }: { id: string } = $props();
  const form = $derived(store.doc.nodes[id] ? F.parseForm(store.doc.nodes[id]!.raw) : undefined);
  let adding = $state("text");
  const SMALL = "h-7 text-xs";
  function change(f: (x: F.Form) => F.Form) {
    const n = store.doc.nodes[id];
    const cur = n ? F.parseForm(n.raw) : undefined;
    if (!cur) return;
    const next = f(cur);
    store.updateNode(id, (x) => ({ ...x, raw: F.markup(next), html: F.html(next) }), `form:${id}`);
  }
  const fields = (f: (all: F.Field[]) => F.Field[]) => change((x) => ({ ...x, fields: f(x.fields).slice(0, F.MAX_FIELDS) }));
  const field = (name: string, f: (x: F.Field) => F.Field) => fields((all) => all.map((x) => (x.name === name ? f(x) : x)));
  function move(name: string, by: number) {
    fields((all) => {
      const i = all.findIndex((x) => x.name === name), j = i + by;
      if (i < 0 || j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  const kinds = F.KINDS.map(([value, label]) => ({ value, label }));
</script>

{#snippet line(name: string, hint: string, key: string, value: string, write: (f: F.Form, v: string) => F.Form)}
  <div class="flex flex-col gap-1"><span class="text-[11px] text-muted-foreground">{name}</span>
    <Input class={SMALL} {value} placeholder={hint} {...{ [`data-form-${key}`]: "1" }} onchange={(e) => { const t = e.currentTarget.value.trim(); change((f) => write(f, t)); }} /></div>
{/snippet}

<div class="flex flex-col gap-3" data-form-settings="1">
  <p class="leading-relaxed text-muted-foreground">Visitors fill this in on the published page. What they send is kept in the admin (Auvyx Builder → Form entries, with a CSV export) and only the fields below are accepted.</p>
  <div class="flex flex-col gap-2">
    {#each form?.fields ?? [] as f (f.name)}
      <div class="flex flex-col gap-1.5 rounded-md border border-border p-2" data-form-field={f.name}>
        <div class="flex items-center gap-1">
          <Input class="{SMALL} flex-1" value={f.label} placeholder="Label" data-field-label={f.name} onchange={(e) => { const v = e.currentTarget.value.trim().slice(0, 120); field(f.name, (x) => ({ ...x, label: v })); }} />
          <button class="size-6 rounded hover:bg-muted" title="Move up" onclick={() => move(f.name, -1)}>↑</button>
          <button class="size-6 rounded hover:bg-muted" title="Move down" onclick={() => move(f.name, 1)}>↓</button>
          <button class="size-6 rounded text-destructive hover:bg-muted" title="Remove the field" data-field-remove={f.name} onclick={() => fields((all) => all.filter((x) => x.name !== f.name))}>✕</button>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-32"><Select size="sm" value={f.kind} options={kinds} onValue={(v: string) => field(f.name, (x) => ({ ...x, kind: v }))} data-field-kind={f.name} /></div>
          <label class="flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={f.required} onclick={(e) => { const c = e.currentTarget.checked; field(f.name, (x) => ({ ...x, required: c })); }} />
            Required
          </label>
        </div>
        {#if F.CHOICE_KINDS.has(f.kind)}
          <textarea class="min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs" placeholder="One choice per line" data-field-options={f.name} value={f.options.join("\n")}
            onchange={(e) => { const v = e.currentTarget.value; field(f.name, (x) => ({ ...x, options: [...new Set(v.split("\n").map((o) => o.trim()).filter((o) => o !== ""))].slice(0, F.MAX_OPTIONS) })); }}></textarea>
        {:else if ["text", "email", "tel", "number", "textarea", "url"].includes(f.kind)}
          <Input class={SMALL} value={f.placeholder} placeholder="Hint inside the field (optional)" onchange={(e) => { const v = e.currentTarget.value.trim().slice(0, 120); field(f.name, (x) => ({ ...x, placeholder: v })); }} />
        {/if}
      </div>
    {/each}
  </div>
  <div class="flex items-center gap-1">
    <div class="w-32"><Select size="sm" bind:value={adding} options={kinds} /></div>
    <button class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted" data-field-add="1" onclick={() => {
      const kind = adding;
      const label = F.KINDS.find(([k]) => k === kind)?.[1] ?? "Field";
      fields((all) => [...all, { name: F.nameFor(label, new Set(all.map((x) => x.name))), label, kind, required: false, options: F.CHOICE_KINDS.has(kind) ? ["First", "Second"] : [], placeholder: "" }]);
    }}>Add a field</button>
  </div>
  {#if form}
    {#key form.submit}
      <div class="flex flex-col gap-1"><span class="text-[11px] text-muted-foreground">Button</span>
        <Input class={SMALL} value={form.submit} data-form-submit="1" onchange={(e) => { const v = e.currentTarget.value.trim().slice(0, 60); change((f) => ({ ...f, submit: v || "Send" })); }} /></div>
    {/key}
    {#key form.success}
      <div class="flex flex-col gap-1"><span class="text-[11px] text-muted-foreground">Thank-you message</span>
        <textarea class="min-h-12 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs" value={form.success}
          onchange={(e) => { const v = e.currentTarget.value.trim().slice(0, 300); change((f) => ({ ...f, success: v || "Thank you." })); }}></textarea></div>
    {/key}
  {/if}
  <!-- What happens after a sending is kept: the email to the site, a page to go to, a webhook. -->
  <div class="flex flex-col gap-2 border-t border-border pt-3" data-form-actions="1">
    <span class="text-[11px] font-medium">After sending</span>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={form?.mail ?? true} data-form-mail="1" onclick={(e) => { const c = e.currentTarget.checked; change((f) => ({ ...f, mail: c })); }} />
      Email me each message
    </label>
    {#if form?.mail ?? true}
      <div class="flex flex-col gap-2">
        {@render line("Send to", "The site administrator's email", "to", form?.to ?? "", (f, v) => ({ ...f, to: F.recipients(v) }))}
        {@render line("Subject", "New message from the form", "subject", form?.subject ?? "", (f, v) => ({ ...f, subject: v.slice(0, 150) }))}
        <p class="text-[11px] leading-relaxed text-muted-foreground">Replying to the email answers the visitor when the form has an Email field.</p>
      </div>
    {/if}
    <!-- A page to go to and a webhook are Auvyx Builder Pro's (docs/editions.md): shown only while Pro is installed. -->
    {#if proShown}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class={["flex flex-col gap-2", proLocked && "relative"]} data-form-pro-actions="" onclick={() => { if (proLocked) session.ask("form-actions"); }}>
      {#if proLocked}<div class="flex items-center gap-1 text-[11px] text-muted-foreground">Redirect and webhook<ProBadge /></div>{/if}
      <div class={["flex flex-col gap-2", proLocked && "pointer-events-none opacity-50"]}>
        {@render line("Then go to", "/thank-you or https://… (optional)", "redirect", form?.redirect ?? "", (f, v) => ({ ...f, redirect: F.safeUrl(v, true) }))}
        {@render line("Webhook", "https://hooks.zapier.com/… (optional)", "webhook", form?.webhook ?? "", (f, v) => ({ ...f, webhook: F.safeUrl(v, false) }))}
        <p class="text-[11px] leading-relaxed text-muted-foreground">The webhook receives the answers as JSON: Zapier, Make, n8n or a CRM can take it from there.</p>
      </div>
    </div>
    {/if}
  </div>
</div>
