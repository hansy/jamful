import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "#/lib/utils";

export function SiteHeader({
  children,
  maxWidth = "max-w-6xl",
}: {
  children?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full items-center justify-between px-6 py-5",
        maxWidth,
      )}
    >
      <Link to="/" className="text-lg font-semibold tracking-tight">
        jamful
      </Link>
      {children ? <nav className="flex items-center gap-2">{children}</nav> : null}
    </header>
  );
}
