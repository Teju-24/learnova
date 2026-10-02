"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Trophy } from "lucide-react";

export type ToastVariant = "default" | "badge" | "spark";

type ToastDetail = {
  message: string;
  variant?: ToastVariant;
};

type ToastItem = ToastDetail & { id: number };

export default function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      const variant = detail.variant ?? "default";
      setItems((prev) => [...prev, { id, message: detail.message, variant }]);
      const duration = variant === "badge" ? 5000 : 3000;
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    window.addEventListener("learnova:toast", onToast);
    return () => window.removeEventListener("learnova:toast", onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
    >
      <AnimatePresence>
        {items.map((item) => {
          const isBadge = item.variant === "badge";
          const isSpark = item.variant === "spark";

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold shadow-xl ${
                isBadge
                  ? "text-ink"
                  : isSpark
                    ? "text-white"
                    : "text-white"
              }`}
              style={{
                backgroundColor: isBadge
                  ? "var(--gold-soft)"
                  : isSpark
                    ? "var(--sparks)"
                    : "var(--ink)",
                border: isBadge ? "1px solid rgba(245,158,11,0.35)" : "none",
              }}
            >
              {isBadge && <Trophy size={16} className="text-gold" />}
              {isSpark && <Sparkles size={16} />}
              {!isBadge && !isSpark ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--success)" }}
                />
              ) : null}
              {item.message}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function fireToast(message: string, variant?: ToastVariant) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("learnova:toast", {
      detail: { message, variant },
    })
  );
}