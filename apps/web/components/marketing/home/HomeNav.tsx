"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";

/** Sticky marketing header: brand, in-page links, sign in and get started. */
export function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
      <div className="wrap">
        <a className="brand" href="#top" aria-label="BuboMap home">
          <BuboMapWordmark size="md" beta theme="dark" />
        </a>
        <nav className="navlinks" aria-label="Page">
          <a href="#top">Ask</a>
          <a href="#setup">Setup</a>
          <a href="#reports">Reports &amp; AI</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="navright">
          <Link className="link" href="/auth/sign-in">
            Sign in
          </Link>
          <Link className="btn btn-primary btn-sm" href="/auth/sign-up">
            Get started free
          </Link>
        </div>
      </div>
    </header>
  );
}
