import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgpage: "var(--bg-page)",
        bgcard: "var(--bg-card)",
        bgsubtle: "var(--bg-subtle)",
        bgcode: "var(--bg-code)",
        ink: "var(--ink)",
        inkmuted: "var(--ink-muted)",
        inkfaint: "var(--ink-faint)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-soft": "var(--primary-soft)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        error: "var(--error)",
        "error-soft": "var(--error-soft)",
        gold: "var(--gold)",
        "gold-soft": "var(--gold-soft)",
        streak: "var(--streak)",
        sparks: "var(--sparks)",
        /* Activity accents are read through the CSS variable in most places;
         * this mapping is for the Tailwind-class callers. */
        acodeeditor: "var(--a-code-editor)",
        /* Legacy aliases so pre-redesign pages/components keep resolving
         * against the new palette. */
        paper: "var(--paper)",
        paperdark: "var(--paper-dark)",
        linen: "var(--paper-linen)",
        cork: "var(--cork)",
        inkfaded: "var(--ink-faded)",
        terracotta: "var(--terracotta)",
        walnut: "var(--walnut)",
        moss: "var(--moss)",
        sage: "var(--sage)",
        brass: "var(--brass)",
      },
      fontFamily: {
        heading: "var(--font-heading)",
        body: "var(--font-body)",
        ui: "var(--font-ui)",
        mono: "var(--font-mono)",
        hand: "var(--font-hand)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
export default config;