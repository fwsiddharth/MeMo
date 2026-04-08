import "./globals.css";
import NavShell from "../components/NavShell";
import ClientSettingsProvider from "../components/ClientSettingsProvider";

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
        <ClientSettingsProvider>
          <NavShell>{children}</NavShell>
        </ClientSettingsProvider>
      </body>
    </html>
  );
}
