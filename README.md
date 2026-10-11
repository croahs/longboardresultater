# longboardresultater

Resultater fra downhill-longboardrace: de norske fra [ndsf.no](https://ndsf.no) (Norges Downhill
Skateboard Forbund), og de internasjonale fra IGSA (1997–2015, via Wayback Machine), IDF (2015–2019) og
WDSC (2022–). Startet 2026-10-10 som en kopi av koden i
[croahs/rittresultater](https://github.com/croahs/rittresultater), uten sykkeldataene, uten watt og
intervals.icu, og uten historikken.

## Slik henger det sammen

Alt er statisk: Python skriver JSON i `data/`, og siden i `web/` leser bare de filene. Ingen backend,
ingen nøkler.

1. `python3 ndsf.py fetch` henter alle resultatinnlegg fra ndsf.no og skriver `data/ndsf/<år>-<stevne>.json`,
   ett per stevne. Alt den henter, caches i `cache/ndsf/` og committes, så `python3 ndsf.py` uten `fetch`
   bygger om igjen uten nett. `refetch` tømmer cachen først.
2. `python3 igsa.py fetch`, `python3 idf.py fetch` og `python3 wdsc.py fetch` gjør det samme for de internasjonale
   kildene: `data/igsa/`, `data/idf/` og `data/wdsc/`, med cache i `cache/<kilde>/`. Se «De internasjonale kildene».
3. `python3 sitedata.py` leser alle mappene under `data/` (`SOURCES` i `sitedata.py`: `igsa`, `idf`, `wdsc`,
   `ndsf`, `manual`, der en senere mappe vinner over en tidligere for samme stevne-id, så lenge den har lister:
   ndsf.no vinner over IGSA/IDF for et norsk race, en manuell fil vinner over alt), gir hver kjører en fast id i `data/riders.json`,
   regner ut innbyrdes oppgjør og skriver det siden leser: `data/races.json`, `data/riders/`,
   `data/summary.json` og `data/site/site.json`.
4. `python3 tracks.py` lager `data/tracks/<bakke>.json` for hver bakke i `data/hills.json` som har start og mål:
   veien fra OpenStreetMap (via OSRM) og høyde fra Kartverkets åpne høydedata, med stigning per strekning.
5. `cd web && pnpm build` kopierer `data/` inn i siden (`web/scripts/copy-data.mjs`) og bygger til `web/dist/`.
   Se `docs/DEPLOY.md` for Cloudflare Pages.

Kjør stegene i den rekkefølgen etter nye innlegg på ndsf.no (eller nye runder hos WDSC), og commit `cache/` og `data/`.

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
  endres aldri; sett `"fixed": true` for å låse navnet slik det står. Profilen viser registernavnet, mens
  racelistene med vilje viser navnet slik kilden skrev det.
- **Bakkene**: `python3 markhills.py` åpner et kart på localhost der du velger bakke, klikker start og mål
  på veien og lagrer. Følger ikke veien racet (OSRM tar raskeste bilvei), legg til via-punkter langs riktig
  vei. Lagring skriver `data/hills.json`, kjører `tracks.py` for bakken og tegner veien med stigning med en gang. Commit `data/hills.json` og `data/tracks/`. `python3 tracks.py check` viser hva som
  gjenstår. (Uten verktøyet: sett `start` og `finish` til `[lat, lon]` i `data/hills.json` for hånd.)

## De internasjonale kildene

Samme filform som `data/ndsf/`, pluss `place` (sted eller land) og for IGSA `level` (World Cup, Continental …).
Kjørerne matches på navn på tvers av kildene, så en nordmann som kjørte Kozakov får det på siden sin.
Alle tre hentere leser cachen uten nett; `fetch` henter det som mangler (IGSA) eller alt på nytt (IDF, WDSC),
`refetch` tømmer cachen først.

| Kilde | År | Hvor | Hva vi leser |
|---|---|---|---|
| IGSA (`igsa.py`) | 1997–2015 (tyngst 2009–2013) | igsaworldcup.com er borte; Wayback Machine har `/results/<år>/`-filene, funnet via CDX-indeksen (`cache/igsa/cdx.json`) | Én PDF per stevne og liste (kvalik og finale) fra 2009, Excel-eksportert HTML 2005–2008. Toppen gir stevne, sted, dato og nivå; så én seksjon per klasse. Finalelisten rangerer alle som kjørte (heatene avgjør), kvaliklisten har tider |
| IDF (`idf.py`) | 2015–2019 | internationaldownhillfederation.org/rankings/: HTML-tabeller på `rankings.`-underdomenet (2015–2018) og Google Sheets (2019) | Sesongrankingen per klasse og region gir plass per race for hver rangert kjører; lest kolonne for kolonne er det hvert race sin liste (bare de som fikk plass, ingen DNF). Dato og land fra `/races/<år>/`. 2013–2014 har bare sesongsum, 2020– ble aldri rangert |
| WDSC (`wdsc.py`) | 2022– | worlddownhillskateboardingchampionship.com, standings-sidene i menyen «Riders & Standings» | HTML-tabeller per stevne og klasse, med serien (CT = Championship Tour, QS = Qualifying Series) i racenavnet, og kvaliktider der de finnes. 2022–2023 gir også plass per race i sesongtabellen (flere kjørere enn topp 10-listene). 2019 har bare sesongpoeng |

Kjente hull: de fleste IGSA-filene fra 2009 (og noen fra 2010–2011 med et rart skilletegn i navnet) er aldri arkivert,
Wayback har bare feilsider for dem; IGSA-PDF-ene mister bokstaver utenfor ASCII (ø skrives inn igjen for NOR-kjørere, ellers faller
bokstaven bort); noen Wayback-filer er feilsider (statuskode 200, men HTML), de hoppes over; WDSC-stevner
uten dato i overskriften får 1. januar med `date_known: false`; IDF-race som ikke står på `/races/<år>/`
får det samme og en note. `python3 <kilde>.py` skriver ut hva som ble lest og notene.

## Norge-utvalget

Siden har en bryter øverst, «Norge | Verden» (Norge er standard, valget huskes i nettleseren). Norge viser
racene kjørt i Norge og kjørerne i Norge-utvalget: nasjonalitet NOR i en liste (IGSA, IDF, WDSC), eller minst
halvparten av racene kjørt i Norge (NDSF-listene oppgir ikke nasjonalitet; en svenske som bare kjører her er
med, en proff med ett race på Lillehammer er ikke). `"norsk": true` eller `false` på kjøreren i
`data/riders.json` overstyrer. `sitedata.py` regner det ut (`norwegians`) og skriver det som `no` på kjørere,
racerader og motstandere, `norway` på race, egne lister (`now_no`, `peak_no`, `top_no`, `summary.json` →
`no`) og `rank_no` i ratingen. Ratingen selv er den samme; bare listene er filtrert.

## Hva siden får

`web/` leser `data/site/site.json`, `data/riders/index.json` og `data/riders/shard-NN.json` (hver kjører med
resultater, rivaler og innsikt), `data/races.json` (hver resultatliste, for racesidene og innbyrdes oppgjør
mellom hvem som helst), `data/summary.json` (forsiden og topplistene), `data/hills.json` og
`data/tracks/`. Stigningen i `tracks` er negativ nedover; fargene på siden er rød fra 9 %, oransje fra 7 %,
gul fra 5 %, grønn under 5 % og blå oppover.

Innbyrdes oppgjør: i hvert race begge kjørte, vinner den beste plassen. DNF taper mot alle som fikk plass og
deler mot en annen DNF. Tidskjøringer gir i tillegg avstanden i sekunder og prosent.

Rating (`summary.json` → `rating`, og `rating` på hver kjører): Elo i to pooler, `race` (heat, `format: bracket`)
og `kvalik` (`format: timed`), over klassene Open, Damer, Junior og Masters (luge, adaptive, inline og annet
er andre disipliner). Hvert race er et oppgjør mot alle andre i listen etter samme regel som innbyrdes oppgjør;
kjørerens poeng er andelen oppgjør vunnet, forventningen er snittet av Elo-forventningen mot hver, og ratingen
flyttes K ganger differansen (K = 40 de første 8 racene i poolen, så 24; alle starter på 1500). Ratingen
faller ikke av seg selv: «nå» er kjørere med minst 5 race i poolen som har kjørt de siste to sesongene,
«alle tider» er høyeste rating noen har hatt, og «sesong for sesong» er topp 5 ved sesongslutt blant dem som
kjørte den sesongen. Tallene er bare sammenlignbare innenfor samme pool, og nykommere som kjører ett race og
forsvinner drar poeng ut av systemet, så ratingene i store felt (2014–) ligger litt høyere enn i de små
feltene før. Konstantene står øverst i `sitedata.py`.

Hvert rated resultat på kjøreren har også `elo` (ratingen etter racet) og `elo_d` (hva racet flyttet), som
siden viser i «Alle race», i racedetaljen og som kurve under «Utvikling». `rating.<pool>.timeline` er den
samme historikken for kjørerne på «nå»- og «alle tider»-listene (også Norge-utvalgets), til kurven på
ratingsiden. `hill_rating` er den samme Elo-en regnet bare over racene i én bakke, per pool, for kjørere
med minst 3 race der, med antall seiere og snittplassering i bakken (DNF teller som race, ikke som
plassering): hvem som er best i akkurat den bakken, på bakkesiden.

## Kjør lokalt

På Windows: bruk `py` (Python-launcheren) i stedet for `python3`, for eksempel `py markhills.py`. I PowerShell
virker også `python`; i Git Bash er det ofte bare `py` som ligger på PATH.

```sh
python3 ndsf.py && python3 igsa.py && python3 idf.py && python3 wdsc.py && python3 sitedata.py && python3 tracks.py
cd web && pnpm install && pnpm build   # eller pnpm dev
```

Python 3.11+ uten ekstra pakker. `pdftotext` trengs bare for å lese PDF-ene på nytt; teksten ligger i cachen.
