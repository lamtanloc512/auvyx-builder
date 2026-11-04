/**
 * Generic inspector controls. Rules (ADR 0008):
 * - only stable, public @wordpress/components exports (no __experimental*);
 * - controlled components: `value` is what is set at the current target,
 *   `placeholder` is what the user would inherit; `undefined` means "unset".
 */
import { ColorPalette, SelectControl, TextControl } from "@wordpress/components";

export type FieldProps = {
  label: string;
  value?: string;
  placeholder?: string;
  help?: string;
  onChange: (value: string | undefined) => void;
};

export function ValueField({ label, value, placeholder, help, onChange }: FieldProps) {
  return (
    <TextControl
      __next40pxDefaultSize
      __nextHasNoMarginBottom
      className="auvyx-field"
      label={label}
      help={help}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(next) => onChange(next === "" ? undefined : next)}
    />
  );
}

export function SelectField({
  label,
  value,
  placeholder,
  help,
  options,
  onChange,
}: FieldProps & { options: readonly string[] }) {
  return (
    <SelectControl
      __next40pxDefaultSize
      __nextHasNoMarginBottom
      className="auvyx-field"
      label={label}
      help={help}
      value={value ?? ""}
      options={[
        { label: placeholder ? `— ${placeholder}` : "—", value: "" },
        ...options.map((option) => ({ label: option, value: option })),
      ]}
      onChange={(next: string) => onChange(next === "" ? undefined : next)}
    />
  );
}

export type ColorOption = { slug: string; name: string; color: string };

const PRESET_VAR = /^var\(--wp--preset--color--([a-z0-9-]+)\)$/;

/** Colors picked from the palette are stored as preset variables, so changing a token restyles every block. */
export function ColorField({
  label,
  value,
  placeholder,
  palette,
  onChange,
}: FieldProps & { palette: readonly ColorOption[] }) {
  const toDisplay = (raw: string | undefined) => {
    const slug = raw === undefined ? undefined : PRESET_VAR.exec(raw)?.[1];
    return slug === undefined ? raw : palette.find((option) => option.slug === slug)?.color ?? raw;
  };
  const toTokenName = (raw: string | undefined) => {
    const slug = raw === undefined ? undefined : PRESET_VAR.exec(raw)?.[1];
    return slug === undefined ? raw : palette.find((option) => option.slug === slug)?.name ?? raw;
  };
  return (
    <div className="auvyx-field auvyx-color-field">
      <span className="auvyx-field__label">{label}</span>
      <ColorPalette
        colors={palette.map(({ name, color }) => ({ name, color }))}
        value={toDisplay(value)}
        enableAlpha
        clearable
        onChange={(hex?: string) => {
          if (hex === undefined || hex === "") {
            onChange(undefined);
            return;
          }
          const token = palette.find((option) => option.color.toLowerCase() === hex.toLowerCase());
          onChange(token ? `var(--wp--preset--color--${token.slug})` : hex);
        }}
      />
      {value === undefined && placeholder !== undefined && (
        <span className="auvyx-field__inherited">↳ {toTokenName(placeholder)}</span>
      )}
    </div>
  );
}

export {
  AlignmentMatrix,
  BoxModel,
  ScrubField,
  Segmented,
  type FieldState,
  type MatrixValue,
  type SegmentOption,
  type SideFields,
} from "./figma";
export { scrubHandlers, scrubValue, type ScrubOptions } from "./scrub";
