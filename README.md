# longboardresultater

Resultater fra longboardritt. Startet 2026-10-10 som en kopi av koden i
[croahs/rittresultater](https://github.com/croahs/rittresultater), uten sykkeldataene og uten historikken.

## Hva som er med

- `web/`: dashbordet (Vite, React og TypeScript), og `web/functions/` for Cloudflare Pages Functions og D1.
- Python-pipelinen fra rittresultater (`update.py`, `rivals.py`, `export_web.py`, `riderids.py`, `registry.py`,
  kildene `eqtiming.py`, `raceresult.py`, `ultimate.py`, `turritt.py`, `sskcup.py`). Den er sykkelspesifikk og er
  bare et utgangspunkt. Den skrives om når vi vet hvor longboardresultatene publiseres.
- `data/`: tomme filer, så `pnpm build` virker. `data/land/` (land og hav for kartet) er kopiert med.
- `.github/workflows/web.yml`: bygger siden på hver PR. Jobbene for innhøsting, kø og ukentlig oppdatering er ikke med.

## Gjenstår

- Finne kildene for longboardresultater (hvilke tidtakere eller sider som publiserer listene).
- Bytte rittyper (Landevei, Grus, Tempo, Terreng) med disipliner, og sykkeltekst på forsiden.
- Ny Cloudflare Pages-side og egen D1-database, se `docs/DEPLOY.md`.

## Kjør lokalt

```sh
cd web && pnpm install && pnpm build   # eller pnpm dev
```
