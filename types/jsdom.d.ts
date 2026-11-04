// islands.test.ts runs the front-end scripts inside jsdom. The package ships no types; this is the slice the test uses.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { pretendToBeVisual?: boolean; url?: string; runScripts?: string })
    readonly window: Window & typeof globalThis
  }
}
