"use client";
import * as React from "react";
import { Button, ButtonProps } from "./button";

/**
 * SafeButton — drop-in replacement for Button that warns in dev mode
 * when onClick is missing or empty. Helps catch dead buttons during
 * AI generation before the user sees them.
 */
const SafeButton = React.forwardRef<HTMLButtonElement, ButtonProps & { onClick?: (() => void) | undefined }>(
  ({ onClick, children, type, disabled, ...props }, ref) => {
    if (process.env.NODE_ENV === 'development' && !onClick && type !== 'submit' && !disabled) {
      const label = typeof children === 'string' ? children : 'unknown';
      console.error(`[Drape] Dead button detected: "${label}" has no onClick handler. Add a real handler or remove the button.`);
    }
    return <Button ref={ref} onClick={onClick} type={type} disabled={disabled} {...props}>{children}</Button>;
  }
);
SafeButton.displayName = "SafeButton";
export { SafeButton };
