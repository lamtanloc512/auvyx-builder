/** Whether the game can be seen (scrolled away, tab hidden: pause the loop) and full screen through the page. */
import { none } from "../args";
import { type Capability, method } from "../capability";
import type { Remote } from "../session";

export interface ViewportSource {
  readonly visible: () => boolean;
  readonly watch: (listener: (visible: boolean) => void) => () => void;
  readonly fullscreen: () => Promise<void>;
}

export const viewportCapability = ({ source }: { readonly source: ViewportSource }): Capability => ({
  name: "viewport",
  version: 1,
  methods: {
    state: method(none, () => ({ visible: source.visible() })),
    fullscreen: method(none, async () => {
      await source.fullscreen();
      return null;
    }),
  },
  events: ["visibility"],
  start: (emit) => source.watch((visible) => emit("visibility", { visible })),
});

export interface ViewportApi {
  readonly visible: () => Promise<boolean>;
  readonly onVisibility: (listener: (visible: boolean) => void) => () => void;
  readonly fullscreen: () => Promise<void>;
}

const visibleOf = (v: unknown): boolean => typeof v === "object" && v !== null && "visible" in v && v.visible === true;

export const viewportApi = (remote: Remote): ViewportApi => ({
  visible: async () => visibleOf(await remote.call("viewport", "state")),
  onVisibility: (listener) => remote.on("viewport", "visibility", (data) => listener(visibleOf(data))),
  fullscreen: async () => {
    await remote.call("viewport", "fullscreen");
  },
});
