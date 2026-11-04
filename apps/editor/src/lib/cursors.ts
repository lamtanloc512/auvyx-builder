/** The Studio's canvas cursors (U/Cursors.scala): an SVG arrow with a white halo. */
const svg = (body: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${hx} ${hy}, ${fallback}`;
export const arrow = svg("<path d='M5 2.8l12.6 9.3-5.7 1.2 3.4 6.4-2.6 1.4-3.4-6.5L5 18.8z' fill='black' stroke='white' stroke-width='1.4' stroke-linejoin='round'/>", 5, 3, "default");
