"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";

type Props = {
  nextHref: string;
  nextTitle: string;
};

/**
 * Listens for the SequencePlayer completion event and reveals the
 * "Next concept" CTA. Also shows a quieter link before completion.
 */
export default function LessonCompleteNav({ nextHref, nextTitle }: Props) {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    function onComplete() {
      setComplete(true);
    }
    window.addEventListener("learnova:lesson-complete", onComplete);
    return () => {
      window.removeEventListener("learnova:lesson-complete", onComplete);
    };
  }, []);

  if (complete) {
    return (
      <section className="card flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <Trophy size={28} className="text-success" />
        </span>
        <p className="mt-3 font-heading text-2xl">Ready for the next concept?</p>
        <div className="mt-4 flex justify-center">
          <Link href={nextHref} className="btn-primary">
            Next concept <ArrowRight size={16} /> {nextTitle}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex justify-end">
      <Link
        href={nextHref}
        className="flex items-center gap-1 text-sm text-inkmuted underline-offset-2 transition-colors hover:text-ink hover:underline"
        style={{ textDecoration: "none" }}
      >
        Next concept <ArrowRight size={14} /> {nextTitle}
      </Link>
    </div>
  );
}