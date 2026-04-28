"use client";

import { createFileRoute } from "@tanstack/react-router";
import {
  DEV_MOCK_CURRENT_USER_PRESENCE,
  DEV_MOCK_FEED_ENTRIES,
} from "@jamful/shared";
import { ChevronDown, ExternalLink, Play, Plus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { SiteFooter } from "#/components/site-footer";
import { SiteHeader } from "#/components/site-header";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const activity = DEV_MOCK_FEED_ENTRIES;

const faqs = [
  {
    question: "What sign-in methods do you support?",
    answer: <>Just X for now.</>,
  },
  {
    question: "After I sign in, do you show the people I already follow on X?",
    answer: (
      <>
        No. Unfortunately the X API makes syncing your existing social graph
        expensive, so for now, you have to manually find people who have already
        installed the extension to see what games they are playing.
      </>
    ),
  },
  {
    question: "What games are supported?",
    answer: (
      <>
        Only games submitted through{" "}
        <a className="underline underline-offset-4" href="https://vibej.am">
          Vibe Jam 2026
        </a>
        .
      </>
    ),
  },
  {
    question: "Where can I submit feedback?",
    answer: (
      <a
        className="underline underline-offset-4"
        href="mailto:feedback@jamful.social"
      >
        feedback@jamful.social
      </a>
    ),
  },
];

function getInitials(name: string) {
  return name.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function Home() {
  return (
    <main className="min-h-screen">
      <SiteHeader>
        <Button>
          <Plus data-icon="inline-start" />
          Add extension
        </Button>
      </SiteHeader>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1fr_520px] lg:py-20">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="secondary">Made for Vibe Jam 2026</Badge>
          <div className="flex flex-col gap-4">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-balance md:text-6xl">
              See what games the people you follow are playing.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground text-pretty">
              Jamful turns your browser into a game activity feed, so you can
              jump into the games the people you follow are playing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">
              <Plus data-icon="inline-start" />
              Add extension
            </Button>
            <a
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              href="https://vibej.am"
            >
              Vibe Jam 2026
              <ExternalLink data-icon="inline-end" />
            </a>
          </div>
        </div>

        <Card id="extension" className="bg-muted/30">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-muted-foreground/30" />
                <span className="size-3 rounded-full bg-muted-foreground/30" />
                <span className="size-3 rounded-full bg-muted-foreground/30" />
              </div>
              <div className="flex flex-1 items-center rounded-lg border bg-background px-3 py-2">
                <span className="h-2 w-24 rounded-full bg-muted" />
              </div>
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-lg border bg-background" />
                <span className="flex size-8 items-center justify-center rounded-lg border bg-primary text-primary-foreground">
                  <span className="size-3 rounded-sm bg-current" />
                </span>
              </div>
            </div>

            <div className="relative min-h-[460px] rounded-xl border bg-background">
              <div className="absolute left-6 top-6 flex max-w-52 flex-col gap-3">
                <span className="h-3 w-44 rounded-full bg-muted" />
                <span className="h-3 w-32 rounded-full bg-muted" />
                <span className="h-24 rounded-lg bg-muted/60" />
                <span className="h-24 rounded-lg bg-muted/60" />
              </div>

              <Card
                className="absolute right-4 top-4 w-[340px] bg-background shadow-lg"
                size="sm"
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar size="lg">
                        <AvatarImage
                          src={DEV_MOCK_CURRENT_USER_PRESENCE.user.avatar_url}
                          alt={DEV_MOCK_CURRENT_USER_PRESENCE.user.name}
                        />
                        <AvatarFallback>
                          {getInitials(
                            DEV_MOCK_CURRENT_USER_PRESENCE.user.name,
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="truncate">
                          {DEV_MOCK_CURRENT_USER_PRESENCE.user.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-green-500" />
                          Playing {DEV_MOCK_CURRENT_USER_PRESENCE.game.name}
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown className="text-muted-foreground" />
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary">Activity</Button>
                    <Button variant="ghost">Discover</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                      People you follow
                    </p>
                    <Badge variant="secondary">{activity.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-4">
                    {activity.map((item) => (
                      <div
                        key={item.session_id}
                        className="flex items-center justify-between gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative">
                            <Avatar size="lg">
                              <AvatarImage
                                src={item.friend.avatar_url}
                                alt={item.friend.name}
                              />
                              <AvatarFallback>
                                {getInitials(item.friend.name)}
                              </AvatarFallback>
                            </Avatar>
                            {item.game.name.includes("VR") ? (
                              <Badge className="absolute -right-2 -bottom-1 h-4 px-1 text-[10px]">
                                VR
                              </Badge>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {item.friend.name}
                            </p>
                            <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                              <span className="size-2 rounded-full bg-green-500" />
                              Playing {item.game.name}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label={`Join ${item.friend.name}`}
                        >
                          <Play />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="mb-10 text-center text-4xl font-semibold tracking-tight md:text-5xl">
          FAQ
        </h2>
        <Accordion
          defaultValue={faqs[0] ? [faqs[0].question] : []}
          className="border-t"
        >
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="py-6 text-lg font-semibold no-underline hover:no-underline md:text-xl">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base leading-7 text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <SiteFooter />
    </main>
  );
}
