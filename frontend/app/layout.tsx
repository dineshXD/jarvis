import { Newsreader, Instrument_Sans } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Providers from "./components/Providers";
import ThemeToggle from "./components/ThemeToggle";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

export const metadata = {
  title: "Jarvis | Knowledge Vault",
  description: "A curated archive of ideas worth preserving",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${instrumentSans.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <nav className="nav">
            <Link href="/" className="nav-logo">
              Jarvis
            </Link>
            <div className="nav-links">
              <Link href="/" className="nav-link">
                Vault
              </Link>
              <Link href="/chat" className="nav-link">
                Chat
              </Link>
              <ThemeToggle />
            </div>
          </nav>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
