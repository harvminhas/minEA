import { Fragment } from "react";
import {
  ANSWER_KEYS,
  ANSWERS,
  RECORDS,
  THINK_STEPS,
  citeNumber,
  parseRich,
  spendLabel,
  spendPercent,
  type Criticality,
  type DemoAnswer,
  type RecordId,
  type Segment,
} from "./ask-demo-data";
import { Icon } from "./icons";

/*
 * Presentational pieces of the Ask demo. Clicks are handled by the parent through
 * data-r (open a record), data-act (demo action) and data-run-inner (run a question).
 */

function CritPill({ c }: { c?: Criticality }) {
  if (!c) return <span className="none">—</span>;
  return <span className={`pill crit-${c}`}>{c}</span>;
}

function RecLink({ a, id }: { a: DemoAnswer; id: RecordId }) {
  const n = citeNumber(a, id);
  return (
    <span className="nowrap">
      <button type="button" className="rec" data-r={id}>
        {RECORDS[id].name}
      </button>
      {n > 0 && (
        <button type="button" className="cite" data-r={id} aria-label={`Source ${n}`}>
          {n}
        </button>
      )}
    </span>
  );
}

export function Rich({ a, text }: { a: DemoAnswer; text: string }) {
  const render = (segs: Segment[]): React.ReactNode =>
    segs.map((s, i) => {
      switch (s.t) {
        case "text":
          return <Fragment key={i}>{s.v}</Fragment>;
        case "strong":
          return <strong key={i}>{render(s.children)}</strong>;
        case "rec":
          return <RecLink key={i} a={a} id={s.id} />;
        case "cite":
          return (
            <button
              key={i}
              type="button"
              className="cite"
              data-r={s.id}
              aria-label={`Source ${s.n}: ${RECORDS[s.id].name}`}
            >
              {s.n}
            </button>
          );
        case "link":
          return (
            <a key={i} href={s.href}>
              {s.label}
            </a>
          );
      }
    });
  return <>{render(parseRich(a, text))}</>;
}

function NChip({ a, id, asCite }: { a: DemoAnswer; id: RecordId; asCite?: boolean }) {
  const n = citeNumber(a, id);
  if (!n) return null;
  return asCite ? (
    <span className="cite flush">{n}</span>
  ) : (
    <span className="n">{n}</span>
  );
}

export interface AnswerViewProps {
  a: DemoAnswer;
  /** When animating, only the first `revealed` reveal steps are visible. */
  animating: boolean;
  revealed: number;
  /** Record highlighted by the open preview. */
  hl: RecordId | null;
  ownerSet: boolean;
  note: string;
}

