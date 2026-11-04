/** Light, dark or the device's choice for the editor's own panels (K/Theme.scala); the page keeps its look. */
const KEY = "auvyx-studio:theme";
const MODES = ["light", "dark", "system"] as const;
type Mode = (typeof MODES)[number];
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const own = read(KEY) as Mode | null, admin = read("lyra-admin-theme");

class Theme {
  mode = $state<Mode>(own && MODES.includes(own) ? own : admin === "light" || admin === "dark" ? admin : "system");
  device = $state(matchMedia("(prefers-color-scheme: dark)").matches);
  get dark() { return this.mode === "dark" || (this.mode === "system" && this.device); }
  next(m: Mode = this.mode): Mode { return MODES[(MODES.indexOf(m) + 1) % MODES.length]!; }
  cycle() { this.mode = this.next(); try { localStorage.setItem(KEY, this.mode); } catch { /* private window */ } }
  start() {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => (this.device = e.matches));
    $effect.root(() => {
      $effect(() => {
        document.documentElement.classList.toggle("dark", this.dark);
        document.documentElement.style.setProperty("color-scheme", this.dark ? "dark" : "light");
      });
    });
  }
}
export const theme = new Theme();
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
