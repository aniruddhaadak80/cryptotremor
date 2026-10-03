"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Github, Menu, X } from "lucide-react";
import { SITE } from "@/lib/config/site";
import { GitHubLink } from "./github-link";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-basalt-700/80 bg-basalt-950/92 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label={`${SITE.name} home`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center border border-copper-600 bg-basalt-850"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M2 12h3l2-6 3 12 3-9 2 5 2-3h5"
                stroke="var(--color-copper-400)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[0.95rem] font-semibold tracking-tight text-ash-100">
              {SITE.name}
            </span>
            <span className="label hidden text-[0.6rem] sm:block">post-quantum readiness</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {SITE.nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-[2px] px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-basalt-800 text-ash-100"
                    : "text-ash-300 hover:bg-basalt-850 hover:text-ash-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <GitHubLink variant="secondary" label="View source" className="ml-2" />
        </nav>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <GitHubLink variant="ghost" label="GitHub" />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="btn btn-ghost px-2"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="border-t border-basalt-700 bg-basalt-900 px-4 py-3 md:hidden"
        >
          <ul className="flex flex-col">
            {SITE.nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-[2px] px-3 py-2.5 text-sm ${
                      active ? "bg-basalt-800 text-ash-100" : "text-ash-300"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="px-3 pt-2">
              <a
                href={SITE.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="btn btn-primary w-full"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                <span>Star on GitHub</span>
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}