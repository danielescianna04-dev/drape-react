import * as React from "react";
import { Link, LinkProps } from "react-router-dom";

/**
 * SafeLink — drop-in replacement for react-router Link that warns in dev mode
 * when the "to" prop points to a suspicious target (empty, "#", or undefined).
 */
const SafeLink = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, children, ...props }, ref) => {
    if (process.env.NODE_ENV === 'development') {
      const target = typeof to === 'string' ? to : '';
      if (!target || target === '#' || target === '') {
        const label = typeof children === 'string' ? children : 'unknown';
        console.error(`[Drape] Dead link detected: "${label}" points to "${target}". Use a real route path.`);
      }
    }
    return <Link ref={ref} to={to} {...props}>{children}</Link>;
  }
);
SafeLink.displayName = "SafeLink";
export { SafeLink };
