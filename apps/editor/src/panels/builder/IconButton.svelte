<script lang="ts">
  // A small icon button of the board (BuilderUi.iconButton).
  import { Icon } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  let { icon, hint, attr, enabled = true, act, iconClass = "" }: { icon: IconName; hint: string; attr: string; enabled?: boolean; act: () => void; iconClass?: string } = $props();
</script>

<button
  type="button"
  class="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
  title={hint}
  aria-label={hint}
  data-chip-action={attr}
  disabled={!enabled}
  onclick={(e) => { e.stopPropagation(); act(); }}
><Icon name={icon} size={13} class={iconClass} /></button>
