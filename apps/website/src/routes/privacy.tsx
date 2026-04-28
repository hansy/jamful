import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SiteFooter } from "#/components/site-footer"
import { SiteHeader } from "#/components/site-header"
import { Separator } from "#/components/ui/separator"

export const Route = createFileRoute("/privacy")({ component: PrivacyPage })

function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader maxWidth="max-w-4xl" />

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Last updated April 28, 2026</p>
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-lg leading-8 text-muted-foreground">
            Jamful is a browser extension that shows game activity from people
            you follow on Jamful. This page explains what information Jamful
            uses to make that work.
          </p>
        </div>

        <PolicySection title="Information we collect">
          <p>
            When you sign in with X, we receive your X user id, username, display
            name, profile image, OAuth tokens, and the scopes returned by X.
          </p>
          <p>
            The X access you grant Jamful is read-only. We ask for permission to
            read basic account details, read basic post information required by
            X sign-in, see who you follow, and keep you signed in without asking
            you to reconnect every time. Jamful does not ask for permission to
            post, like, follow, unfollow, or send messages on your behalf.
          </p>
          <p>
            When the extension detects that your active browser tab matches a
            supported Vibe Jam 2026 game, it sends Jamful the matched game id so
            your current presence can be shown to people who follow you on
            Jamful.
          </p>
          <p>
            Jamful stores follow relationships that you create inside Jamful,
            current presence state, and basic timestamps such as account
            creation, last login, and presence heartbeat times.
          </p>
        </PolicySection>

        <PolicySection title="What stays in your browser">
          <p>
            The extension stores your Jamful access token, X username, avatar
            URL, cached feed data, current self-presence state, and visibility
            setting in browser extension storage.
          </p>
          <p>
            The extension reads your active tab URL to check whether it matches a
            supported game. Jamful does not send arbitrary browsing history to
            the server.
          </p>
          <p>
            Jamful does not broadcast every site you visit. The extension only
            checks whether the current site is on Jamful's bundled allowlist of
            supported game sites, and only those matched game sites can become
            presence activity. You can inspect the current bundled list on{" "}
            <a
              className="underline underline-offset-4"
              href="https://github.com/hansy/jamful/blob/main/data/registry.v1.json"
            >
              GitHub
            </a>
            .
          </p>
        </PolicySection>

        <PolicySection title="How we use information">
          <p>
            We use this information to sign you in, detect supported games,
            broadcast your current game presence when you are visible, show your
            feed, let you follow or unfollow other Jamful users, and keep the
            extension toolbar current.
          </p>
        </PolicySection>

        <PolicySection title="Sharing">
          <p>
            People who follow you on Jamful may see your X username, profile
            image, and the supported game you are currently playing. Jamful does
            not sell your personal information.
          </p>
          <p>
            Jamful relies on X for sign-in and Cloudflare infrastructure for the
            API, database, queues, and presence coordination.
          </p>
        </PolicySection>

        <PolicySection title="Security and retention">
          <p>
            X refresh tokens are encrypted before being stored server-side. Your
            current presence is updated by heartbeat and is intended to represent
            recent activity, not a permanent gameplay history.
          </p>
          <p>
            We keep account, follow, and authentication records while your Jamful
            account is active or as needed to operate the service.
          </p>
        </PolicySection>

        <PolicySection title="Contact">
          <p>
            Questions or requests can be sent to{" "}
            <a className="underline underline-offset-4" href="mailto:feedback@jamful.social">
              feedback@jamful.social
            </a>
            .
          </p>
        </PolicySection>
      </article>

      <SiteFooter maxWidth="max-w-4xl" />
    </main>
  )
}

function PolicySection({
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
