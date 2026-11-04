<script lang="ts">
  // Ghost icon button with an X; inside a Dialog it closes it (Dialog.close(isOpenVar)) unless autoClose={false}.
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Icon from "../Icon.svelte";
  import Button from "./Button.svelte";
  import { cx } from "./anchor.svelte";
  import { getDialogContext } from "./dialog";

  interface Props extends Omit<HTMLButtonAttributes, "type"> {
    autoClose?: boolean;
  }

  let { autoClose = true, class: cls = "", onclick, ...rest }: Props = $props();
  const ctx = getDialogContext();
</script>

<Button
  variant="ghost"
  size="icon-sm"
  data-slot="dialog-close"
  class={cx("cn-dialog-close absolute top-4 right-4", cls)}
  onclick={(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) => {
    if (autoClose) ctx?.close();
    onclick?.(e);
  }}
  {...rest}
>
  <Icon name="x" />
  <span class="sr-only">Close</span>
</Button>
