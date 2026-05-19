import Link from "next/link";
import type { ReactNode } from "react";
import type { UserRecord } from "@/server/types";
import { LogoutButton } from "@/components/logout-button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agent", label: "Agent Test" },
  { href: "/history", label: "History" },
];

export function AppShell({
  children,
  user,
  currentPath,
}: {
  children: ReactNode;
  user: UserRecord;
  currentPath: string;
}) {
  return (
    <div className="app-shell">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="panel rounded-[2rem] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="eyebrow">Local MCP Agent Lab</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Test local tools without touching Codex config
              </h1>
              <p className="muted mt-2 max-w-3xl text-sm leading-6">
                This app stores its own MCP server configs in SQLite, discovers
                tools from local stdio servers, and records tool traces for each
                agent run.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="tag">
                <span>User</span>
                <span>{user.displayName ?? user.email ?? user.id.slice(0, 8)}</span>
              </div>
              <LogoutButton />
            </div>
          </div>
          <nav className="mt-5 flex flex-wrap gap-2">
            {links.map((link) => {
              const isActive = currentPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "btn-secondary border border-[var(--border)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
