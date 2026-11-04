import { __ } from "@wordpress/i18n";
import { AddPanel } from "./add-panel";
import { Canvas } from "./canvas";
import { ComponentsPanel } from "./components-panel";
import { Inspector } from "./inspector";
import { Layers } from "./layers";
import { useBuilder, type LeftTab } from "./store";
import { TopBar } from "./top-bar";

const TABS: { id: LeftTab; label: string }[] = [
  { id: "layers", label: __("Layers", "auvyx-builder") },
  { id: "add", label: __("Add", "auvyx-builder") },
  { id: "components", label: __("Components", "auvyx-builder") },
];

export function App() {
  const { state, dispatch } = useBuilder();
  return (
    <div className="auvyx-vb">
      <TopBar />
      <aside className="auvyx-vb-left">
        <div className="auvyx-vb-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={state.leftTab === tab.id}
              className={state.leftTab === tab.id ? "is-active" : ""}
              onClick={() => dispatch({ type: "left-tab", tab: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="auvyx-vb-left__body">
          {state.leftTab === "layers" && <Layers />}
          {state.leftTab === "add" && <AddPanel />}
          {state.leftTab === "components" && <ComponentsPanel />}
        </div>
      </aside>
      <main className="auvyx-vb-center">
        <Canvas />
      </main>
      <aside className="auvyx-vb-right">
        <Inspector />
      </aside>
    </div>
  );
}
