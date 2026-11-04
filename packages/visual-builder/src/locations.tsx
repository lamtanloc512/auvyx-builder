import { Button, SelectControl, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { trash } from "@wordpress/icons";
import type { LocationRule } from "./config";
import { useBuilder } from "./store";

const RULES: { value: LocationRule["rule"]; label: string }[] = [
  { value: "all", label: __("Entire site", "auvyx-builder") },
  { value: "front", label: __("Front page", "auvyx-builder") },
  { value: "singular", label: __("Single posts of type…", "auvyx-builder") },
  { value: "ids", label: __("Specific pages/posts (IDs)", "auvyx-builder") },
  { value: "archive", label: __("Archives", "auvyx-builder") },
  { value: "blog", label: __("Blog and its posts", "auvyx-builder") },
  { value: "terms", label: __("In categories or tags", "auvyx-builder") },
  { value: "search", label: __("Search results", "auvyx-builder") },
  { value: "notfound", label: __("Page not found (404)", "auvyx-builder") },
];

/** Where a component is displayed (Flatsome-style "UX Block" placement). */
export function LocationsEditor() {
  const { state, config, dispatch } = useBuilder();
  const set = (locations: LocationRule[]) => dispatch({ type: "locations", locations });
  const update = (index: number, patch: Partial<LocationRule>) =>
    set(state.locations.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const options = Object.entries(config.locationOptions);

  return (
    <div className="auvyx-vb-stack">
      {state.locations.map((item, index) => (
        <div key={index} className="auvyx-vb-location">
          <SelectControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Position", "auvyx-builder")}
            value={item.location}
            options={options.map(([value, label]) => ({ value, label }))}
            onChange={(location: string) => update(index, { location })}
          />
          <SelectControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label={__("Show on", "auvyx-builder")}
            value={item.rule}
            options={RULES}
            onChange={(rule: string) => update(index, { rule: rule as LocationRule["rule"] })}
          />
          {(item.rule === "singular" || item.rule === "archive") && (
            <TextControl
              __next40pxDefaultSize
              __nextHasNoMarginBottom
              label={__("Post types (comma separated)", "auvyx-builder")}
              value={item.postTypes.join(", ")}
              placeholder="post, page, product"
              onChange={(value) => update(index, { postTypes: value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          )}
          {item.rule === "ids" && (
            <TextControl
              __next40pxDefaultSize
              __nextHasNoMarginBottom
              label={__("IDs (comma separated)", "auvyx-builder")}
              value={item.ids.join(", ")}
              onChange={(value) => update(index, { ids: value.split(",").map((s) => Number(s.trim())).filter((n) => n > 0) })}
            />
          )}
          <Button size="small" isDestructive icon={trash} label={__("Remove", "auvyx-builder")} onClick={() => set(state.locations.filter((_, i) => i !== index))} />
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => set([...state.locations, { location: options[0]?.[0] ?? "after_content", rule: "all", postTypes: [], ids: [] }])}
      >
        {__("Add location", "auvyx-builder")}
      </Button>
    </div>
  );
}
