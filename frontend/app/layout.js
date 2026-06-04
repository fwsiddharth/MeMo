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
    <html lang="en">
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
