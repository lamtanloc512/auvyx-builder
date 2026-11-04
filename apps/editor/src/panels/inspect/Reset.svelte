<script lang="ts">
  import { Icon } from "../../ui/kit";
  let { show, onreset }: { show: boolean; onreset: () => void } = $props();
</script>
<button type="button" class="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
  title="Reset to the inherited value" style:visibility={show ? "visible" : "hidden"} onclick={onreset}><Icon name="x" size={12} /></button>
