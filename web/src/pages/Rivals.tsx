import { useEffect, useMemo, useState } from "react";
import { RACE_TYPES, headToHead, record, withMeetings, type Athlete, type IndexRider, type Opponent, type RaceType, type Who } from "../data";
import { clock, count, dateShort, firstName, fold, typeLabel } from "../format";
import { t } from "../lang";
import { href } from "../nav";
import { Empty, Failed, Loading } from "../ui";

/* Who the rider races against. The closest rivals come from sitedata.py (met at least three times, few places
   between, an even record); any other rider can be compared through the search box. */

type TabKey = "closest" | RaceType;

export default function Rivals({ a, index }: { a: Athlete; index: IndexRider[] }) {
  const [full, setFull] = useState<Athlete | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let live = true; withMeetings(a).then((x) => live && setFull(x)).catch(() => live && setErr(true)); return () => { live = false; }; }, [a]);
  if (err) return <Failed what={t("oppgjørene", "the meetings")} />;
  return full ? <RivalsOf a={full} index={index} /> : <Loading what={t("oppgjørene", "the meetings")} />;
}

function RivalsOf({ a, index }: { a: Athlete; index: IndexRider[] }) {
  const [extra, setExtra] = useState<Map<string, Opponent>>(new Map());
  const O = useMemo(() => new Map([...a.opponents, ...extra]), [a.opponents, extra]);
  const ins = a.insights;
  const ids = (k: TabKey): string[] => (k === "closest" ? a.rivals : (ins.rivals_by_type?.[k] || []).map((r) => r.id)).filter((id) => O.has(id));
  const tabs = useMemo(() => (["closest", ...RACE_TYPES] as TabKey[]).filter((k) => ids(k).length), [a, O]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<TabKey>("closest");
  const [cur, setCur] = useState<string | undefined>(() => ids("closest")[0] || ids(tabs[0] || "closest")[0]);
  const who = firstName(a.name);
  const open = (id: string) => { setCur(id); setTimeout(() => document.getElementById("duel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); };
  const compare = async (r: IndexRider) => {
    if (!O.has(r.id)) { const o = await headToHead(a.id, r); setExtra((m) => new Map(m).set(r.id, o)); }
    open(r.id);
  };
  const o = cur ? O.get(cur) : undefined;
  const list = ids(tabs.includes(tab) ? tab : tabs[0] || "closest");
  return (
    <>
      <div className="section-head">
        <div><p className="eyebrow">{t("Innbyrdes", "Head to head")}</p><h2 className="h-section">{t("Rivalene", "The rivals")}</h2><p className="lead">{t(`Jevneste er kjørere ${who} har møtt minst tre ganger, med få plasser mellom og jevn stilling. Velg en for å se hvert oppgjør, eller søk opp hvem som helst.`, `Closest are riders ${who} has met at least three times, with few places between and an even score. Pick one to see every meeting, or look up anyone.`)}</p></div>
        <OppSearch index={index} self={a.id} onPick={compare} />
      </div>
      <div className="rivals-layout">
        <div className="rival-list card">
          {tabs.length > 1 && <div className="chips" role="tablist" aria-label={t("Klasse", "Class")}>{tabs.map((k) => <button key={k} type="button" role="tab" className="chip" aria-selected={tab === k} onClick={() => { setTab(k); setCur(ids(k)[0]); }}>{k === "closest" ? t("Jevneste", "Closest") : typeLabel(k)}</button>)}</div>}
          <ol>
            {list.map((id, i) => { const x = O.get(id)!; const ms = tab === "closest" ? x.ms : x.ms.filter((m) => m.type === tab); const rec = record(ms); return (
              <li key={id}><button type="button" aria-pressed={cur === id} onClick={() => open(id)}>
                <span className="rank tnum">{i + 1}</span><span className="who"><b>{x.name}</b><small className="muted">{count(ms.length, ["møte", "møter"], "meeting")}</small></span>
                <span className={`rec tnum ${rec.w > rec.l ? "pos" : rec.w < rec.l ? "neg" : ""}`}>{rec.w}–{rec.l}</span>
              </button></li>
            ); })}
            {list.length === 0 && <li className="none muted">{t("Ingen jevne rivaler ennå. Det trengs minst tre møter.", "No close rivals yet. It takes at least three meetings.")}</li>}
          </ol>
        </div>
        <div id="duel">{o ? <Duel a={a} o={o} inIndex={index.some((r) => r.id === o.id)} /> : <Empty title={t("Velg en rival", "Pick a rival")} />}</div>
      </div>

      <section className="section" aria-labelledby="h-hl">
        <div className="section-head"><div><p className="eyebrow">{t("Fra oppgjørene", "From the meetings")}</p><h2 className="h-section" id="h-hl">{t("Mønstre", "Patterns")}</h2></div></div>
        <div className="hl-cards">
          <HlCard title="Nemesis" sub={t(`Jevnbyrdige som slår ${who} oftest`, `Even matches who beat ${who} most often`)} tone="neg" rows={ins.nemesis} val={(r) => [`${r.wins}–${r.losses}`, count(r.races!, ["møte", "møter"], "meeting")]} onPick={open} />
          <HlCard title={t("Offer", "Victims")} sub={t(`Jevnbyrdige ${who} slår oftest`, `Even matches ${who} beats most often`)} tone="pos" rows={ins.victims} val={(r) => [`${r.wins}–${r.losses}`, count(r.races!, ["møte", "møter"], "meeting")]} onPick={open} />
          <HlCard title={t("Jakten", "The chase")} sub={t(`Ender oftest 1–3 plasser foran ${who}`, `Most often end 1–3 places ahead of ${who}`)} rows={ins.right_ahead} val={(r) => [`${(r as Who & { right_ahead: number }).right_ahead}×`, `${t("av", "of")} ${count(r.races!, ["møte", "møter"], "meeting")}`]} onPick={open} />
          <HlCard title={t("I nakken", "On the tail")} sub={t(`Ender oftest 1–3 plasser bak ${who}`, `Most often end 1–3 places behind ${who}`)} rows={ins.right_behind} val={(r) => [`${(r as Who & { right_behind: number }).right_behind}×`, `${t("av", "of")} ${count(r.races!, ["møte", "møter"], "meeting")}`]} onPick={open} />
          {!!ins.overtaken?.length && <HlCard title={t("Snudd", "Turned")} sub={t(`Slo ${who} ett år, tapte året etter`, `Beat ${who} one year, lost the year after`)} rows={ins.overtaken} val={(r) => [`${(r as Who & { lost_in: string }).lost_in} → ${(r as Who & { beat_in: string }).beat_in}`, count(r.races!, ["møte", "møter"], "meeting")]} onPick={open} />}
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
        <div className="duel-mid"><span className="eyebrow">{t("møter", "meetings")}</span><b className="tnum">{o.ms.length}</b>{draws > 0 && <small className="muted">{count(draws, "uavgjort", "draw")}</small>}</div>
        <div className="duel-side right"><span className="eyebrow">{inIndex ? <a href={href.rider(o.id)}>{o.name}</a> : o.name}</span><b className="duel-n tnum neg">{rec.l}</b></div>
      </div>
      <p className="duel-sum">
        {rec.w === rec.l ? t("Helt jevnt", "Dead even") : t(`${rec.w > rec.l ? me : them} leder`, `${rec.w > rec.l ? me : them} leads`)}{med != null ? t(`, typisk ${Math.abs(med)} ${Math.abs(med) === 1 ? "plass" : "plasser"} ${med < 0 ? "foran" : "bak"} ${them}`, `, typically ${Math.abs(med)} ${Math.abs(med) === 1 ? "place" : "places"} ${med < 0 ? "ahead of" : "behind"} ${them}`) : ""}.
        {first && last && first !== last ? t(` Første møte ${first.date.slice(0, 4)}, siste ${last.date.slice(0, 4)}.`, ` First meeting ${first.date.slice(0, 4)}, last ${last.date.slice(0, 4)}.`) : ""}
      </p>
      <div className="table-wrap"><table className="sheet meetings">
        <thead><tr><th className="l">Race</th><th className="l">{t("Klasse", "Class")}</th><th>{t("Utfall", "Result")}</th><th>{t("Plasser", "Places")}</th><th>{t("Tid", "Time")}</th></tr></thead>
        <tbody>{[...o.ms].reverse().map((m, i) => (
          <tr key={i} className={m.res}>
            <td className="l"><b>{m.race}</b> <span className="muted">{dateShort(m.date)} {m.date.slice(0, 4)}</span></td>
            <td className="l muted">{m.mc || typeLabel(m.type)}</td>
            <td><span className={`res ${m.res}`}>{m.res === "d" ? t("likt", "tie") : `${m.res === "w" ? me : them} ${t("foran", "ahead")}`}</span></td>
            <td className="tnum">{m.pl == null ? "–" : `${Math.abs(m.pl)}`}</td>
            <td className="tnum muted">{m.gs == null ? "" : `${m.gs < 0 ? "−" : "+"}${clock(Math.abs(m.gs))}`}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="fine">{t(`Utfall: den beste plassen i et race begge kjørte vinner. DNF taper mot alle som ble plassert. Tid er forskjellen der det ble tatt tid, negativ når ${me} var raskest.`, `Result: the better place in a race both rode wins. A DNF loses to everyone placed. Time is the gap where it was timed, negative when ${me} was faster.`)}</p>
    </div>
  );
}

function HlCard({ title, sub, tone, rows, val, onPick }: { title: string; sub: string; tone?: "pos" | "neg"; rows?: Who[]; val: (r: Who) => [string, string]; onPick: (id: string) => void }) {
  return (
    <div className={`card card-pad hl ${tone || ""}`}>
      <h3 className="h-card">{title}</h3><p className="fine">{sub}</p>
      <ol>
        {(rows || []).slice(0, 5).map((r) => { const [v, s] = val(r); return <li key={r.id}><button type="button" onClick={() => onPick(r.id)}><b>{r.name}</b><span className="tnum">{v}<small className="muted"> {s}</small></span></button></li>; })}
        {!rows?.length && <li className="none muted">{t("Ingen ennå.", "None yet.")}</li>}
      </ol>
    </div>
  );
}

function OppSearch({ index, self, onPick }: { index: IndexRider[]; self: string; onPick: (r: IndexRider) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const hits = useMemo(() => { const s = fold(q.trim()); if (s.length < 2) return []; return index.filter((r) => r.id !== self && fold(r.name).includes(s)).sort((a, b) => b.races - a.races).slice(0, 6); }, [q, index, self]);
  useEffect(() => { setBusy(false); setErr(false); }, [q]);
  return (
    <div className="opp-search">
      <input type="search" placeholder={t("Sammenlign med hvem som helst", "Compare with anyone")} aria-label={t("Sammenlign med en annen kjører", "Compare with another rider")} value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="fine" role="alert">{t("Fikk ikke hentet oppgjørene. Prøv igjen.", "Could not load the meetings. Try again.")}</p>}
      {hits.length > 0 && <ul className="hits" role="listbox">{hits.map((r) => <li key={r.id} role="option" aria-selected={false}><button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(false); try { await onPick(r); setQ(""); } catch { setBusy(false); setErr(true); } }}><b>{r.name}</b><small className="tnum muted">{count(r.races, "race", "race")}</small></button></li>)}</ul>}
    </div>
  );
}
