import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import './search-input.css';

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  clearLabel: string;
  onClear?: () => void;
  wrapperClassName?: string;
};

/** Clearable search with a stable input and focus preserved for the next query. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, clearLabel, onClear, wrapperClassName = '', ...props }, ref,
) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const clear = () => { onValueChange(''); onClear?.(); input.current?.focus(); };
  return <span className={`wk-search-input ${wrapperClassName}`.trim()} data-filled={!!value}>
    <input {...props} ref={input} value={value} onChange={event => onValueChange(event.target.value)} />
    {value && <IconButton className="wk-search-clear" label={clearLabel} disabled={props.disabled || props.readOnly} onClick={clear}>
      <X size={16} aria-hidden="true" />
    </IconButton>}
  </span>;
});
