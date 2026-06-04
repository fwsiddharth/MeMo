import "./globals.css";
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
      <body>
        <AppStatusProvider>
          <ClientSettingsProvider>
            <NavShell>{children}</NavShell>
          </ClientSettingsProvider>
        </AppStatusProvider>
      </body>
    </html>
  );
}
