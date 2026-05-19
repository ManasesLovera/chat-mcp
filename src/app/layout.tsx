import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local MCP Agent Lab",
  description:
    "Test local MCP servers with an OpenAI-backed agent, persisted config, and tool traces.",
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
