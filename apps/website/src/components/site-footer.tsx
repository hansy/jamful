import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import { cn } from "#/lib/utils";

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.16 1.18A10.97 10.97 0 0 1 12 6.1c.98 0 1.95.13 2.87.38 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.13v3.15c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function SiteFooter({ maxWidth = "max-w-6xl" }: { maxWidth?: string }) {
  return (
    <footer
      className={cn(
        "mx-auto flex w-full items-center justify-between gap-6 px-6 py-8 text-sm text-muted-foreground",
        maxWidth,
      )}
    >
      <p>© {new Date().getFullYear()} jamful</p>
      <div className="flex items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "ghost" }))} to="/privacy">
          Privacy Policy
        </Link>
        <Link className={cn(buttonVariants({ variant: "ghost" }))} to="/tos">
          Terms of Service
        </Link>
        <a
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          href="https://github.com/hansy/jamful"
          aria-label="Jamful on GitHub"
        >
          <GitHubIcon />
        </a>
      </div>
    </footer>
  );
}
