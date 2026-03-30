import * as React from "react";
import { cn } from "@/app/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-14 w-14" };

function Avatar({ src, alt, fallback, size = "md", className, ...props }: AvatarProps) {
  return (
    <div className={cn("relative flex shrink-0 overflow-hidden rounded-full", sizes[size], className)} {...props}>
      {src ? (
        <img className="aspect-square h-full w-full object-cover" src={src} alt={alt || ""} />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium">
          {fallback || alt?.charAt(0)?.toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}

export { Avatar };
