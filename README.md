# longboardresultater

Resultater fra norske downhill-longboardrace, hentet fra [ndsf.no](https://ndsf.no) (Norges Downhill
Skateboard Forbund). Startet 2026-10-10 som en kopi av koden i
[croahs/rittresultater](https://github.com/croahs/rittresultater), uten sykkeldataene, uten watt og
intervals.icu, og uten historikken.

## Slik henger det sammen

Alt er statisk: Python skriver JSON i `data/`, og siden i `web/` leser bare de filene. Ingen backend,
ingen nøkler.

1. `python3 ndsf.py fetch` henter alle resultatinnlegg fra ndsf.no og skriver `data/ndsf/<år>-<stevne>.json`,
   ett per stevne. Alt den henter, caches i `cache/ndsf/` og committes, så `python3 ndsf.py` uten `fetch`
   bygger om igjen uten nett. `refetch` tømmer cachen først.
2. `python3 sitedata.py` leser `data/ndsf/` og `data/manual/`, gir hver kjører en fast id i `data/riders.json`,
   regner ut innbyrdes oppgjør og skriver det siden leser: `data/races.json`, `data/riders/`,
   `data/summary.json` og `data/site/site.json`.
3. `python3 tracks.py` lager `data/tracks/<bakke>.json` for hver bakke i `data/hills.json` som har start og mål:
   veien fra OpenStreetMap (via OSRM) og høyde fra Kartverkets åpne høydedata, med stigning per strekning.
4. `cd web && pnpm build` kopierer `data/` inn i siden (`web/scripts/copy-data.mjs`) og bygger til `web/dist/`.
   Se `docs/DEPLOY.md` for Cloudflare Pages.

Kjør stegene i den rekkefølgen etter nye innlegg på ndsf.no, og commit `cache/` og `data/`.

## Kilden: ndsf.no

ndsf.no er WordPress uten pene adresser, så REST-API-et ligger på `https://ndsf.no/?rest_route=/wp/v2/posts`.
Resultatinnleggene (kategorien «Resultater» og årskategoriene) har listene i fire former, og `ndsf.py`
leser tre av dem:

| Form | År | Hvordan |
|---|---|---|
| Google Sheets i iframes | 2014– | Hver fane lastes som CSV (`…/pub?output=csv&gid=`), uten innlogging |
| PDF på ndsf.no | 2012–2013 | Tekst via `pdftotext` (poppler). Filene fra 2010–2011 er borte fra serveren |
| Tekst i innlegget | 2007–2010, 2018, 2026 | Nummererte linjer under en overskrift |
| Bilder | 2011–2012 XBoard og KPH, 2025 Granåsen | Må skrives av for hånd i `data/manual/` |

Et stevne (`data/ndsf/2025-ekstremsportveko.json`) har ett eller flere race: `Open`, `NM Open`, `Damer`,
`Masters`, `Luge`, `Tidskjøring` (kvalifisering, rangert på tid) og så videre. `kind` er klassen
(Open, Women, Junior, Masters, Luge, Adaptive, Inline, Other), `format` er `bracket` (heat, bare plassen er
kjent) eller `timed` (tid per rad). Datoen er racedatoen når innlegget oppgir en, ellers datoen innlegget
ble publisert; `date_known: false` betyr at bare året er kjent.

Utenlandske stevner som bare ble omtalt på ndsf.no (Almabtrieb, Padova, IDF-sammendrag, Graveyard Call) er
ikke med; listen står i `SKIP_POSTS` i `ndsf.py`.

### Rette for hånd

- **Et stevne som ikke ble lest** (bilder, borte PDF): skriv `data/manual/<samme-id>.json` i samme form som
  filene i `data/ndsf/`. `sitedata.py` tar den manuelle filen foran den automatiske. `ndsf.py` skriver ut hvilke
  stevner som mangler (`needs manual`).
- **Samme kjører, ulik stavemåte**: `sitedata.py` slår sammen navn med samme ord i annen rekkefølge, én skrivefeil
  eller et mellomnavn mer eller mindre. Resten legges i `"aliases"` på kjøreren i `data/riders.json`.
  `python3 sitedata.py names` lister navn som kan være samme person. Id-ene (`r12`) deles ut i rekkefølge og
  endres aldri; sett `"fixed": true` for å låse navnet slik det står.
- **Bakkene**: `python3 markhills.py` åpner et kart på localhost der du velger bakke, klikker start og mål
  på veien og lagrer. Følger ikke veien racet (OSRM tar raskeste bilvei), legg til via-punkter langs riktig
  vei. Lagring skriver `data/hills.json`, kjører `tracks.py` for bakken og tegner veien med stigning med en gang. Commit `data/hills.json` og `data/tracks/`. `python3 tracks.py check` viser hva som
  gjenstår. (Uten verktøyet: sett `start` og `finish` til `[lat, lon]` i `data/hills.json` for hånd.)

## Hva siden får

`web/` leser `data/site/site.json`, `data/riders/index.json` og `data/riders/shard-NN.json` (hver kjører med
resultater, rivaler og innsikt), `data/races.json` (hver resultatliste, for racesidene og innbyrdes oppgjør
mellom hvem som helst), `data/summary.json` (forsiden og topplistene), `data/hills.json` og
`data/tracks/`. Stigningen i `tracks` er negativ nedover; fargene på siden er rød fra 9 %, oransje fra 7 %,
gul fra 5 %, grønn under 5 % og blå oppover.

Innbyrdes oppgjør: i hvert race begge kjørte, vinner den beste plassen. DNF taper mot alle som fikk plass og
deler mot en annen DNF. Tidskjøringer gir i tillegg avstanden i sekunder og prosent.

## Kjør lokalt

På Windows: bruk `py` (Python-launcheren) i stedet for `python3`, for eksempel `py markhills.py`. I PowerShell
virker også `python`; i Git Bash er det ofte bare `py` som ligger på PATH.

```sh
python3 ndsf.py && python3 sitedata.py && python3 tracks.py
cd web && pnpm install && pnpm build   # eller pnpm dev
```

Python 3.11+ uten ekstra pakker. `pdftotext` trengs bare for å lese PDF-ene på nytt; teksten ligger i cachen.
