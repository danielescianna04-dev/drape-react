"use client";
import * as React from "react";
import Link, { LinkProps } from "next/link";

/**
 * SafeLink — drop-in replacement for next/link that warns in dev mode
 * when href is empty, "#", or undefined.
 */
const SafeLink = React.forwardRef<HTMLAnchorElement, LinkProps & { children?: React.ReactNode }>(
  ({ href, children, ...props }, ref) => {
    if (process.env.NODE_ENV === 'development') {
      const target = typeof href === 'string' ? href : '';
      if (!target || target === '#' || target === '') {
        const label = typeof children === 'string' ? children : 'unknown';
        console.error(`[Drape] Dead link detected: "${label}" points to "${target}". Use a real route path.`);
      }
    }
    return <Link ref={ref} href={href} {...props}>{children}</Link>;
  }
);
SafeLink.displayName = "SafeLink";
export { SafeLink };
