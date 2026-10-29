"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bookmark,
  Database,
  Hash,
  Home,
  KeyRound,
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
  { href: "/", label: "Overview", icon: Home },
  { href: "/keywords", label: "Topic research", icon: Search },
  { href: "/extract", label: "Tag extractor", icon: Tags },
  { href: "/trending", label: "Short-term trends", icon: BarChart3 },
  { href: "/hashtags", label: "Hashtag research", icon: Hash },
  { href: "/competitors", label: "Tag comparison", icon: UsersRound },
  { href: "/saved", label: "Saved research", icon: Bookmark },
  { href: "/sources", label: "Sources and methods", icon: Database },
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
  const ThemeIcon = theme === "dark" ? Moon : Sun;

  return (
    <div className="app-ambient">
      <a href="#main-content" className="fixed left-3 top-3 z-[70] -translate-y-24 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0">
        Skip to content
      </a>

      <div className="app-frame">
        {open ? <button className="fixed inset-0 z-40 bg-[#09201d]/45 backdrop-blur-[2px] lg:hidden" onClick={closeNavigation} aria-label="Close navigation overlay" /> : null}

        <aside ref={sidebarRef} id="primary-sidebar" className="app-sidebar" data-open={open} aria-label="Application sidebar">
          <div className="flex h-[68px] items-center border-b px-5 lg:h-[72px]">
            <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SourceLens home">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-strong to-brand text-white shadow-[0_7px_16px_rgba(7,91,86,0.2)] dark:text-[#f8fffd]">
                <KeyRound className="size-[17px]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold tracking-[-0.02em]">SourceLens</span>
                <span className="block truncate text-[9px] font-bold uppercase tracking-[0.16em] text-muted">YouTube research</span>
              </span>
            </Link>
            <button ref={closeButtonRef} className="button-ghost ml-auto !size-10 !px-0 lg:hidden" onClick={closeNavigation} aria-label="Close navigation"><X className="size-5" /></button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
            <p className="mb-3 px-3 text-[9px] font-extrabold uppercase tracking-[0.17em] text-subtle">Research tools</p>
            <ul className="space-y-1.5">
              {navigation.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link href={href} className="app-sidebar-nav-link" data-active={active} aria-current={active ? "page" : undefined}>
                      <Icon className="size-[17px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t p-4">
            <div className="rounded-2xl border border-border/80 bg-surface-muted/80 p-3.5">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                <p className="text-[11px] font-bold">Saved in this browser</p>
              </div>
              <p className="mt-1.5 text-[10px] leading-[1.55] text-muted">Saved research stays in this browser. Research requests use the sources configured for each tool.</p>
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
            <div className="ml-2 min-w-0 lg:ml-0">
              <p className="truncate text-[13px] font-bold tracking-[-0.01em]">YouTube research with clear sources</p>
              <p className="hidden text-[10px] leading-4 text-muted sm:block">Source data, search-volume estimates, and local calculations stay separate</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!workspace.available && workspace.hydrated ? (
                <span className="hidden rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning sm:inline">Browser saving unavailable</span>
              ) : null}
              <button className="button-ghost border border-transparent !h-10 !px-2.5 hover:border-border sm:!px-3" onClick={cycleTheme} aria-label={`Theme: ${theme}. Change theme.`} title={`Theme: ${theme}`}>
                <ThemeIcon className="size-4" aria-hidden="true" />
                <span className="hidden text-xs capitalize sm:inline">{theme}</span>
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
