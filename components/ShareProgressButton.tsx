"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { fireToast } from "@/components/Toast";

/**
 * The subset of a badge this card needs. `ProfileBadge` satisfies it
 * structurally, so the profile page can hand over the array it already built
 * rather than this component re-deriving which badges are unlocked.
 */
export type ShareableBadge = {
  id: string;
  name: string;
  /** A lucide icon name, as stored on the badge. See BADGES in lib/gamification. */
  icon: string;
  unlocked: boolean;
};

type Props = {
  learnerName: string;
  sparks: number;
  currentStreak: number;
  conceptsMastered: number;
  badges: ShareableBadge[];
};

/** 1200x630 is the standard Open Graph size, which Twitter/LinkedIn crop to. */
const W = 1200;
const H = 630;

/**
 * Fallbacks, matching app/globals.css. The real tokens are read off
 * documentElement at draw time so the card cannot drift from the theme, and
 * these only apply if the stylesheet has not loaded (or in a test harness).
 */
const FALLBACK = {
  primary: "#5B4FE9",
  sparks: "#8B5CF6",
};

const WHITE = "255, 255, 255";

/** At most this many badges, so the row never crowds the stats. */
const MAX_BADGES = 4;

/**
 * Canvas cannot render a lucide component, and the badge records only carry the
 * icon's *name*. Emoji is the fallback the rest of the app already anticipates
 * for these ("rendered as emoji fallback" in lib/gamification).
 */
const BADGE_EMOJI: Record<string, string> = {
  Footprints: "🦶",
  Flame: "🔥",
  Trophy: "🏆",
  Code2: "💻",
  Star: "⭐",
  GraduationCap: "🎓",
  Waves: "🌊",
  Compass: "🧭",
};

const EMOJI_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const HEADING_STACK = '"Fraunces", Georgia, "Times New Roman", serif';
const UI_STACK = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Wait for the app's webfonts, then report whether a family actually resolved.
 *
 * `document.fonts.load` is the part that matters: the page's own text is already
 * painted by the time someone clicks Share, but canvas picks fonts up through a
 * different path and will silently fall back to a serif mid-word if the face is
 * not resident. Failures are swallowed — a system-serif heading is a much better
 * outcome than a card that does not download.
 */
