import type { Metadata } from "next";
import { Elms_Sans } from "next/font/google";
import "./globals.css";

const elmsSans = Elms_Sans({
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  subsets: ["latin"],
  variable: "--font-elms-sans",
});

export const metadata: Metadata = {
  title: "o toki kepeken sitelen pona",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${elmsSans.className} ${elmsSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
