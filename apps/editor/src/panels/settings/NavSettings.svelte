<script lang="ts">
  // A navigation's menu and how it shows (SettingsPanel, Kind.Nav): links in a row or a department menu (NavDept), when
  // the menu button appears, and how it opens (NavDrawer: a ready variant, never code).
  import { Settings as S } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { menus } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const dept = $derived(S.isDept(n?.className ?? ""));
  const drawer = $derived(S.readDrawer(n?.className ?? ""));
  const items = (p: [string, string][]) => p.map(([value, label]) => ({ value, label }));
  const menuItems = menus.length ? menus.map((m) => ({ value: m.id, label: m.label })) : [{ value: "pages", label: "Pages" }];
  const setDrawer = (f: (o: ReturnType<typeof S.readDrawer>) => ReturnType<typeof S.readDrawer>) =>
    update("drawer", (x) => ({ ...x, className: S.writeDrawer(x.className, f(S.readDrawer(x.className))) }));
</script>

{#if n}
  <div class="flex flex-col gap-2">
    <Row name="Menu"><Select size="sm" value={n.src} options={menuItems} onValue={(v: string) => update("src", (x) => ({ ...x, src: v }))} /></Row>
    <!-- Links in a row, or a department menu: one button over a vertical list (NavDept), as marketplace headers do. -->
    <Row name="Shows as">
      <Select size="sm" value={dept ? "dept" : "links"} options={[{ value: "links", label: "Links" }, { value: "dept", label: "Button with a list (Shop by…)" }]}
        onValue={(v: string) => update("dept", (x) => ({ ...x, className: S.writeDept(x.className, { on: v === "dept", home: v === "dept" }), text: v === "dept" && x.text.trim() === "" ? S.NAV_DEPT_LABEL : x.text }))} />
    </Row>
    {#if dept}
      <div class="flex flex-col gap-2" data-nav-dept="">
        <Row name="Button text"><Input class="h-7 text-xs" placeholder={S.NAV_DEPT_LABEL} value={n.text} oninput={(e) => update("text", (x) => ({ ...x, text: e.currentTarget.value }))} /></Row>
        <label class="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={S.readDept(n.className).home} onchange={(e) => { const on = e.currentTarget.checked; update("dept-home", (x) => ({ ...x, className: S.writeDept(x.className, { on: true, home: on }) })); }} />
          Open on the home page (wide screens)
        </label>
      </div>
    {:else}
      <Row name="Button"><Select size="sm" value={n.alt} options={[{ value: "mobile", label: "On mobile" }, { value: "tablet", label: "On tablet and mobile" }, { value: "never", label: "Never" }]} onValue={(v: string) => update("alt", (x) => ({ ...x, alt: v }))} /></Row>
    {/if}
    {#if n.alt !== "never" && !dept}
      <div class="flex flex-col gap-2" data-nav-drawer="">
        <Row name="Opens as"><Select size="sm" value={drawer.style} options={items(S.DRAWER_STYLES)} onValue={(v: string) => setDrawer((o) => ({ ...o, style: v }))} /></Row>
        {#if drawer.style !== "dropdown"}
          <div class="flex flex-col gap-2">
            {#if drawer.style === "left" || drawer.style === "right"}
              <Row name="Width"><Select size="sm" value={drawer.width} options={items(S.DRAWER_WIDTHS)} onValue={(v: string) => setDrawer((o) => ({ ...o, width: v }))} /></Row>
            {/if}
            <Row name="Backdrop"><Select size="sm" value={drawer.backdrop} options={items(S.DRAWER_BACKDROPS)} onValue={(v: string) => setDrawer((o) => ({ ...o, backdrop: v }))} /></Row>
            <Row name="Submenus"><Select size="sm" value={drawer.fold ? "fold" : "open"} options={[{ value: "open", label: "Shown" }, { value: "fold", label: "Folded" }]} onValue={(v: string) => setDrawer((o) => ({ ...o, fold: v === "fold" }))} /></Row>
          </div>
        {/if}
      </div>
    {/if}
    <p class="text-[11px] leading-relaxed text-muted-foreground">Below that size the links fold into a menu button. Edit the links in Appearance → Menus or the Site Editor.</p>
  </div>
{/if}
