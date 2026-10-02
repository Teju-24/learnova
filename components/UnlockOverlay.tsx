"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lock, LockOpen, Sparkles } from "lucide-react";

/**
 * How long the sequence runs before the caller reveals the result card.
 * The stages inside it finish by 2000ms; the tail is dead time so the
 * "Unlocked!" line is readable before the overlay steps aside.
 */
const COMPLETE_AT_MS = 2200;

const SPARKLE_COUNT = 10;
const SPARKLE_BURST_AT = 1.4;
const SPARKLE_TRAVEL = 88;

type Props = {
  show: boolean;
  onComplete: () => void;
  /** The concept just passed. Named in the confirmation line. */
  conceptTitle: string;
};

export default function UnlockOverlay({ show, onComplete, conceptTitle }: Props) {
  const reduceMotion = useReducedMotion();

  // Held in a ref so a caller passing an inline arrow cannot restart the
  // timer by re-rendering: the effect below depends on `show` alone.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current(),
      COMPLETE_AT_MS
    );
    return () => window.clearTimeout(timer);
  }, [show]);

  // Fixed fan of angles, so the burst is identical on every replay.
  const sparks = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, i) => {
        const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
        return {
          id: i,
          x: Math.cos(angle) * SPARKLE_TRAVEL,
          y: Math.sin(angle) * SPARKLE_TRAVEL,
          size: 5 + (i % 3) * 2,
        };
      }),
    []
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Next concept unlocked after ${conceptTitle}`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.25, ease: "easeOut" }}
        >
          <div className="relative flex flex-col items-center text-center">
            {/* Halo that blooms once the lock opens. */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0) 70%)",
              }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1.5, opacity: [0, 0.9, 0.55] }}
              transition={{
                duration: reduceMotion ? 0.2 : 1.1,
                delay: reduceMotion ? 0 : 0.75,
                times: [0, 0.35, 1],
                ease: "easeOut",
              }}
            />

            {/* Sparkle burst, radiating from the lock. */}
            {sparks.map((s) => (
              <motion.span
                key={s.id}
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: s.size,
                  height: s.size,
                  marginLeft: -s.size / 2,
                  marginTop: -s.size / 2,
                  backgroundColor: "var(--gold)",
                  boxShadow: "0 0 8px rgba(245,158,11,0.8)",
                }}
                initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                animate={{
                  x: s.x,
                  y: s.y,
                  scale: [0.3, 1, 1, 0.5],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: reduceMotion ? 0.2 : 0.7,
                  delay: reduceMotion ? 0 : SPARKLE_BURST_AT,
                  times: [0, 0.2, 0.5, 1],
                  ease: "easeOut",
                }}
              />
            ))}

            {/* Stage 1: locked, scaling up and rattling.
                Stage 2: shackle springs off into the open state. */}
            <span className="relative flex h-24 w-24 items-center justify-center">
              <motion.span
                className="absolute flex h-24 w-24 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--primary-soft)" }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={
                  reduceMotion
                    ? { scale: 1, opacity: 1 }
                    : {
                        scale: [0.6, 1.15, 1],
                        opacity: 1,
                        rotate: [0, -7, 7, -5, 5, 0],
                      }
                }
                transition={{
                  duration: reduceMotion ? 0.2 : 0.8,
                  times: [0, 0.55, 1],
                  ease: "easeOut",
                }}
              />

              <motion.span
                className="absolute text-primary"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{
                  duration: reduceMotion ? 0.1 : 0.22,
                  delay: reduceMotion ? 0.1 : 0.8,
                  ease: "easeIn",
                }}
              >
                <Lock size={40} />
              </motion.span>

              <motion.span
                className="absolute text-primary"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0.15, delay: 0.1 }
                    : {
                        type: "spring",
                        stiffness: 420,
                        damping: 12,
                        mass: 0.7,
                        delay: 0.8,
                      }
                }
              >
                <LockOpen size={40} />
              </motion.span>
            </span>

            <motion.p
              className="mt-6 font-heading text-lg text-white"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0.15 : 0.3,
                delay: reduceMotion ? 0 : 0.15,
                ease: "easeOut",
              }}
            >
              Unlocking next concept...
            </motion.p>

            {/* Stage 3: confirmation, in from 1.2s. */}
            <motion.div
              className="mt-2 flex flex-col items-center"
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0.15, delay: 0.2 }
                  : {
                      type: "spring",
                      stiffness: 320,
                      damping: 22,
                      delay: 1.2,
                    }
              }
            >
              <p className="flex items-center gap-2 font-heading text-2xl text-white">
                <Sparkles size={22} className="text-gold" />
                Unlocked!
              </p>
              <p className="mt-1 text-sm text-white/70">{conceptTitle}</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
