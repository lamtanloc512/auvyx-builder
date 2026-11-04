/** Element ids for this session (WordPress stores none: every load gets fresh ones, as in the Studio). */
let seq = 0;
export const nextId = () => `y${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
