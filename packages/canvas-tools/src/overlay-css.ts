/** Injected into the canvas document (the editor iframe does not get editor.css). */
export const OVERLAY_CSS = `
.auvyx-ov{position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:99999}
.auvyx-ov__band{position:absolute;pointer-events:none}
.auvyx-ov__band--padding{background:rgba(236,72,153,.18)}
.auvyx-ov__band--margin{background:rgba(249,115,22,.18)}
.auvyx-ov__band--gap{background:rgba(139,92,246,.22)}
.auvyx-ov__h{position:absolute;pointer-events:auto;touch-action:none;box-sizing:border-box;border-radius:99px;background:#fff;box-shadow:0 0 0 1.5px var(--c),0 1px 3px rgba(0,0,0,.3);transition:background .1s}
.auvyx-ov__h::before{content:"";position:absolute;inset:-6px}
.auvyx-ov__h:hover,.auvyx-ov__h.is-active{background:var(--c)}
.auvyx-ov__h--padding{--c:#ec4899}
.auvyx-ov__h--margin{--c:#f97316}
.auvyx-ov__h--gap{--c:#8b5cf6}
.auvyx-ov__h--size{--c:#3858e9;border-radius:2px}
.auvyx-ov__h--radius{--c:#3858e9}
.auvyx-ov__badge,.auvyx-ov__tip{position:absolute;pointer-events:none;white-space:nowrap;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;border-radius:3px}
.auvyx-ov__badge{background:#3858e9;padding:4px 6px;transform:translate(-100%,-100%)}
.auvyx-ov__tip{background:#1e1e1e;padding:6px 8px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
body.auvyx-ov-dragging,body.auvyx-ov-dragging *{cursor:var(--auvyx-ov-cursor)!important;user-select:none!important}
`;
