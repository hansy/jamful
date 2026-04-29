"use client";

import { createFileRoute } from "@tanstack/react-router";
import { PRODUCT_METADATA } from "@jamful/shared";
import { ExternalLink, Plus } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#/components/ui/accordion";
import { SiteFooter } from "#/components/site-footer";
import { SiteHeader } from "#/components/site-header";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

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

function Home() {
  const extensionLinkClassName = cn(buttonVariants({ size: "lg" }));

  return (
    <main className="min-h-screen">
      <SiteHeader>
        <a
          className={cn(buttonVariants())}
          href={PRODUCT_METADATA.chromeStoreUrl}
          rel="noreferrer"
          target="_blank"
        >
          <Plus data-icon="inline-start" />
          Add extension
        </a>
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
            <a
              className={extensionLinkClassName}
              href={PRODUCT_METADATA.chromeStoreUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Plus data-icon="inline-start" />
              Add extension
            </a>
            <a
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              href="https://vibej.am"
            >
              Vibe Jam 2026
              <ExternalLink data-icon="inline-end" />
            </a>
          </div>
        </div>

        <div id="extension" className="relative">
          <img
            src={PRODUCT_METADATA.extensionPreviewPath}
            alt="Jamful browser extension preview showing four active game sessions"
            className="w-full rounded-3xl border border-border bg-muted/30 shadow-2xl"
          />
        </div>
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
