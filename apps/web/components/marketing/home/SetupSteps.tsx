"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export const SETUP_TYPED = "Salesforce, NetSuite, M365, AS400, Mulesoft, Zendesk, Shopify, Snowflake";

const TILES: Array<[string, string, string]> = [
  ["365", "M365", "#d83b01"],
  ["SF", "Salesforce", "#0b8fd8"],
  ["NS", "NetSuite", "#1f3a5f"],
  ["AS", "AS400", "#334155"],
  ["Mu", "Mulesoft", "#0d6e8f"],
  ["Zd", "Zendesk", "#03363d"],
  ["Sh", "Shopify", "#5e8e3e"],
  ["Sn", "Snowflake", "#29a3d6"],
];

/** [app, owner team (null = still open), renewal] */
const OWNERS: Array<[string, string | null, string]> = [
  ["Salesforce", "Sales Ops", "Dec 18"],
  ["NetSuite", "Finance", "Mar 1"],
  ["AS400", "Infrastructure", "Jun 30"],
  ["Zendesk", "Customer Service", "Oct 31"],
  ["Mulesoft", null, "Dec 1"],
];
const VALUE_COUNT = OWNERS.reduce((n, [, owner]) => n + (owner ? 2 : 1), 0);
const LAST_COUNT = 4;

interface StepsState {
  anim: boolean;
  typed: string | null;
  found: boolean;
  tiles: number;
  vals: number;
  last: number;
  lit: number;
  done: number;
}

const FINAL: StepsState = {
  anim: false,
  typed: SETUP_TYPED,
  found: true,
  tiles: TILES.length,
  vals: VALUE_COUNT,
  last: LAST_COUNT,
  lit: -1,
  done: 3,
};
const ARMED: StepsState = { anim: true, typed: null, found: false, tiles: 0, vals: 0, last: 0, lit: -1, done: 0 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * "Your map, without a six-month project": three first-run steps that play once when
 * scrolled into view. Server-rendered in their finished state; reduced motion keeps it.
 */
export function SetupSteps() {
  const [s, setS] = useState<StepsState>(FINAL);
  const token = useRef(0);
  const reduce = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const play = useCallback(async () => {
    const my = ++token.current;
    const ok = () => my === token.current;
    const set = (patch: Partial<StepsState>) => setS((prev) => ({ ...prev, ...patch }));
    setS({ ...ARMED, lit: 0 });
    await sleep(400);
    for (let i = 1; i <= SETUP_TYPED.length; i++) {
      if (!ok()) return;
      set({ typed: SETUP_TYPED.slice(0, i) });
      await sleep(22);
    }
    await sleep(250);
    if (!ok()) return;
    set({ found: true });
    for (let t = 1; t <= TILES.length; t++) {
      if (!ok()) return;
      set({ tiles: t });
      await sleep(90);
    }
    await sleep(350);
    if (!ok()) return;
    set({ done: 1, lit: 1 });
    for (let v = 1; v <= VALUE_COUNT; v++) {
      if (!ok()) return;
      set({ vals: v });
      await sleep(170);
    }
    await sleep(400);
    if (!ok()) return;
    set({ done: 2, lit: 2 });
    for (let l = 1; l <= LAST_COUNT; l++) {
      if (!ok()) return;
      set({ last: l });
      await sleep(420);
    }
    if (ok()) set({ done: 3, lit: -1 });
  }, []);

  useEffect(() => {
    reduce.current = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const el = ref.current;
    if (reduce.current || /still/.test(location.hash) || !el || !("IntersectionObserver" in window)) return;
    setS(ARMED);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          io.disconnect();
          void play();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      token.current++;
    };
  }, [play]);

  const replay = () => {
    if (reduce.current) {
      token.current++;
      setS(FINAL);
    } else {
      void play();
    }
  };

  const stepCls = (i: number) =>
    `step${s.lit === i ? " lit" : ""}${s.done > i ? " done" : ""}`;
  const inCls = (shown: boolean, base = "") => `${base ? `${base} ` : ""}s-in${shown ? " in" : ""}`;
  let valIndex = 0;
  const val = (text: string) => {
    const shown = s.vals > valIndex++;
    return <span className={inCls(shown, "val")}>{text}</span>;
  };

  return (
    <>
      <div className={`steps${s.anim ? " anim-s" : ""}`} id="steps" ref={ref}>
        <article className={stepCls(0)}>
          <div className="step-h">
            <span className="step-n">1</span>
            <h3>List what you use</h3>
            <span className="time">Rough is fine</span>
          </div>
          <p className="d">Type names or paste a list. We match them to a catalog of common tools.</p>
          <div className="mini" aria-hidden="true">
            <div className="bm-h4">What runs your business?</div>
            <div className="ta">
              <span className="ta-size">{SETUP_TYPED}</span>
              <span className="ta-live">
                {s.typed === null ? <span className="ph">e.g. Salesforce, QuickBooks, M365, AS400…</span> : s.typed}
              </span>
            </div>
            <div className={inCls(s.found, "found")}>We found 8 items</div>
            <div className="tiles">
              {TILES.map(([mono, label, color], i) => (
                <div key={label} className={inCls(s.tiles > i, "tile")}>
                  <span className="mono" style={{ background: color }}>
                    {mono}
                  </span>
                  <span>{label}</span>
                  <i className="ok">✓</i>
                </div>
              ))}
            </div>
          </div>
        </article>
        <article className={stepCls(1)}>
          <div className="step-h">
            <span className="step-n">2</span>
            <h3>Add owners</h3>
            <span className="time">Optional</span>
          </div>
          <p className="d">Who runs it, where it lives, when it renews. Fill what you know; blanks become a to-do list.</p>
          <div className="mini" aria-hidden="true">
            <div className="bm-h4">Owners and renewals</div>
            <table className="otbl">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Owner team</th>
                  <th>Renewal</th>
                </tr>
              </thead>
              <tbody>
                {OWNERS.map(([app, owner, renew]) => (
                  <tr key={app}>
                    <td>{app}</td>
                    <td>{owner ? val(owner) : <span className="addc">+ Add</span>}</td>
                    <td>{val(renew)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cap">All optional. Empty cells are the ones still open.</p>
          </div>
        </article>
        <article className={stepCls(2)}>
          <div className="step-h">
            <span className="step-n">3</span>
            <h3>Ask</h3>
            <span className="time">Done</span>
          </div>
          <p className="d">Your map is ready. Start with the question that keeps you up at night.</p>
          <div className="mini" aria-hidden="true">
            <div className={inCls(s.last > 0, "ready")}>
              <Icon name="check" />
              Your map is ready · 8 apps, 2 servers
            </div>
            <div className={inCls(s.last > 1, "mask")}>
              <Icon name="spark" style={{ color: "#5b4ce6" }} />
              <span className="q">What breaks if the AS400 goes down?</span>
              <span className="b">Ask →</span>
            </div>
            <div className={inCls(s.last > 2, "mans")}>
              <div className="ml">
                <Icon name="spark" />
                ANSWER
              </div>
              <b>3 applications stop working:</b> Order Entry<span className="cite">2</span>, Inventory
              <span className="cite">3</span> and EDI Gateway<span className="cite">4</span>. The AS400
              <span className="cite">1</span> has no backup recorded.
            </div>
            <div className={inCls(s.last > 3, "mnext")}>
              <span>Ask next</span>
              <i>Who owns the AS400?</i>
              <i>What renews in 90 days?</i>
            </div>
          </div>
        </article>
      </div>
      <button className="replay" type="button" onClick={replay}>
        Replay
      </button>
    </>
  );
}
