import { useEffect, useMemo, useState } from "react";
import { headToHead, record, type Athlete, type IndexRider, type Opponent, type RaceType, type Who } from "../data";
import { TYPE_LABEL, clock, dateShort, firstName, fold } from "../format";
import { href } from "../nav";
import { Empty } from "../ui";

/* Who the rider races against. The closest rivals come from site.py (met at least three times, few places
   between, an even record); any other rider can be compared through the search box. */

type TabKey = "closest" | RaceType;

export default function Rivals({ a, index }: { a: Athlete; index: IndexRider[] }) {
  const [extra, setExtra] = useState<Map<string, Opponent>>(new Map());
  const O = useMemo(() => new Map([...a.opponents, ...extra]), [a.opponents, extra]);
  const ins = a.insights;
  const ids = (k: TabKey): string[] => (k === "closest" ? a.rivals : (ins.rivals_by_type?.[k] || []).map((r) => r.id)).filter((id) => O.has(id));
  const tabs = useMemo(() => ([["closest", "Jevneste"], ...Object.keys(TYPE_LABEL).map((t) => [t, TYPE_LABEL[t as RaceType]])] as [TabKey, string][]).filter(([k]) => ids(k).length), [a, O]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<TabKey>("closest");
  const [cur, setCur] = useState<string | undefined>(() => ids("closest")[0] || ids(tabs[0]?.[0] || "closest")[0]);
  const who = firstName(a.name);
  const open = (id: string) => { setCur(id); setTimeout(() => document.getElementById("duel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); };
  const compare = async (r: IndexRider) => {
    if (!O.has(r.id)) { const o = await headToHead(a.id, r); setExtra((m) => new Map(m).set(r.id, o)); }
    open(r.id);
  };
  const o = cur ? O.get(cur) : undefined;
  const list = ids(tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0] || "closest");
  return (
    <>
      <div className="section-head">
        <div><p className="eyebrow">Innbyrdes</p><h2 className="h-section">Rivalene</h2><p className="lead">Jevneste er kjørere {who} har møtt minst tre ganger, med få plasser mellom og jevn stilling. Velg en for å se hvert oppgjør, eller søk opp hvem som helst.</p></div>
        <OppSearch index={index} self={a.id} onPick={compare} />
      </div>
      <div className="rivals-layout">
        <div className="rival-list card">
          {tabs.length > 1 && <div className="chips" role="tablist" aria-label="Klasse">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" className="chip" aria-selected={tab === k} onClick={() => { setTab(k); setCur(ids(k)[0]); }}>{l}</button>)}</div>}
          <ol>
            {list.map((id, i) => { const x = O.get(id)!; const ms = tab === "closest" ? x.ms : x.ms.filter((m) => m.type === tab); const rec = record(ms); return (
              <li key={id}><button type="button" aria-pressed={cur === id} onClick={() => open(id)}>
                <span className="rank tnum">{i + 1}</span><span className="who"><b>{x.name}</b><small className="muted">{ms.length} møter</small></span>
                <span className={`rec tnum ${rec.w > rec.l ? "pos" : rec.w < rec.l ? "neg" : ""}`}>{rec.w}–{rec.l}</span>
              </button></li>
            ); })}
            {list.length === 0 && <li className="none muted">Ingen jevne rivaler ennå. Det trengs minst tre møter.</li>}
          </ol>
        </div>
        <div id="duel">{o ? <Duel a={a} o={o} inIndex={index.some((r) => r.id === o.id)} /> : <Empty title="Velg en rival" />}</div>
      </div>

      <section className="section" aria-labelledby="h-hl">
        <div className="section-head"><div><p className="eyebrow">Fra oppgjørene</p><h2 className="h-section" id="h-hl">Mønstre</h2></div></div>
        <div className="hl-cards">
          <HlCard title="Nemesis" sub={`Jevnbyrdige som slår ${who} oftest`} tone="neg" rows={ins.nemesis} val={(r) => [`${r.wins}–${r.losses}`, `${r.races} møter`]} onPick={open} />
          <HlCard title="Offer" sub={`Jevnbyrdige ${who} slår oftest`} tone="pos" rows={ins.victims} val={(r) => [`${r.wins}–${r.losses}`, `${r.races} møter`]} onPick={open} />
          <HlCard title="Jakten" sub={`Ender oftest 1–3 plasser foran ${who}`} rows={ins.right_ahead} val={(r) => [`${(r as Who & { right_ahead: number }).right_ahead}×`, `av ${r.races} møter`]} onPick={open} />
          <HlCard title="I nakken" sub={`Ender oftest 1–3 plasser bak ${who}`} rows={ins.right_behind} val={(r) => [`${(r as Who & { right_behind: number }).right_behind}×`, `av ${r.races} møter`]} onPick={open} />
          {!!ins.overtaken?.length && <HlCard title="Snudd" sub={`Slo ${who} ett år, tapte året etter`} rows={ins.overtaken} val={(r) => [`${(r as Who & { lost_in: string }).lost_in} → ${(r as Who & { beat_in: string }).beat_in}`, `${r.races} møter`]} onPick={open} />}
        </div>
      </section>
    </>
  );
}

function Duel({ a, o, inIndex }: { a: Athlete; o: Opponent; inIndex: boolean }) {
  const rec = record(o.ms);
  const draws = o.ms.length - rec.w - rec.l;
  const me = firstName(a.name), them = firstName(o.name);
  const places = o.ms.filter((m) => m.pl != null).map((m) => m.pl!);
  const med = places.length ? places.sort((x, y) => x - y)[places.length >> 1] : null;
  const first = o.ms[0], last = o.ms[o.ms.length - 1];
  return (
    <div className="card duel">
      <div className="duel-head">
        <div className="duel-side"><span className="eyebrow">{me}</span><b className="duel-n tnum pos">{rec.w}</b></div>
        <div className="duel-mid"><span className="eyebrow">møter</span><b className="tnum">{o.ms.length}</b>{draws > 0 && <small className="muted">{draws} uavgjort</small>}</div>
        <div className="duel-side right"><span className="eyebrow">{inIndex ? <a href={href.rider(o.id)}>{o.name}</a> : o.name}</span><b className="duel-n tnum neg">{rec.l}</b></div>
      </div>
      <p className="duel-sum">
        {rec.w === rec.l ? "Helt jevnt" : rec.w > rec.l ? `${me} leder` : `${them} leder`}{med != null ? `, typisk ${Math.abs(med)} ${Math.abs(med) === 1 ? "plass" : "plasser"} ${med < 0 ? `foran` : `bak`} ${them}` : ""}.
        {first && last && first !== last ? ` Første møte ${first.date.slice(0, 4)}, siste ${last.date.slice(0, 4)}.` : ""}
      </p>
      <div className="table-wrap"><table className="sheet meetings">
        <thead><tr><th className="l">Race</th><th className="l">Klasse</th><th>Utfall</th><th>Plasser</th><th>Tid</th></tr></thead>
        <tbody>{[...o.ms].reverse().map((m, i) => (
          <tr key={i} className={m.res}>
            <td className="l"><b>{m.race}</b> <span className="muted">{dateShort(m.date)} {m.date.slice(0, 4)}</span></td>
            <td className="l muted">{m.mc || TYPE_LABEL[m.type]}</td>
            <td><span className={`res ${m.res}`}>{m.res === "w" ? `${me} foran` : m.res === "l" ? `${them} foran` : "likt"}</span></td>
            <td className="tnum">{m.pl == null ? "–" : `${Math.abs(m.pl)}`}</td>
            <td className="tnum muted">{m.gs == null ? "" : `${m.gs < 0 ? "−" : "+"}${clock(Math.abs(m.gs))}`}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="fine">Utfall: den beste plassen i et race begge kjørte vinner. DNF taper mot alle som ble plassert. Tid er forskjellen der det ble tatt tid, negativ når {me} var raskest.</p>
    </div>
  );
}

function HlCard({ title, sub, tone, rows, val, onPick }: { title: string; sub: string; tone?: "pos" | "neg"; rows?: Who[]; val: (r: Who) => [string, string]; onPick: (id: string) => void }) {
  return (
    <div className={`card card-pad hl ${tone || ""}`}>
      <h3 className="h-card">{title}</h3><p className="fine">{sub}</p>
      <ol>
        {(rows || []).slice(0, 5).map((r) => { const [v, s] = val(r); return <li key={r.id}><button type="button" onClick={() => onPick(r.id)}><b>{r.name}</b><span className="tnum">{v}<small className="muted"> {s}</small></span></button></li>; })}
        {!rows?.length && <li className="none muted">Ingen ennå.</li>}
      </ol>
    </div>
  );
}

function OppSearch({ index, self, onPick }: { index: IndexRider[]; self: string; onPick: (r: IndexRider) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const hits = useMemo(() => { const s = fold(q.trim()); if (s.length < 2) return []; return index.filter((r) => r.id !== self && fold(r.name).includes(s)).sort((a, b) => b.races - a.races).slice(0, 6); }, [q, index, self]);
  useEffect(() => { setBusy(false); }, [q]);
  return (
    <div className="opp-search">
      <input type="search" placeholder="Sammenlign med hvem som helst" aria-label="Sammenlign med en annen kjører" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && <ul className="hits" role="listbox">{hits.map((r) => <li key={r.id} role="option" aria-selected={false}><button type="button" disabled={busy} onClick={async () => { setBusy(true); await onPick(r); setQ(""); }}><b>{r.name}</b><small className="tnum muted">{r.races} race</small></button></li>)}</ul>}
    </div>
  );
}
