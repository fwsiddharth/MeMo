import "./globals.css";
import { Suspense } from "react";
import NavShell from "../components/NavShell";
import ClientSettingsProvider from "../components/ClientSettingsProvider";
import AppStatusProvider from "../components/AppStatusProvider";

export const metadata = {
  title: "MEMO",
  description: "Personal local-first anime web app",
  icons: {
    icon: "/favicon.svg?v=newskull",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const stored = localStorage.getItem("memo_theme_mode") || "system";
                const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
                const theme = stored === "dark" ? "dark" : stored === "light" ? "light" : (prefersDark ? "dark" : "light");
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch (_) {}
            })();`,
          }}
        />
      </head>
      <body className="antialiased">
        <Suspense fallback={null}>
          <AppStatusProvider>
            <ClientSettingsProvider>
              <NavShell>{children}</NavShell>
            </ClientSettingsProvider>
          </AppStatusProvider>
        </Suspense>
      </body>
    </html>
  );
}
