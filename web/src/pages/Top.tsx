import { useEffect, useState } from "react";
import { getJSON, type Summary, type Who } from "../data";
import { TYPE_LABEL, dateLong } from "../format";
import { TOP_KINDS, href, type TopKind } from "../nav";
import { Empty, Loading } from "../ui";

/* The top lists behind the front page's record cards: the biggest fields, the closest timed races and the
   riders with most wins. site.py writes them into summary.json. */

const TITLE: Record<TopKind, [string, string]> = {
  felt: ["Største felt", "Racene med flest kjørere i resultatlisten."],
  jevnest: ["Jevneste tidskjøring", "Racene på tid der vinneren slo nummer to med minst."],
  seire: ["Flest seire", "Seire i heat-race: finaler og rankinger, ikke kvalifisering på tid."],
};

export default function Top({ kind }: { kind: TopKind }) {
  const [top, setTop] = useState<Summary["top"] | null | undefined>(undefined);
  useEffect(() => { getJSON<Summary>("summary.json").then((s) => setTop(s.top ?? null)).catch(() => setTop(null)); }, []);
  const who = (w: Who) => (w.page ? <a href={href.rider(w.id)}>{w.name}</a> : <span>{w.name}</span>);
  const [title, lead] = TITLE[kind];
  if (top === undefined) return <Loading what="topplisten" />;
  if (!top) return <Empty title="Fant ikke topplisten" />;
  return (
    <section className="race-page" aria-labelledby="h-top">
      <div className="section-head">
        <div><p className="eyebrow">Toppliste</p><h1 className="h-display" id="h-top">{title}</h1><p className="lead">{lead}</p></div>
        <nav className="chips" aria-label="Topplister">{TOP_KINDS.map((k) => <a key={k} className="chip" aria-current={k === kind ? "page" : undefined} href={href.top(k)}>{TITLE[k][0]}</a>)}</nav>
      </div>
      <div className="card table-wrap"><table className="sheet top">
        {kind === "felt" && <>
          <thead><tr><th>#</th><th>Kjørere</th><th className="l">Race</th><th className="l">Klasse</th><th className="l">Dato</th></tr></thead>
          <tbody>{top.biggest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{r.riders}</td><td className="l"><a href={href.race(r.id)}>{r.name}</a></td><td className="l"><span className="swatch"><i />{r.cls || TYPE_LABEL[r.type]}</span></td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "jevnest" && <>
          <thead><tr><th>#</th><th>Skilte</th><th className="l">Race</th><th className="l">Vinner</th><th className="l">Nummer to</th><th className="l">Dato</th></tr></thead>
          <tbody>{top.closest.map((r, i) => (
            <tr key={r.id} className={`type-${r.type}`}><td className="tnum">{i + 1}</td><td className="tnum big">{String(r.gap_s).replace(".", ",")} s</td><td className="l"><a href={href.race(r.id)}>{r.name}</a><span className="muted"> · {r.cls}</span></td><td className="l">{who(r.a)}</td><td className="l">{who(r.b)}</td><td className="l muted">{dateLong(r.date)}</td></tr>
          ))}</tbody>
        </>}
        {kind === "seire" && <>
          <thead><tr><th>#</th><th>Seire</th><th className="l">Kjører</th></tr></thead>
          <tbody>{top.wins.map((r, i) => (
            <tr key={r.id}><td className="tnum">{i + 1}</td><td className="tnum big">{r.wins}</td><td className="l">{who(r)}</td></tr>
          ))}</tbody>
        </>}
      </table></div>
    </section>
  );
}
