"use client";

import { useEffect, useState } from "react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { NavCtas } from "./visitor";

/** Sticky marketing header: brand, in-page links, sign in and get started (Open BuboMap when signed in). */
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
        <NavCtas />
      </div>
    </header>
  );
}
