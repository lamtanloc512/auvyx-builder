<script lang="ts">
  // A checkbox with its name (BuilderUi.check).
  let { name, attr, on, set }: { name: string; attr: string; on: boolean; set: (v: boolean) => void } = $props();
</script>

<label class="flex items-center gap-2 text-[11px]">
  <input type="checkbox" data-builder-check={attr} checked={on} onchange={(e) => set(e.currentTarget.checked)} />
  {name}
</label>
