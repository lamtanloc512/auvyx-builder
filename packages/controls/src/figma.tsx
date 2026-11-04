/**
 * Compact, Figma-like controls. Same contract as the other fields:
 * `value` = set at the current target, `placeholder` = inherited, undefined = unset.
 */
import { Button, TextControl } from "@wordpress/components";
import type { ReactNode } from "react";
import { scrubHandlers, scrubValue, type ScrubOptions } from "./scrub";

export type FieldState = {
  value?: string;
  placeholder?: string;
  onChange: (value: string | undefined) => void;
};

/** Text field whose label scrubs the number (drag left/right). */
export function ScrubField({
  label,
  value,
  placeholder,
  help,
  onChange,
  scrub,
}: FieldState & { label: string; help?: string; scrub?: ScrubOptions }) {
  const start = value;
  return (
    <div className="auvyx-scrub-field">
      <span
        className="auvyx-field__label auvyx-scrub-field__label"
        title="Drag to change · Shift ×10 · Alt ×0.1"
        {...scrubHandlers((steps) => onChange(scrubValue(start, placeholder, steps, scrub)))}
      >
        {label}
      </span>
      <TextControl
        __next40pxDefaultSize
        __nextHasNoMarginBottom
        hideLabelFromVision
        label={label}
        help={help}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(next) => onChange(next === "" ? undefined : next)}
      />
    </div>
  );
}

/** Tiny inline number input used inside the box-model widget. */
function BoxInput({ value, placeholder, onChange, label }: FieldState & { label: string }) {
  const start = value;
  return (
    <input
      className={`auvyx-box__input${value === undefined ? " is-inherited" : ""}`}
      aria-label={label}
      title={`${label} · drag to change, click to type`}
      value={value ?? ""}
      placeholder={placeholder === undefined ? "–" : placeholder.replace(/px$/, "")}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
      {...scrubHandlers((steps) => onChange(scrubValue(start, placeholder, steps, { min: label.startsWith("Padding") ? 0 : undefined })), {
        focusOnClick: true,
      })}
    />
  );
}

export type SideFields = { top: FieldState; right: FieldState; bottom: FieldState; left: FieldState };

/** Margin box around a padding box around the element, like Figma/DevTools. */
export function BoxModel({ margin, padding, center }: { margin: SideFields; padding: SideFields; center?: ReactNode }) {
  const ring = (name: string, fields: SideFields, inner: ReactNode) => (
    <div className={`auvyx-box auvyx-box--${name.toLowerCase()}`}>
      <span className="auvyx-box__caption">{name}</span>
      <div className="auvyx-box__top">
        <BoxInput label={`${name} top`} {...fields.top} />
      </div>
      <div className="auvyx-box__left">
        <BoxInput label={`${name} left`} {...fields.left} />
      </div>
      <div className="auvyx-box__inner">{inner}</div>
      <div className="auvyx-box__right">
        <BoxInput label={`${name} right`} {...fields.right} />
      </div>
      <div className="auvyx-box__bottom">
        <BoxInput label={`${name} bottom`} {...fields.bottom} />
      </div>
    </div>
  );
  return ring("Margin", margin, ring("Padding", padding, <div className="auvyx-box__content">{center}</div>));
}

export type MatrixValue = { x?: 0 | 1 | 2; y?: 0 | 1 | 2 };

/** 3×3 alignment picker (Figma auto layout). */
export function AlignmentMatrix({
  value,
  onChange,
  label = "Alignment",
}: {
  value: MatrixValue;
  onChange: (x: 0 | 1 | 2, y: 0 | 1 | 2) => void;
  label?: string;
}) {
  const cells: (0 | 1 | 2)[] = [0, 1, 2];
  return (
    <div className="auvyx-matrix" role="group" aria-label={label}>
      {cells.map((y) =>
        cells.map((x) => (
          <button
            key={`${x}${y}`}
            type="button"
            className={`auvyx-matrix__cell${value.x === x && value.y === y ? " is-active" : ""}${
              value.x === x || value.y === y ? " is-axis" : ""
            }`}
            aria-label={`${["Start", "Center", "End"][x]} / ${["Top", "Middle", "Bottom"][y]}`}
            aria-pressed={value.x === x && value.y === y}
            onClick={() => onChange(x, y)}
          >
            <span />
          </button>
        ))
      )}
    </div>
  );
}

export type SegmentOption = { value: string; label: string; icon?: JSX.Element };

/** Row of pressed/unpressed buttons (stable API, no __experimental ToggleGroup). */
export function Segmented({
  options,
  value,
  inherited,
  onChange,
  label,
}: {
  options: readonly SegmentOption[];
  value?: string;
  inherited?: string;
  onChange: (value: string | undefined) => void;
  label: string;
}) {
  return (
    <div className="auvyx-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="compact"
          icon={option.icon}
          label={option.icon ? option.label : undefined}
          showTooltip={option.icon !== undefined}
          isPressed={value === option.value}
          className={value === undefined && inherited === option.value ? "is-inherited" : undefined}
          onClick={() => onChange(value === option.value ? undefined : option.value)}
        >
          {option.icon ? undefined : option.label}
        </Button>
      ))}
    </div>
  );
}
