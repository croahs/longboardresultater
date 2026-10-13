# Publisering på Cloudflare Pages

Siden er en statisk side (Vite, React og TypeScript) i mappen `web/`. Den leser JSON-filer som ligger i repoet, og ingenting annet: ingen database, ingen serverfunksjoner, ingen API-kall. Det trengs ingen API-nøkler ved bygging.

## Slik henger det sammen

- Python-skriptene i roten av repoet skriver `data/`: `races.json`, `riders/`, `summary.json` og `site/site.json` (`sitedata.py`), og `hills.json` og `tracks/` (`markhills.py` og `tracks.py`). `videos.json` holdes for hånd.
- `pnpm build` i `web/` kopierer `data/` inn i siden (`web/scripts/copy-data.mjs`) og bygger til `web/dist/`.
- Byggingen på Cloudflare kjører bare det siste steget, og den gjør ingen nettverkskall.
- `web/public/_headers` følger med i bygget. Den setter sikkerhetshoder og caching. Siden er offentlig og kan indekseres av søkemotorer.
- Node-versjonen er låst med `web/.nvmrc` (22), og pnpm-versjonen med `packageManager` i `web/package.json`.

`Content-Security-Policy` i `web/public/_headers` sørger for at siden bare kan kjøre sine egne skript og bare hente data fra seg selv. Legger du til en ny tjeneste, må den også legges inn der.

## Bygg og test lokalt

```
cd web
pnpm install
pnpm dev        # utviklingsserver på http://localhost:5173
pnpm build      # det samme som Cloudflare kjører, resultat i web/dist
pnpm preview    # server web/dist på http://localhost:4173
```

Etter nye resultater: kjør pipelinen i roten av repoet (se `README.md`) og commit `cache/` og `data/`.

## 1. Opprett Pages-prosjektet (cirka 5 minutter)

1. Lag en gratis konto på https://dash.cloudflare.com/sign-up, eller logg inn.
2. Gå til **Workers & Pages → Create → Pages → Connect to Git**.
3. Koble til GitHub og gi Cloudflare tilgang til bare dette repoet.
4. Fyll inn innstillingene for byggingen:
   - **Project name:** `longboardresultater` (gir adressen `longboardresultater.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** None (eller Vite)
   - **Root directory (advanced):** `web`
   - **Build command:** `pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory:** `dist`
   - Hvis bygget klager på Node-versjonen: legg inn miljøvariabelen `NODE_VERSION` = `22`.
5. Trykk **Save and Deploy**.

Fra nå av publiseres hver push til `main` automatisk. Andre grener får hver sin forhåndsvisning på `<gren>.longboardresultater.pages.dev`.

**Viktig:** Gjør steg 2 før du deler adressen med noen. Adressen er åpen fra første bygg.

## 2. Hold siden privat til du er klar (Cloudflare Access)

Innstillingen «Enable access policy» på selve Pages-prosjektet beskytter bare forhåndsvisningene, ikke hovedadressen. Hovedadressen må derfor beskyttes med en egen Access-applikasjon:

1. Gå til **Zero Trust** i Cloudflare-dashbordet og velg Free-planen (gratis opptil 50 brukere). Cloudflare kan be om et betalingskort selv på gratisplanen.
2. Gå til **Access → Applications → Add an application → Self-hosted**.
   - **Application name:** Longboardresultater
   - **Domain:** `longboardresultater.pages.dev`. Legg også til `*.longboardresultater.pages.dev`, som dekker forhåndsvisningene.
3. Legg til en policy:
   - **Action:** Allow
   - **Include → Emails:** e-postadressen din, og eventuelt andre som skal få se siden før lansering.
4. Innloggingsmetode: «One-time PIN» er skrudd på som standard, og da får du en kode på e-post.
5. Lagre, og åpne `https://longboardresultater.pages.dev` i et privat nettleservindu. Du skal få Cloudflares innloggingsside, ikke selve siden.

### Reserveløsning uten Zero Trust

Hvis Zero Trust-registreringen er et hinder, kan en liten Pages Function i `web/functions/_middleware.js` kreve et passord (Basic auth) før siden vises. Passordet legges da inn som en miljøvariabel i Pages-prosjektet. Det er enklere å sette opp, men svakere enn Access.

## 3. Lansering (når du er fornøyd)

1. Slett Access-applikasjonen, eller endre policyen til **Everyone**.
2. Valgfritt: legg til eget domene under **Custom domains** i Pages-prosjektet.

Før lansering bør du vite dette:
- Siden viser andre utøveres navn og innbyrdes oppgjør. Resultatene er offentlige hos NDSF, IGSA (via Wayback Machine), IDF og WDSC, men sammenstillingen er ny. Kontaktadressen står i `"contact"` i `site.json` og vises nederst på siden, slik at folk kan be om retting eller fjerning.

## 4. Nye resultater

Når nye data committes til `main`, bygger Cloudflare siden på nytt av seg selv.