async function fontAvailable(family: string, spec: string): Promise<boolean> {
  try {
    await document.fonts.load(spec, "Aa");
    return document.fonts.check(spec, "Aa");
  } catch {
    return false;
  }
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** roundedRect is recent; fall back to an arc-built path where it is missing. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Shrink, then ellipsize. A learner's name falls back to their email local part,
 * which can be long enough to run off the card, and a clipped name is worse than
 * a slightly smaller one.
 *
 * Returns the size to draw at and the string to draw: measuring must not paint,
 * or a rejected first attempt leaves a mark behind.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
  stack: string
): { size: number; text: string } {
  let size = startPx;
  ctx.font = `800 ${size}px ${stack}`;
  while (size > minPx && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `800 ${size}px ${stack}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { size, text };

  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { size, text: `${clipped}…` };
}

type Stat = { emoji: string; value: string; label: string };

function drawStat(
  ctx: CanvasRenderingContext2D,
  stat: Stat,
  x: number,
  y: number,
  w: number,
  h: number
) {
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = `rgba(${WHITE}, 0.13)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${WHITE}, 0.22)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Emoji above the number: the row reads as three icons at a glance, which is
  // what survives being scaled down in a timeline preview.
  ctx.font = `28px ${EMOJI_STACK}`;
  ctx.fillText(stat.emoji, x + w / 2, y + 44);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 34px ${UI_STACK}`;
  ctx.fillText(stat.value, x + w / 2, y + 86);

  ctx.fillStyle = `rgba(${WHITE}, 0.82)`;
  ctx.font = `500 17px ${UI_STACK}`;
  ctx.fillText(stat.label, x + w / 2, y + 112);
}

export async function renderCard(props: Props): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  const [headingFont, uiFont] = await Promise.all([
    fontAvailable("Fraunces", '800 76px "Fraunces"'),
    fontAvailable("Inter", '700 34px "Inter"'),
  ]);
  const heading = headingFont ? HEADING_STACK : "Georgia, serif";
  const ui = uiFont ? UI_STACK : "system-ui, sans-serif";

  const primary = cssVar("--primary", FALLBACK.primary);
  const sparks = cssVar("--sparks", FALLBACK.sparks);

  // —— Background ——
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, primary);
  bg.addColorStop(1, sparks);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // A soft highlight top-left keeps a flat two-stop gradient from looking like
  // a default fill at thumbnail size.
  const glow = ctx.createRadialGradient(180, 60, 0, 180, 60, 900);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const PAD = 72;

  // —— Wordmark ——
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 38px ${heading}`;
  ctx.fillText("Learnova", PAD, 96);

  ctx.fillStyle = `rgba(${WHITE}, 0.72)`;
  ctx.font = `600 17px ${ui}`;
  ctx.fillText("AI LEARNING PATH", PAD + 2, 124);

  // —— Heading + name ——
  ctx.fillStyle = `rgba(${WHITE}, 0.88)`;
  ctx.font = `600 50px ${heading}`;
  ctx.fillText("Your AI Journey", PAD, 236);

  const name = fitText(ctx, props.learnerName, W - PAD * 2, 78, 40, heading);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${name.size}px ${heading}`;
  ctx.fillText(name.text, PAD, 322);

  // —— Stats row ——
  const stats: Stat[] = [
    { emoji: "🔥", value: String(props.currentStreak), label: "day streak" },
    { emoji: "✨", value: String(props.sparks), label: "Sparks" },
    {
      emoji: "🏆",
      value: String(props.conceptsMastered),
      label: "concepts mastered",
    },
  ];

  const gap = 20;
  const statW = (W - PAD * 2 - gap * (stats.length - 1)) / stats.length;
  const statY = 372;
  const statH = 132;
  stats.forEach((stat, i) => {
    drawStat(ctx, stat, PAD + i * (statW + gap), statY, statW, statH);
  });

  // —— Badges ——
  const earned = props.badges.filter((b) => b.unlocked).slice(0, MAX_BADGES);
  if (earned.length > 0) {
    const d = 52;
    const step = d + 16;
    const labelY = 538;
    const circleTop = 548;
    const cy = circleTop + d / 2;
    const nameY = 620;

    ctx.textAlign = "left";
    ctx.fillStyle = `rgba(${WHITE}, 0.72)`;
    ctx.font = `600 15px ${ui}`;
    ctx.fillText("BADGES", PAD, labelY);

    earned.forEach((badge, i) => {
      const cx = PAD + d / 2 + i * step;
      const emoji = BADGE_EMOJI[badge.icon] ?? "⭐";

      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${WHITE}, 0.18)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${WHITE}, 0.35)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.font = `26px ${EMOJI_STACK}`;
      ctx.fillText(emoji, cx, cy + 9);

      ctx.fillStyle = `rgba(${WHITE}, 0.85)`;
      ctx.font = `500 14px ${ui}`;
      ctx.fillText(badge.name, cx, nameY);
    });
  }

  // —— Footer ——
  // Right-aligned so it shares the badge-name line rather than colliding with it:
  // four badges reach about a third of the way across, leaving the rest free.
  ctx.textAlign = "right";
  ctx.fillStyle = `rgba(${WHITE}, 0.7)`;
  ctx.font = `600 18px ${ui}`;
  ctx.fillText("learnova.app", W - PAD, H - 10);

  return canvas;
}

/** Keep a learner's name from putting slashes, spaces or quotes in a filename. */
export function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // NFKD splits "í" into "i" plus a combining acute. Left alone that mark
    // would fall through to the separator below and produce "garci-a".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "learner";
}

export default function ShareProgressButton({
  learnerName,
  sparks,
  currentStreak,
  conceptsMastered,
  badges,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);

    try {
      const canvas = await renderCard({
        learnerName,
        sparks,
        currentStreak,
        conceptsMastered,
        badges,
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (!blob) {
        fireToast("Could not build the image. Please try again.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `learnova-progress-${fileSlug(learnerName)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers; one turn
      // of the event loop is enough for the click to be handled.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      fireToast("Progress card saved!");
    } catch {
      fireToast("Could not build the image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="btn-secondary"
      style={{ textDecoration: "none" }}
    >
      {busy ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          Building card...
        </>
      ) : (
        <>
          <Share2 size={15} />
          Share progress
        </>
      )}
    </button>
  );
}
