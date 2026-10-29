"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bookmark,
  Database,
  FileText,
  Hash,
  Home,
  KeyRound,
  Laptop,
  Menu,
  Moon,
  Search,
  Sun,
  Tags,
  UsersRound,
  X,
} from "lucide-react";
import { useWorkspace, updateWorkspace } from "@/hooks/use-workspace";

const navigation = [
  { href: "/", label: "Dashboard", code: "01", icon: Home },
  { href: "/transcript", label: "Transcripts & summaries", code: "02", icon: FileText },
  { href: "/keywords", label: "Topic research", code: "03", icon: Search },
  { href: "/extract", label: "Tag extractor", code: "04", icon: Tags },
  { href: "/trending", label: "Keyword trends", code: "05", icon: BarChart3 },
  { href: "/hashtags", label: "Hashtag research", code: "06", icon: Hash },
  { href: "/competitors", label: "Compare tags", code: "07", icon: UsersRound },
  { href: "/saved", label: "Saved items", code: "08", icon: Bookmark },
  { href: "/sources", label: "Data sources", code: "09", icon: Database },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const workspace = useWorkspace();
  const theme = workspace.state.preferences.theme;

  useEffect(() => {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = [...sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const cycleTheme = () => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    updateWorkspace((state) => ({ ...state, preferences: { ...state.preferences, theme: next } }));
  };

  const closeNavigation = () => {
    setOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;

  return (
    <div className="app-ambient">
      <a href="#main-content" className="fixed left-3 top-3 z-[70] -translate-y-24 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0">
        Skip to content
      </a>

      <div className="app-frame">
        {open ? <button className="fixed inset-0 z-40 bg-[#040810]/60 backdrop-blur-sm lg:hidden" onClick={closeNavigation} aria-label="Close navigation overlay" /> : null}

        <aside ref={sidebarRef} id="primary-sidebar" className="app-sidebar" data-open={open} aria-label="Application sidebar">
          <div className="flex h-[68px] items-center border-b px-5 lg:h-[72px]">
            <Link href="/" className="flex min-w-0 items-center gap-3 group" aria-label="SourceLens home">
              <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-indigo-500 text-white shadow-[0_4px_16px_rgba(79,70,229,0.35)] dark:shadow-[0_4px_20px_rgba(99,102,241,0.4)] transition group-hover:scale-105">
                <KeyRound className="size-[17px]" aria-hidden="true" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-surface" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-foreground">SourceLens</span>
                <span className="block truncate font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted">YouTube research</span>
              </span>
            </Link>
            <button ref={closeButtonRef} className="button-ghost ml-auto !size-10 !px-0 lg:hidden" onClick={closeNavigation} aria-label="Close navigation"><X className="size-5" /></button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
            <div className="mb-3.5 flex items-center justify-between px-3">
              <p className="font-mono text-[9px] font-extrabold uppercase tracking-[0.18em] text-subtle">{"// RESEARCH TOOLS"}</p>
              <span className="font-mono text-[9px] font-bold text-muted/60">09 NODES</span>
            </div>
            <ul className="space-y-1.5">
              {navigation.map(({ href, label, code, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link href={href} className="app-sidebar-nav-link group" data-active={active} aria-current={active ? "page" : undefined}>
                      <Icon className="size-[17px] shrink-0 transition-transform group-hover:scale-110" strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
                      <span className="truncate flex-1">{label}</span>
                      <span className={`font-mono text-[9px] font-bold transition-opacity ${active ? "opacity-90" : "opacity-35 group-hover:opacity-75"}`}>
                        {code}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t p-3.5">
            <div className="rounded-xl border border-border/80 bg-surface-muted/60 p-3.5 transition hover:border-brand/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground">Saved on this device</p>
                </div>
                <span className="font-mono text-[9px] text-muted">LOCAL</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-[1.55] text-muted">Your saved research stays in this browser. It may not appear on another device or browser.</p>
            </div>
          </div>
        </aside>

        <div className="app-content-column">
          <header className="app-topbar">
            <button
              ref={menuButtonRef}
              className="button-ghost !size-10 !px-0 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-controls="primary-sidebar"
              aria-expanded={open}
            >
              <Menu className="size-5" />
            </button>
            <div className="ml-2 min-w-0 lg:ml-0 flex-1">
              <div className="flex items-center gap-2.5">
                <p className="truncate text-[13px] font-extrabold tracking-[-0.01em]">Find and research YouTube content</p>
                <div className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft/50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-brand-strong dark:text-brand">
                  <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                  <span>INTELLIGENCE // LAB</span>
                </div>
              </div>
              <p className="hidden text-[10px] leading-4 text-muted sm:block">Explore video transcripts, tags, topics, hashtags, and trends.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!workspace.available && workspace.hydrated ? (
                <span className="hidden rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 font-mono text-[10px] font-bold text-warning sm:inline">Saving to device unavailable</span>
              ) : null}
              <button
                className="button-ghost border border-border/60 !h-10 !px-3 hover:border-brand/40 hover:bg-surface-muted transition-all"
                onClick={cycleTheme}
                aria-label={`Theme: ${theme}. Change theme.`}
                title={`Theme: ${theme}`}
              >
                <ThemeIcon className="size-4 text-brand-strong dark:text-brand" aria-hidden="true" />
                <span className="hidden text-xs capitalize sm:inline font-mono font-semibold">{theme}</span>
              </button>
            </div>
          </header>

          <main id="main-content" className="app-scroll-area" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
