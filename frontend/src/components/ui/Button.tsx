import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { BrandMark } from '../brand/BrandMark';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'default' | 'compact';
  loading?: boolean;
  loadingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'default', className = '', type = 'button', loading = false,
    loadingLabel, children, disabled, ...props }, ref,
) {
  return <button ref={ref} type={type} {...props} disabled={disabled || loading} aria-busy={loading || undefined}
    className={`wk-button wk-button--${variant} wk-button--${size}${loading ? ' wk-button--loading' : ''} ${className}`.trim()}>
    <span className="wk-button-content" aria-hidden={loading || undefined}>{children}</span>
    <span className="wk-button-progress" aria-hidden={!loading || undefined}><BrandMark motion={loading ? 'loading' : 'still'} /><span className={loadingLabel ? undefined : "wk-sr-only"}>{loadingLabel ?? "Working…"}</span></span>
  </button>;
});

export function IconButton({ label, ...props }: ButtonProps & { label: string }) {
  return <Button variant="quiet" size="compact" title={label} {...props} className={`wk-icon-button ${props.className ?? ''}`.trim()} aria-label={label} />;
}
