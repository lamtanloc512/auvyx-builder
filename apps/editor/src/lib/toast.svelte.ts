/** One short message at the bottom (U/Clipboard.scala Toast): replaced by the next, gone after 1.8 s. */
export const toastState = $state<{ text: string | null; n: number }>({ text: null, n: 0 });
let timer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  toastState.text = text;
  toastState.n++;
  clearTimeout(timer);
  timer = setTimeout(() => (toastState.text = null), 1800);
}
