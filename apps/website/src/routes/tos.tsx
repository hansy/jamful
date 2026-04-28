import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SiteFooter } from "#/components/site-footer"
import { SiteHeader } from "#/components/site-header"
import { Separator } from "#/components/ui/separator"

export const Route = createFileRoute("/tos")({ component: TermsPage })

function TermsPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader maxWidth="max-w-4xl" />

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Last updated April 28, 2026</p>
          <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-lg leading-8 text-muted-foreground">
            These terms describe the basic rules for using Jamful, a browser
            extension and API for sharing current web-game activity.
          </p>
        </div>

        <TermsSection title="Using Jamful">
          <p>
            You may use Jamful to sign in with X, detect supported Vibe Jam 2026
            games, share your current presence with people who follow you on
            Jamful, and view activity from people you follow.
          </p>
          <p>
            You are responsible for your X account, your browser, and any
            activity performed through your Jamful session.
          </p>
        </TermsSection>

        <TermsSection title="Supported games and third-party services">
          <p>
            Jamful only detects games from its supported game registry, currently
            games submitted through{" "}
            <a className="underline underline-offset-4" href="https://vibej.am/2026">
              Vibe Jam 2026
            </a>
            .
          </p>
          <p>
            Games, X, GitHub, browser stores, and other third-party services are
            not controlled by Jamful. Their own terms and policies apply.
          </p>
        </TermsSection>

        <TermsSection title="Acceptable use">
          <p>
            Do not misuse Jamful, interfere with the service, attempt to access
            another user's account, scrape or overload the API, or use Jamful to
            harass others.
          </p>
        </TermsSection>

        <TermsSection title="Visibility controls">
          <p>
            Jamful includes an invisible mode that stops broadcasting your
            presence. If you are visible and on a supported game, people who
            follow you on Jamful may see what you are playing.
          </p>
        </TermsSection>

        <TermsSection title="Service availability">
          <p>
            Jamful is provided as-is and may change, break, or become
            unavailable. We may update, limit, or discontinue parts of the
            service as the product develops.
          </p>
        </TermsSection>

        <TermsSection title="Contact">
          <p>
            Questions or feedback can be sent to{" "}
            <a className="underline underline-offset-4" href="mailto:feedback@jamful.social">
              feedback@jamful.social
            </a>
            .
          </p>
        </TermsSection>
      </article>

      <SiteFooter maxWidth="max-w-4xl" />
    </main>
  )
}

function TermsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <Separator />
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-4 leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}
