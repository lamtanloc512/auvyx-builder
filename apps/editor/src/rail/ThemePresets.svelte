<script lang="ts">
  // Applies a stored design brief to the whole site (U/ThemePresetsPanel.scala, S/ThemePresets.scala).
  import { Button, Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/kit";
  import { rest } from "../lib/host";
  import { toast } from "../lib/toast.svelte";
  import { ui } from "../lib/ui.svelte";
  import { reloadCanvas } from "../lib/frame";

  const PRESETS = [
    { id: "dark-neon-green", label: "Dark / Neon green", hint: "Dark canvas, neon green accent", markdown: `---
name: Dark Neon
colors:
  background: "#0c0f0d"
  surface: "#121a16"
  text: "#e8fff1"
  muted: "#9bb3a6"
  primary: "#3dff8a"
  onPrimary: "#062116"
  accent: "#3dff8a"
  border: "#24352c"
  secondary: "#1a2420"
radius: 8px
buttonRadius: 999px
---
Dark developer marketing: near-black surfaces, neon green primary, high-contrast body type. Sections use Auvyx tokens only.` },
    { id: "light-clean", label: "Light / Clean", hint: "White page, neutral type", markdown: `---
name: Light Clean
colors:
  background: "#ffffff"
  surface: "#f6f7f9"
  text: "#111827"
  muted: "#6b7280"
  primary: "#111827"
  onPrimary: "#ffffff"
  accent: "#2563eb"
  border: "#e5e7eb"
  secondary: "#f3f4f6"
radius: 12px
buttonRadius: 8px
---
Light editorial layout: white page, soft gray surfaces, dark text, blue accent.` },
  ];
  let busy = $state(false), message = $state("");

  async function apply(p: (typeof PRESETS)[number]) {
    busy = true;
    try {
      const { data: r } = await rest<{ preset?: { colors?: Record<string, string>; fonts?: Record<string, string>; radius?: string }; problems?: string[] }>("auvyx/v1/design/brief", { method: "POST", body: JSON.stringify({ markdown: p.markdown }) });
      const colors = Object.entries(r.preset?.colors ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
      const fonts = Object.entries(r.preset?.fonts ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
      message = [colors && `Colors: ${colors}`, fonts && `Fonts: ${fonts}`, r.preset?.radius && `Corners: ${r.preset.radius}`, r.problems?.length && `Adjusted: ${r.problems.join(" ")}`].filter(Boolean).join("\n");
      ui.themePresets = false;
      toast(`Applied “${p.label}”`);
      reloadCanvas();
    } catch (e) {
      message = (e as Error).message;
      toast(`Could not apply theme: ${message}`);
    } finally { busy = false; }
  }
</script>

<Dialog bind:open={ui.themePresets} contentBoxClass="gap-4 sm:max-w-md">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Page theme</DialogTitle>
    <DialogDescription>Apply a full palette and typography to the site. Library sections follow Auvyx tokens.</DialogDescription>
  </DialogHeader>
  <div class="flex flex-col gap-2">
    {#each PRESETS as p (p.id)}
      <Button variant="outline" size="sm" class="h-auto justify-start py-2 text-left" data-theme-preset={p.id} disabled={busy} onclick={() => apply(p)}>
        <div class="font-medium text-sm">{p.label}</div>
        <div class="text-[11px] text-muted-foreground">{p.hint}</div>
      </Button>
    {/each}
  </div>
  {#if message}<p class="text-xs text-muted-foreground whitespace-pre-wrap">{message}</p>{/if}
  <DialogFooter><Button variant="outline" size="sm" onclick={() => (ui.themePresets = false)}>Close</Button></DialogFooter>
</Dialog>
