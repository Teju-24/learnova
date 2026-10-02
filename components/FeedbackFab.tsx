"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import FeedbackModal from "@/components/FeedbackModal";

type Props = {
  conceptsCompleted: number;
  /** Display name, threaded through so the check-in is personalized. */
  learnerName?: string;
};

/**
 * The floating Feedback button: available on /me at all times, not only at a
 * feedback checkpoint.
 */
export default function FeedbackFab({ conceptsCompleted, learnerName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
        style={{
          backgroundColor: "var(--primary)",
          boxShadow: "0 8px 20px rgba(91,79,233,0.35)",
        }}
      >
        <MessageSquare size={16} />
        Feedback
      </button>

      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        conceptsCompleted={conceptsCompleted}
        learnerName={learnerName}
      />
    </>
  );
}