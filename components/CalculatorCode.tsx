"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

export type CodeSymbol = {
  token: string;
  tier: "essential" | "encountered" | "future";
  note?: string;
};

type Props = {
  code: string;
  universal_explanation: string;
  symbols?: CodeSymbol[];
};

const TIER_STYLE: Record<CodeSymbol["tier"], React.CSSProperties> = {
  essential: {
    fontWeight: 700,
    textDecoration: "underline",
    textDecorationColor: "var(--primary)",
    textDecorationThickness: "2px",
    textUnderlineOffset: "3px",
    color: "var(--primary)",
  },
  encountered: {
    backgroundColor: "var(--primary-soft)",
    borderRadius: "2px",
  },
  future: {
    opacity: 0.45,
    textDecoration: "underline dotted",
    textUnderlineOffset: "3px",
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function CalculatorCode({
  code,
  universal_explanation,
  symbols,
}: Props) {
  const [active, setActive] = useState<CodeSymbol | null>(null);
  const [copied, setCopied] = useState(false);

  const symbolByToken = useMemo(() => {
    const map = new Map<string, CodeSymbol>();
    for (const symbol of symbols ?? []) {
      if (symbol.token.trim().length > 0) map.set(symbol.token, symbol);
    }
    return map;
  }, [symbols]);

  const matcher = useMemo(() => {
    const tokens = Array.from(symbolByToken.keys()).sort(
      (a, b) => b.length - a.length
    );
    if (tokens.length === 0) return null;
    const alternatives = tokens.map((token) => {
      const left = /^\w/.test(token) ? "\\b" : "";
      const right = /\w$/.test(token) ? "\\b" : "";
      return `${left}${escapeRegExp(token)}${right}`;
    });
    return new RegExp(`(${alternatives.join("|")})`, "g");
  }, [symbolByToken]);

  const lines = code.split("\n");

  function renderLine(line: string) {
    if (!matcher) return line;
    const parts = line.split(matcher);
    return parts.map((part, i) => {
      const symbol = symbolByToken.get(part);
      if (!symbol) return part;
      return (
        <button
          key={`${part}-${i}`}
          type="button"
          onClick={() => setActive(symbol)}
          style={{
            ...TIER_STYLE[symbol.tier],
            font: "inherit",
            background:
              symbol.tier === "encountered" ? "var(--primary-soft)" : undefined,
            padding: symbol.tier === "encountered" ? "0 2px" : undefined,
            cursor: "pointer",
          }}
          title={symbol.note ?? symbol.token}
        >
          {part}
        </button>
      );
    });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; nothing to do.
    }
  }

  return (
    <div>
      <div
        className="relative overflow-x-auto rounded-sm"
        style={{
          backgroundColor: "var(--bg-code)",
          color: "#E2E8F0",
        }}
      >
        <button
          type="button"
          onClick={copyCode}
          aria-label="Copy code"
          title="Copy code"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        >
          {copied ? (
            <Check size={14} className="text-success" />
          ) : (
            <Copy size={14} className="text-slate-300" />
          )}
        </button>
        <div className="p-3 pt-9">
          {lines.map((line, index) => (
            <div key={`${index}-${line}`} className="flex gap-3">
              <span className="w-6 shrink-0 select-none text-right font-mono text-sm text-slate-500">
                {index + 1}
              </span>
              <span className="whitespace-pre font-mono text-sm">
                {renderLine(line)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div
          className="mt-2 rounded-sm border-l-4 px-3 py-2 text-sm"
          style={{
            borderLeftColor: "var(--primary)",
            backgroundColor: "var(--bg-subtle)",
          }}
        >
          <span className="font-mono font-semibold">{active.token}</span>
          <span className="ml-2 text-xs uppercase tracking-wide text-inkmuted">
            {active.tier}
          </span>
          <p className="mt-1 text-ink">
            {active.note ?? "No note for this one yet."}
          </p>
        </div>
      )}

      {symbols && symbols.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-inkmuted">
          <span>
            <span className="font-bold text-primary underline decoration-2 underline-offset-2">
              Essential
            </span>{" "}
            — needed now
          </span>
          <span>
            <span className="rounded-sm bg-primary-soft px-1 font-semibold text-ink">
              Encountered
            </span>{" "}
            — seen before
          </span>
          <span>
            <span className="opacity-60 underline decoration-dotted">
              Future
            </span>{" "}
            — not yet
          </span>
        </div>
      )}

      <p className="mt-4 font-body italic text-ink">
        {universal_explanation}
      </p>
    </div>
  );
}