/** The full answer. Elements are numbered in the same order as revealPlan(). */
export function AnswerView({ a, animating, revealed, hl, ownerSet, note }: AnswerViewProps) {
  let unit = 0;
  const step = (cls: string, kind: "rv" | "rvr" = "rv") => {
    const i = unit++;
    const shown = !animating || revealed > i;
    return `${cls ? `${cls} ` : ""}${kind}${shown ? " in" : ""}`;
  };
  const hlCls = (id: RecordId) => (hl === id ? " hl" : "");
  const v = a.vis;

  const textCls = step("a-text");
  const metaCls = step("meta");

  let visual: React.ReactNode = null;
  if (v.kind === "impact") {
    const tableCls = step("tbl");
    const rows = v.rows.map((r) => ({ r, cls: step(`row${hlCls(r.id)}`, "rvr") }));
    visual = (
      <table className={tableCls}>
        <thead>
          <tr>
            <th scope="col">Affected</th>
            <th scope="col">How it’s affected</th>
            <th scope="col" className="sevh">Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, cls }) => (
            <tr key={r.id} className={cls} data-r={r.id}>
              <td>
                <div className="nm">
                  <NChip a={a} id={r.id} />
                  <div>
                    <b>{RECORDS[r.id].name}</b>
                    <small>{RECORDS[r.id].type.split(" · ")[0]}</small>
                  </div>
                </div>
              </td>
              <td className="eff">
                <b>{r.how}</b> <span>· {r.why}</span>
                <div className="mob-sev">
                  <CritPill c={r.sev} />
                </div>
              </td>
              <td className="sev">
                <CritPill c={r.sev} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (v.kind === "renewals") {
    const rows = v.rows.map((r) => ({ r, cls: step(hlCls(r.id).trim()) }));
    const totalCls = step("total");
    visual = (
      <>
        <ul className="ren">
          {rows.map(({ r, cls }) => (
            <li key={r.id} className={cls} data-r={r.id}>
              <div className={`date${r.soon ? " soon" : ""}`}>
                <small>{r.mon}</small>
                <b>{r.day}</b>
              </div>
              <div className="who">
                <b>
                  <NChip a={a} id={r.id} asCite />
                  {RECORDS[r.id].name}
                </b>
                <small>{r.sub}</small>
              </div>
              <div className="amt">
                {r.amt}
                <small className={r.warn ? "warn" : r.gap ? "gap" : ""}>{r.note}</small>
              </div>
            </li>
          ))}
        </ul>
        <div className={totalCls}>
          <span>Next 90 days</span>
          <span>
            <b>{v.total}</b> a year
          </span>
        </div>
      </>
    );
  } else if (v.kind === "spend") {
    const barsCls = step("bars");
    const legendCls = step("legend");
    visual = (
      <>
        <ul className={barsCls}>
          {v.rows.map((r) => (
            <li
              key={r.id}
              className={[r.top ? "top" : "", r.other ? "other" : ""].filter(Boolean).join(" ") || undefined}
              data-r={r.id}
            >
              <span className="bn">
                {r.label}
                {r.sub && (
                  <>
                    {" "}
                    <small>{r.sub}</small>
                  </>
                )}
              </span>
              <span className="track">
                <span className="fillb" style={{ width: `${spendPercent(r.val, v.max)}%` }} />
              </span>
              <span className="bv">{spendLabel(r.val)}</span>
            </li>
          ))}
        </ul>
        <div className={legendCls}>
          <span>
            <i style={{ background: "#5b4ce6" }} />
            Top 3 vendors: 58%
          </span>
          <span>
            <i style={{ background: "#c4bdf7" }} />
            Next 5
          </span>
          <span>
            <i style={{ background: "#dfe2ea" }} />
            Everything else
          </span>
        </div>
      </>
    );
  } else if (v.kind === "owners") {
    const tableCls = step("tbl");
    const rows = v.rows.map((id) => ({ id, cls: step(`row${hlCls(id)}`, "rvr") }));
    const fixCls = step("fix");
    const fixId = a.fix?.id;
    visual = (
      <>
        <table className={tableCls}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Criticality</th>
              <th scope="col">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, cls }) => (
              <tr key={id} className={cls} data-r={id}>
                <td>
                  <div className="nm">
                    <NChip a={a} id={id} />
                    <div>
                      <b>{RECORDS[id].name}</b>
                      <small>{RECORDS[id].type.split(" · ")[0]}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <CritPill c={RECORDS[id].crit} />
                </td>
                <td className="own">
                  {ownerSet && id === fixId ? (
                    <span className="owner-set">{a.fix?.owner}</span>
                  ) : (
                    <button type="button" className="noown" data-act="addowner">
                      No owner · Add
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {a.fix && (
          <div className={fixCls}>
            <button type="button" className="pbtn pri" data-act="setowner" disabled={ownerSet}>
              Set owner: {a.fix.owner}
            </button>
            <button type="button" className="pbtn" data-act="addowner">
              Other…
            </button>
            <span className="fixnote">for EDI Gateway · Integration Team runs the flows it feeds</span>
          </div>
        )}
      </>
    );
  } else {
    const rows = v.rows.map((r) => ({ r, cls: step(hlCls(r.id).trim()) }));
    visual = (
      <ul className="ailist">
        {rows.map(({ r, cls }) => (
          <li key={r.id} className={cls} data-r={r.id}>
            <span className={`aiico${r.agent ? " agent" : ""}`}>
              <Icon name={r.agent ? "bot" : "spark"} />
            </span>
            <div>
              <div className="t1">
                <NChip a={a} id={r.id} asCite />
                <b>{RECORDS[r.id].name}</b>
                <small>{r.sub}</small>
              </div>
              <div className="t2">
                Sees customer data:{" "}
                <span className={r.sees === "yes" ? "yes" : "unk"}>{r.sees === "yes" ? "Yes" : "Not sure"}</span>
                {" · "}
                {r.what}
              </div>
              <div className="flags">
                {r.flags.map(([sev, label]) => (
                  <span key={label} className={`pill sev-${sev}`}>
                    {sev === "high" ? "High · " : ""}
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const ctxCls = a.ctx ? step("ctx") : "";
  const srcCls = step("srcs");
  const gapsCls = a.gaps.length ? step("gaps") : "";
  const footCls = step("foot");

  return (
    <>
      <p className={textCls}>
        <Rich a={a} text={a.text} />
      </p>
      <div className={metaCls}>
        <span className="ok">
          <Icon name="check" />
          From your records
        </span>
        <span>· {a.meta}</span>
        <span className="sep">·</span>
        <button type="button" className="how" data-act="how">
          How this was worked out
        </button>
      </div>
      {visual}
      {a.ctx && (
        <p className={ctxCls}>
          <Rich a={a} text={a.ctx} />
        </p>
      )}
      <div className={srcCls}>
        <span className="lbl">Sources</span>
        {a.cites.map((id, i) => (
          <button key={id} type="button" className={`src${hlCls(id)}`} data-r={id}>
            <span className="n">{i + 1}</span>
            {RECORDS[id].name}
          </button>
        ))}
      </div>
      {a.gaps.length > 0 && (
        <div className={gapsCls}>
          <div className="gt">
            <Icon name="warn" />
            Gaps
          </div>
          {a.gaps.map((g) => (
            <p key={g}>
              {g}{" "}
              <button type="button" className="fill" data-act="fill">
                Fill in
              </button>
            </p>
          ))}
        </div>
      )}
      <div className={footCls}>
        <button type="button" className="pbtn pri" data-act="save">
          Save as report
        </button>
        <button type="button" className="pbtn" data-act="export">
          Export
        </button>
        <button type="button" className="pbtn" data-act="share">
          Share
        </button>
        <span className="right">
          Was this right?{" "}
          <button type="button" className="pbtn" data-act="yes">
            Yes
          </button>
          <button type="button" className="pbtn" data-act="no">
            No
          </button>
        </span>
      </div>
      <p className="note">{note}</p>
    </>
  );
}

export function DemoNote() {
  return (
    <div className="demo-note">
      <p>
        <b>This demo runs on a sample workspace</b>, so it only knows a few questions. Sign up free and ask about
        your own estate.
      </p>
      <div className="mini-chips">
        {ANSWER_KEYS.map((k) => (
          <button key={k} type="button" className="mchip" data-run-inner={k}>
            {ANSWERS[k].q}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThinkingSteps({ step }: { step: number }) {
  return (
    <div className="think">
      <div className="think-bar">
        <i />
      </div>
      <p className="think-now">{THINK_STEPS[step]}</p>
      <ol className="think-steps">
        {THINK_STEPS.map((s, i) => (
          <li key={s} className={i < step ? "done" : i === step ? "now" : undefined}>
            {i < step ? "Done" : i === step ? "Now" : "Next"} · {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RecordPreview({
  id,
  open,
  extraNote,
  closeRef,
}: {
  id: RecordId | null;
  open: boolean;
  extraNote: string;
  closeRef?: React.Ref<HTMLButtonElement>;
}) {
  const r = id ? RECORDS[id] : null;
  return (
    <div
      className={`prev${open ? " open" : ""}`}
      role="dialog"
      aria-label={r ? `Record preview: ${r.name}` : "Record preview"}
      aria-hidden={!open}
      inert={!open}
    >
      {r && (
        <>
          <div className="ph">
            <div>
              <p className="pn">{r.name}</p>
              <div className="pt">{r.type}</div>
            </div>
            <button type="button" className="x" aria-label="Close" data-act="close" ref={closeRef}>
              ×
            </button>
          </div>
          <dl>
            <div>
              <dt>Owner</dt>
              <dd>{r.owner === "" ? <span className="notset">Not set</span> : r.owner || "—"}</dd>
            </div>
            {r.crit !== undefined && (
              <div>
                <dt>Criticality</dt>
                <dd>
                  <CritPill c={r.crit} />
                </dd>
              </div>
            )}
            {r.cost && (
              <div>
                <dt>Annual cost</dt>
                <dd>{r.cost}</dd>
              </div>
            )}
            {r.vendor && (
              <div>
                <dt>Vendor</dt>
                <dd>{r.vendor}</dd>
              </div>
            )}
            {r.renew && (
              <div>
                <dt>Renewal</dt>
                <dd>{r.renew}</dd>
              </div>
            )}
          </dl>
          {(extraNote || r.links) && <p className="nb">{extraNote || r.links}</p>}
          <button type="button" className="open-full" data-act="openfull">
            Open in Model →
          </button>
        </>
      )}
    </div>
  );
}
