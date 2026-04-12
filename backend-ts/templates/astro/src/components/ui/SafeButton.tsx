import * as React from "react";

/**
 * SafeButton for Astro React islands — warns when onClick is missing.
 */
export const SafeButton = ({
  onClick,
  children,
  type,
  disabled,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  if (import.meta.env.DEV && !onClick && type !== 'submit' && !disabled) {
    const label = typeof children === 'string' ? children : 'unknown';
    console.error(`[Drape] Dead button detected: "${label}" has no onClick handler.`);
  }
  return (
    <button onClick={onClick} type={type || 'button'} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  );
};
