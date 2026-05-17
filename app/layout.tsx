import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ilo sitelen pona",
  description: "o ante e toki pona tawa sitelen pona. o pana e ona sama PNG.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
