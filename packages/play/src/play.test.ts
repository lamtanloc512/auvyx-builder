import { describe, expect, test } from "bun:test";
import {
  type Capability,
  type Fetch,
  type KeyValueStore,
  PROTOCOL,
  PlayError,
  type ViewportSource,
  assetsApi,
  assetsCapability,
  connect,
  contentSecurityPolicy,
  createPeer,
  createRegistry,
  inputApi,
  inputCapability,
  inspectApi,
  inspectCapability,
  librariesApi,
  librariesCapability,
  manifestAssets,
  memoryPair,
  memoryStore,
  method,
  mountHost,
  none,
  parseMessage,
  storageApi,
  storageCapability,
  tableLibraries,
  viewportApi,
  viewportCapability,
} from "./index";
import type { KeyInput } from "./capabilities/input";

const game = { id: "g1", title: "Test game", mode: "studio" } as const;

/** A page and a game connected in memory, through the real peer, host and client. */
const connectPair = async ({ page, inGame = [] }: { page: readonly Capability[]; inGame?: readonly Capability[] }) => {
  const [pageSide, gameSide] = memoryPair();
  const host = mountHost({ channel: pageSide, registry: createRegistry(page), game });
  const session = await connect({ channel: gameSide, registry: createRegistry(inGame), sdk: "test", timeoutMs: 2000 });
  const gameRemote = await host.ready;
  return { host, session, gameRemote };
};

const failure = async (p: Promise<unknown>): Promise<PlayError> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof PlayError) return e;
    throw e;
  }
  throw new Error("expected a failure");
};

describe("protocol", () => {
  test("only our protocol and well-formed messages get through", () => {
    expect(parseMessage({ protocol: "other/1", kind: "hello", sdk: "x", capabilities: [] })).toBeUndefined();
    expect(parseMessage({ protocol: PROTOCOL, kind: "call", id: -1, capability: "storage", method: "get" })).toBeUndefined();
    expect(parseMessage({ protocol: PROTOCOL, kind: "call", id: 1, capability: "Bad Name", method: "get" })).toBeUndefined();
    expect(parseMessage({ protocol: PROTOCOL, kind: "result", id: 1, ok: false, error: "nope" })).toBeUndefined();
    expect(parseMessage({ protocol: PROTOCOL, kind: "call", id: 1, capability: "storage", method: "get", args: { key: "a" } })).toEqual({
      kind: "call",
      id: 1,
      capability: "storage",
      method: "get",
      args: { key: "a" },
    });
  });

  test("the policy comes from shared/play.json with the host's origins filled in", () => {
    const csp = contentSecurityPolicy({ siteOrigin: "https://shop.vn", runtimeOrigin: "https://shop.vn" });
    expect(csp.startsWith("sandbox allow-scripts")).toBe(true);
    expect(csp).toContain("frame-ancestors https://shop.vn");
    expect(csp).toContain("connect-src data: blob:");
    expect(csp).not.toContain("{");
  });
});

describe("handshake and capabilities", () => {
  test("each side sees what the other granted, and nothing else can be called", async () => {
    const { session, gameRemote } = await connectPair({
      page: [storageCapability({ store: memoryStore() })],
      inGame: [inspectCapability({ snapshotter: { snapshot: async () => null } }).capability],
    });
    expect(session.game).toEqual(game);
    expect(session.has("storage")).toBe(true);
    expect(session.has("assets")).toBe(false);
    expect(gameRemote.has("inspect")).toBe(true);
    expect((await failure(session.call("assets", "list"))).code).toBe("not-granted");
    expect((await failure(session.call("storage", "drop"))).code).toBe("no-method");
  });

  test("a registry refuses a capability registered twice, and drops events it did not declare", async () => {
    const twice: Capability = { name: "x", version: 1, methods: {} };
    expect(() => createRegistry([twice, twice])).toThrow();
    const sent: string[] = [];
    const chatty: Capability = {
      name: "chatty",
      version: 1,
      methods: {},
      events: ["ok"],
      start: (emit) => {
        emit("ok", 1);
        emit("secret", 2);
        return () => {};
      },
    };
    createRegistry([chatty]).start((c, e) => sent.push(`${c}/${e}`));
    expect(sent).toEqual(["chatty/ok"]);
  });

  test("a call nobody answers fails with a timeout, and a closed peer fails at once", async () => {
    const [a] = memoryPair();
    const peer = createPeer({ channel: a, registry: createRegistry([]), timeoutMs: 30 });
    expect((await failure(peer.call("storage", "get", { key: "a" }))).code).toBe("timeout");
    peer.dispose();
    expect((await failure(peer.call("storage", "get"))).code).toBe("closed");
  });

  test("a method's own parser rejects bad arguments, and the error crosses with its code", async () => {
    const strict: Capability = { name: "strict", version: 1, methods: { ping: method(none, () => "pong") } };
    const { session } = await connectPair({ page: [strict, storageCapability({ store: memoryStore() })] });
    expect(await session.call("strict", "ping")).toBe("pong");
    expect((await failure(session.call("storage", "get", { key: "../etc" }))).code).toBe("bad-args");
  });
});

