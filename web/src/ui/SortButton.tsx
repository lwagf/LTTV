import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import "./SortButton.css";

export interface SortOption {
  value: string;
  label: string;
}

interface SortButtonProps {
  focusKey: string;
  options: SortOption[];
  value: string;
  onChange(value: string): void;
}

/** "Sort: <label>"; Select cycles to the next option. */
export function SortButton({ focusKey, options, value, onChange }: SortButtonProps) {
  const i = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const next = () => onChange(options[(i + 1) % options.length].value);
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: next });
  return (
    <button
      ref={ref}
      type="button"
      className={`sort-button${focused ? " focused" : ""}`}
      onClick={next}
    >
      Sort: {options[i].label}
    </button>
  );
}
