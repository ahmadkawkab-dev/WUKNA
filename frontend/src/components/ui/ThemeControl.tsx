import { useId } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { setThemePreference, useThemePreference } from '../../theme';

const options = [
  { value: 'system', label: 'System', Icon: Laptop },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function ThemeControl() {
  const preference = useThemePreference();
  const name = useId();
  return (
    <fieldset className="wk-theme-control">
      <legend>Theme</legend>
      <div className="wk-theme-options">
        {options.map(({ value, label, Icon }) => (
          <label key={value}>
            <input type="radio" name={name} value={value} checked={preference === value} onChange={() => setThemePreference(value)} />
            <span><Icon size={16} aria-hidden="true" />{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