describe("storage", () => {
  test("keeps JSON per key, within the page's quota", async () => {
    const store: KeyValueStore = memoryStore();
    const { session } = await connectPair({ page: [storageCapability({ store, maxKeys: 2, maxBytes: 64 })] });
    const storage = storageApi(session);
    await storage.set("best", { score: 42, level: 3 });
    expect(await storage.get("best")).toEqual({ score: 42, level: 3 });
    expect(await storage.get("missing")).toBeNull();
    await storage.set("name", "Mario");
    expect((await failure(storage.set("third", 1))).code).toBe("quota");
    expect((await failure(storage.set("name", "x".repeat(80)))).code).toBe("bad-args");
    await storage.remove("name");
    expect(await storage.keys()).toEqual(["best"]);
  });
});

describe("events", () => {
  test("the page tells the game when it can no longer be seen", async () => {
    let tell: (visible: boolean) => void = () => {};
    const source: ViewportSource = {
      visible: () => true,
      watch: (l) => {
        tell = l;
        return () => {};
      },
      fullscreen: async () => {},
    };
    const { session } = await connectPair({ page: [viewportCapability({ source })] });
    const viewport = viewportApi(session);
    expect(await viewport.visible()).toBe(true);
    const seen: boolean[] = [];
    viewport.onVisibility((v) => seen.push(v));
    tell(false);
    await Bun.sleep(5);
    expect(seen).toEqual([false]);
  });
});

describe("the page calls the game (play-testing)", () => {
  test("input reaches the game's target and inspect reads the state it exposed", async () => {
    const keys: KeyInput[] = [];
    const inspect = inspectCapability({ snapshotter: { snapshot: async (w) => `data:image/jpeg;w=${w}` } });
    const { gameRemote } = await connectPair({
      page: [],
      inGame: [inspect.capability, inputCapability({ target: { key: (k) => keys.push(k), pointer: () => {} } })],
    });
    let x = 0;
    inspect.expose(() => ({ x, lives: 3 }));
    const input = inputApi(gameRemote);
    await input.press("ArrowRight", 1, async () => {
      x = 5;
    });
    expect(keys.map((k) => `${k.type}:${k.key}`)).toEqual(["down:ArrowRight", "up:ArrowRight"]);
    expect(await inspectApi(gameRemote).state()).toEqual({ x: 5, lives: 3 });
    expect(await inspectApi(gameRemote).snapshot(320)).toBe("data:image/jpeg;w=320");
  });
});

describe("libraries and assets", () => {
  const files: Record<string, string> = {
    "https://shop.vn/auvyx/assets/lib/three.js": "export const REVISION = '180';",
    "https://shop.vn/uploads/hero.png": "PNG",
  };
  const asked: RequestInit[] = [];
  const fetcher: Fetch = async (url, init) => {
    asked.push(init);
    const body = files[url];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  };

  test("a game gets only the libraries marked for the sandbox, as source it imports itself", async () => {
    const { session } = await connectPair({ page: [librariesCapability({ source: tableLibraries({ base: "https://shop.vn/auvyx/assets/", fetcher }) })] });
    const loaded: string[] = [];
    const libraries = librariesApi(session, {
      load: async (source) => {
        loaded.push(source);
        return { REVISION: "180" };
      },
    });
    expect(await libraries.list()).toContain("three");
    expect(await libraries.list()).not.toContain("gsap");
    expect(await libraries.get("three")).toEqual({ REVISION: "180" });
    await libraries.get("three");
    expect(loaded).toHaveLength(1);
    expect((await failure(libraries.get("gsap"))).code).toBe("not-found");
  });

  test("assets: only names in the manifest, fetched without cookies, within the size limit", async () => {
    asked.length = 0;
    const source = manifestAssets({
      assets: [
        { name: "hero.png", type: "image/png", url: "https://shop.vn/uploads/hero.png" },
        { name: "gone.png", type: "image/png", url: "https://shop.vn/uploads/gone.png" },
      ],
      fetcher,
      maxBytes: 10,
    });
    const { session } = await connectPair({ page: [assetsCapability({ source })] });
    const assets = assetsApi(session, { make: ({ type, bytes }) => `blob:${type}:${bytes.byteLength}` });
    expect((await assets.list()).map((a) => a.name)).toEqual(["hero.png", "gone.png"]);
    expect(await assets.url("hero.png")).toBe("blob:image/png:3");
    expect(asked.every((i) => i.credentials === "omit")).toBe(true);
    expect((await failure(assets.bytes("/wp-json/wp/v2/users"))).code).toBe("not-found");
    expect((await failure(assets.bytes("gone.png"))).code).toBe("not-found");
  });
});

describe("parity with the sites' builders", () => {
  test("the TS policy equals shared/fixtures/play/cases.json (as Scala and PHP do)", async () => {
    const fixtures: { policies: { siteOrigin: string; runtimeOrigin: string; expected: string }[] } = await Bun.file(
      new URL("../../../shared/fixtures/play/cases.json", import.meta.url)
    ).json();
    for (const p of fixtures.policies) expect(contentSecurityPolicy(p)).toBe(p.expected);
  });
});

describe("input codes", () => {
  test("a key's code is what a keyboard gives", async () => {
    const { codeOf } = await import("./adapters/dom");
    expect([" ", "a", "D", "7", "ArrowRight", "Enter"].map(codeOf)).toEqual(["Space", "KeyA", "KeyD", "Digit7", "ArrowRight", "Enter"]);
  });
});
