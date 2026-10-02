import type { Metadata } from "next";
import "./globals.css";
import Toast from "@/components/Toast";

export const metadata: Metadata = {
  title: "Learnova — An AI tutor that learns how you learn",
  description:
    "Personalized AI tutoring that teaches AI concepts through your own field, skill level, and goal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Apply the saved theme before first paint so dark mode never flashes
            light. Must stay inline and synchronous; see components/ThemeToggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                if (theme === 'dark') {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen">
        {children}
        <Toast />
      </body>
    </html>
  );
}
