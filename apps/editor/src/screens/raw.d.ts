// Vite's `?raw` imports: a file's text (the screens use the plugin's own stylesheets as text).
declare module "*.css?raw" {
  const text: string;
  export default text;
}
