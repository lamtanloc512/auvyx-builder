/** Where the next Add-panel insert goes (U/InsertPlus.scala `pending`), taken once. */
export const pending = $state<{ at: [string | null, number] | null }>({ at: null });
export function takePending(): [string | null, number] | null {
  const at = pending.at;
  pending.at = null;
  return at;
}
