"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Lock, Play, Search, X } from "lucide-react";
import type { ConceptStatus } from "@/lib/learner";
import { fadeInUp } from "@/lib/motion";

export type GlossaryEntry = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: number;
  /** Resolved to titles on the server; ids would be meaningless to a reader. */
  prerequisiteTitles: string[];
  status: ConceptStatus;
  unlocked: boolean;
};

/**
 * Difficulty bands. The labels describe how the curriculum sequences itself,
 * not subject boundaries — tokenization sits at 3 and RAG at 4 because that is
 * where the graph puts them, so the headings stay narrow rather than claiming
 * a taxonomy the data does not support.
 */
const GROUPS: { key: string; title: string; hint: string; test: (d: number) => boolean }[] = [
  { key: "foundations", title: "Foundations", hint: "Start here", test: (d) => d <= 2 },
  { key: "core", title: "Core ML", hint: "The middle of the graph", test: (d) => d === 3 },
  { key: "deep", title: "Deep Learning", hint: "Networks and retrieval", test: (d) => d === 4 },
  { key: "advanced", title: "Advanced", hint: "The end of the graph", test: (d) => d >= 5 },
];

const STATUS_STYLES: Record<
  ConceptStatus,
  { label: string; className: string; icon: typeof Check }
> = {
  mastered: { label: "Mastered", className: "bg-success-soft text-success", icon: Check },
  completed: { label: "Completed", className: "bg-primary-soft text-primary", icon: Check },
  in_progress: { label: "In progress", className: "bg-warning-soft text-warning", icon: Play },
  new: { label: "New", className: "bg-bgsubtle text-inkmuted", icon: Play },
  locked: { label: "Locked", className: "bg-bgsubtle text-inkfaint", icon: Lock },
};

type Props = {
  entries: GlossaryEntry[];
  /** Drives the "signed in as" hint and whether status badges mean anything. */
  signedIn: boolean;
};

export default function GlossaryView({ entries, signedIn }: Props) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((e) =>
      `${e.title} ${e.summary} ${e.prerequisiteTitles.join(" ")}`
        .toLowerCase()
        .includes(needle)
    );
  }, [entries, needle]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: filtered.filter((e) => group.test(e.difficulty)),
      })).filter((group) => group.items.length > 0),
    [filtered]
  );

  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkfaint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search concepts, topics, or prerequisites…"
          aria-label="Search concepts"
          className="w-full rounded-lg border border-bgsubtle bg-bgcard py-2.5 pl-9 pr-9 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-inkfaint hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-inkmuted" role="status">
        {needle
          ? `${filtered.length} of ${entries.length} concepts`
          : `${entries.length} concepts`}
        {!signedIn && " · sign in to see your progress"}
      </p>

      {grouped.length === 0 ? (
        <p className="mt-10 text-center text-inkmuted">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.key} className="mt-10">
            <div className="flex items-baseline gap-3">
              <h2 className="font-heading text-xl">{group.title}</h2>
              <span className="text-xs uppercase tracking-wide text-inkfaint">
                {group.hint}
              </span>
            </div>

            <motion.ul
              className="mt-4 space-y-2"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.03 } } }}
            >
              {group.items.map((entry) => {
                const style = STATUS_STYLES[entry.status];
                const Icon = style.icon;

                const rowClass = `flex w-full items-start gap-3 rounded-lg border border-bgsubtle bg-bgcard px-3 py-3 text-left transition-colors ${
                  entry.unlocked
                    ? "hover:bg-bgsubtle"
                    : "cursor-not-allowed opacity-60"
                }`;

                const body = (
                  <>
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        entry.status === "mastered"
                          ? "bg-success-soft"
                          : "bg-bgsubtle"
                      }`}
                    >
                      <Icon
                        size={14}
                        className={
                          entry.status === "mastered"
                            ? "text-success"
                            : entry.status === "locked"
                              ? "text-inkfaint"
                              : "text-inkmuted"
                        }
                        strokeWidth={2.5}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-base font-bold">
                          {entry.title}
                        </span>
                        <span className="rounded-sm bg-bgsubtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                          Lv {entry.difficulty}
                        </span>
                        <span
                          className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}
                        >
                          {style.label}
                        </span>
                      </span>

                      <span className="mt-1 block text-sm text-inkmuted">
                        {entry.summary}
                      </span>

                      {entry.prerequisiteTitles.length > 0 && (
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-inkfaint">Needs</span>
                          {entry.prerequisiteTitles.map((title) => (
                            <span
                              key={title}
                              className="chip bg-bgsubtle text-inkmuted text-xs"
                            >
                              {title}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </>
                );

                return (
                  <motion.li key={entry.id} variants={fadeInUp}>
                    {entry.unlocked ? (
                      // A real link, so middle-click, open-in-new-tab and
                      // "copy link address" all work on an open concept.
                      <Link
                        href={`/me/lesson/${entry.id}`}
                        className={rowClass}
                        style={{ textDecoration: "none" }}
                      >
                        {body}
                      </Link>
                    ) : (
                      // Locked stays a button: it has to be inert but still
                      // able to explain why, and announce itself as disabled.
                      <button
                        type="button"
                        aria-disabled="true"
                        title="Complete prerequisites first"
                        className={rowClass}
                      >
                        {body}
                      </button>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          </section>
        ))
      )}
    </div>
  );
}
