# Lokal verifisering

## Overført informasjon med fortsatt oppfølging

**112 tester i åtte filer besto**, samt lint, TypeScript-kontroll, produksjonsbygg, `git diff --check` og hemmelighetssjekk. Fem nye tester dekker korrekt overførte åpne saker i demoen, fjerning av oppfølgingsteksten, eksplisitt vurdert overføring, manglende notatsitat, falskt sitat og manglende eksplisitt vurdering. Demoens samlede forslag gir nå åtte dekkede punkter, hvorav to fortsatt krever oppfølging; alle opprinnelige ID-er og kilder beholdes. Gemini-grensen ble testet med mockede svar, uten nye live-kall. Endringen dokumenterer dekning i notatet, ikke at en kildekonflikt er løst.

## Valgfri vurdering av dekkede krav

**107 tester i åtte filer besto**, samt lint, TypeScript-kontroll, produksjonsbygg og hemmelighetssjekk. Nye tester viser at bare potensielt manglende funn og funn som må avklares sperrer videreføring, at alle dekkede krav kan stå uten menneskelig beslutning, og at alle opprinnelige funn fortsatt følger med til ny kontroll. Demo og forslagsruten ble testet uten vurderinger på dekkede krav; Gemini ble mocket i rutetesten, og ingen nye API-kall ble brukt. Dokumentasjon og fremdriftstekster er tilpasset denne regelen.

## Oppfølging: dupliserte avgrensningsfunn

Regresjonskontrollen besto med **103 tester i åtte filer**. Tre nye tester dekker samme fakturakonflikt med motsatt primærkilde i begge rekkefølger, samt at forskjellige kildeutdrag ikke slås sammen. Lint, separat TypeScript-kontroll og produksjonsbygg besto.

Et ekte kall gjennom `/api/analyze` med tre syntetiske Fjordlogistikk-dokumenter og `gemini-3.5-flash-lite` returnerte HTTP 200 på 10,3 sekunder. Fakturamigrering ble vist som ett konfliktfunn med verifiserte sitater fra både avtale og korrespondanse. Alle oppgitte sitater ble verifisert. Kjøringen ga totalt syv funn og utelot det generelle oppsettspunktet som var med i forrige kjøring; dette viser fortsatt variasjon i første uttrekk. Ingen generell fullstendighet eller treffsikkerhet er dokumentert av denne enkelttesten. Eksisterende analyser endres ikke; nytt kontrollgrunnlag får du ved en ny analyse.

## Flerdokumentversjonen – 22. oktober 2026

Denne delen gjelder dagens utvidelse med signert avtale, internnotat og inntil tre valgfrie salgskilder. Historikken nedenfor og den uendrede JSON-rapporten fra 20. oktober gjelder bare todokumentversjonen.

| Kontroll             | Faktisk resultat                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`          | **100 tester i åtte filer besto**, uten Gemini-kvote. 28 fokuserte flerdokumenttester kommer i tillegg til de 72 eksisterende regresjonstestene.                                                            |
| `pnpm lint`          | Besto uten feil eller advarsler.                                                                                                                                                                            |
| `pnpm typecheck`     | Besto separat etter fullført produksjonsbygg.                                                                                                                                                               |
| `pnpm build`         | Next.js-produksjonsbygg med Webpack besto, inkludert `/api/reanalyze`.                                                                                                                                      |
| `pnpm secrets:check` | Besto for publiseringskandidater og lokal Git-historikk. Ingen støttede hemmelighetsmønstre eller lokal nøkkel funnet.                                                                                      |
| Nye dokumentplasser  | Tester dekker alle tre valgfrie ID-er, dokumenttype, obligatoriske filer og avvisning av en fjerde støttekilde. Ekte TXT-uttrekk og HTTP-opplasting ble kjørt lokalt.                                       |
| Kilder og autoritet  | Tester dekker sitat i feil fil, primær- og tilleggssitater, ikke-opplastede kilder, eksakte duplikater, ulike krav med samme sitatavsnitt, konflikter og forsøk på å gjøre en støttekilde til avtalevilkår. |
| Grenser              | Tester dekker uendret 20 000-grense per fil, 40 000 samlet og tekstbudsjett for generert/erstattet notat. Ingen skjult avkorting.                                                                           |
| Fast grunnlag        | Tester dekker tomt svar og delvis svar som utelater korrespondansefunnet. Alle opprinnelige funn og kilder beholdes, og godkjenning sperres til alle er vurdert.                                            |
| Todokumentregresjon  | De opprinnelige to filene fungerer fortsatt uten valgfrie kilder. Datasettets tekster og fasit er ikke endret; bare dokumentmetadata og generiske kildefelt er tilpasset dagens skjema.                     |

### Faktisk Gemini-kontroll av syntetiske flerdokumenter

Modell: **gemini-3.5-flash-lite**, eksplisitt valgt i lokal konfigurasjon. Ingen automatisk retry, modellbytte eller demofallback ble brukt.

Første forsøk brukte den utvidede Fjordlogistikk-demoen med tre dokumenter. Analysen returnerte syv funn, ett ERP-funn og én kildekonflikt, med alle oppgitte sitater verifisert. Møteønsket ble ikke skilt ut som et eget funn fra korrespondansen. Det påfølgende faktiske forslagskallet traff tidsgrensen på 60 sekunder; hele live-forslagsflyten er derfor ikke bekreftet i denne kjøringen. Forslagskallet med nye kildefelter er testet med SDK-mock.

Instruksen ble deretter presisert om selvstendig informasjon fra hver støttekilde. Et nytt, kort syntetisk eksempel med signert avtale, internnotat og kunde-e-post fullførte:

- Første analyse: **tre funn**, inkludert ett fra korrespondansen med Teams-ønsket. Modellens to konfliktmerkede funn og alle oppgitte sitater ble validert; ingen uverifiserte sitater.
- Ny kontroll mot et syntetisk redigert notat: **tre av tre opprinnelige funn vurdert**, samme ID-er, primærkilder og tilleggssitater; ingen uverifiserte sitater.

Dette er funksjonstester på to syntetiske eksempler, ikke en ny presisjonsmåling eller dokumentasjon på at alle støtteopplysninger alltid oppdages. Den manglende separate oppføringen og timeouten er relevante begrensninger. Historiske tall på 71,4 % og fire identifiserte utelatelser gjelder fortsatt bare den gamle todokumentkjøringen; de er ikke overført til flerdokumentversjonen.

### Nettleserkontroll

Demoen lastet avtale, internnotat og fiktiv kunde-e-post uten API-kall. Den viste **åtte funn: to potensielt manglende, tre som må avklares og tre dekkede**. ERP-punktet hadde avtale og korrespondanse som kilder i ett funn. Fakturamigrering viste motstridende, verifiserte sitater fra avtalen og e-posten; Teams-ønsket var merket som salgsinformasjon som krever bekreftelse.

Alle åtte ble vurdert. Demoen laget et merket regelbasert notat med åpne avklaringspunkter, og ny kontroll beholdt alle åtte ID-er: seks dekket og to fortsatt til avklaring. Manuell godkjenning fungerte. Etter en redigering forsvant godkjenningen, ny kontroll ble tilgjengelig, og tekstsammenligningen viste den manuelle linjen som et grønt tillegg.

Fjerning av korrespondansen nullstilte resultater og vurderinger, mens de to obligatoriske dokumentene fortsatt var klare for analyse. Oppdatering av siden returnerte til en tom kontroll på steg 01.

Se [skjermbildet av kildekonflikten](multi-source-preview.png). Ingen historiske evalueringsrapporter er endret. Ingen prosjektcommit eller push er utført for utvidelsen.

---

# Historisk verifisering – todokumentversjonen

Utført 20. oktober 2026. Funksjonstester med SDK-mock og faktiske Gemini-resultater rapporteres separat.

## Kontrollstatus ved den historiske kjøringen

| Kontroll           | Resultat                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Automatiske tester | 57 tester i fem filer besto uten Gemini-kvote.                                                                         |
| Lint               | Besto uten feil eller advarsler.                                                                                       |
| TypeScript         | Separat kontroll besto etter fullført bygg.                                                                            |
| Produksjonsbygg    | Next.js-produksjonsbygg med Webpack besto.                                                                             |
| Startside          | Lokal side starter på steg 01 uten tidligere dokumenter eller resultater.                                              |
| Opplasting         | Begge syntetiske TXT-filer ble lastet opp i nettleseren. Filnavn og tekstuttrekk ble vist.                             |
| PDF                | Ekte parser testet mot generert tekst-PDF, teksttom PDF og ugyldig PDF-signatur.                                       |
| Kilder og review   | Kildefremvisning, filtre, bekreft/avvis/angre og kommentarer ble kontrollert i nettleseren.                            |
| Responsivitet      | 390 × 844 og 1440 × 1000 kontrollert uten horisontal overflow.                                                         |
| Demo               | Syv funn: to potensielt manglende, én datokonflikt og fire dekkede. Ingen AI-kall. «Lukk demo» nullstiller kontrollen. |
| Live-evaluering    | Ti av ti syntetiske tilfeller fullført med `gemini-3.5-flash-lite`. Se rårapporten nedenfor.                           |

Testene dekker fil- og tekstgrenser, Zod, sitater, usikkert kildegrunnlag, stabile ID-er, duplikater, klassifisering, reviewdata, SDK-feil, timeout, origin-kontroll, størrelsesbegrenset JSON, forslagsflyt og hemmelighetskontroll. Beståtte mocktester dokumenterer ikke generell modellpresisjon.

Bygg og separat TypeScript-kontroll kjøres sekvensielt fordi Next.js regenererer typefiler. Webpack brukes for å unngå Turbopacks prosesskommunikasjon i det begrensede utviklingsmiljøet.

## Faktisk live-analyse og evaluering

Tidlige forsøk med `gemini-3.8-flash` ga blant annet høy belastning og timeout. Deretter ble `gemini-3.5-flash-lite` valgt eksplisitt. Ingen automatisk fallback er implementert. Miljøeksempelet beholder standardmodellen `gemini-3.8-flash`.

Leverandøren avviste først svarskjemaet med «invalid argument». Isolerte forespørsler viste at `maxItems: 40` ble avvist. SDK-ens `responseSchema` bruker nå støttede felttyper og nullable-felt, mens strenglengder, antallsgrenser og strenge felter håndheves lokalt med Zod. Regresjonstester dekker begge lagene.

En faktisk nettleseranalyse returnerte syv funn: to potensielt manglende, to som måtte avklares og tre dekkede. Ett avklaringsfunn kom fra kildekontrollen: modellen skrev «migrere» i stedet for kildens «migreres». Sitatet ble merket uverifisert, og den opprinnelige modellklassifiseringen ble bevart separat.

Live-evalueringen fullførte **10 av 10 tilfeller uten API-feil**: fire korrekt identifiserte utelatelser, null oversette utelatelser og null falske positive problemfunn. Den strenge matcheren ga **71,4 % (10/14)**. To dekkede funn i tilfelle 07 fikk andre kategorier enn fasiten og ble derfor umatchet til tross for riktige «Dekket»-klassifiseringer og verifiserte sitater. Se [uendret rårapport](evaluation-gemini-3.5-flash-lite-2026-10-20.json) og måledefinisjonene i [README](../README.md).

Dette er en liten syntetisk evaluering, ikke dokumentasjon på generell presisjon eller kommersiell effekt. Ingen ny live-evaluering ble kjørt under klargjøringen av Git-repositoriet.

## Forslag, ny kontroll og godkjenning

Steg 03 er **Vurder og avklar** etter både demo og live-analyse. Først når alle funn er bekreftet eller avvist, åpnes steg 04 **Generer forslag** med **Oppdater forslag**. En angret vurdering returnerer til steg 03.

Følgende ble tidligere kontrollert med faktiske kall til `gemini-3.5-flash-lite`:

- Syv funn ble vurdert. Gemini laget et redigerbart notat med tre endringsoppføringer. Ny live-analyse fant syv dekkede forpliktelser og ingen uverifiserte sitater. Eksplisitt godkjenning fungerte.
- ERP-funnet ble deretter avvist med kommentar om separat avklaring. Det gamle utkastet ble merket foreldet og godkjenningen ugyldig. Et nytt AI-utkast tok bare med de to andre rettelsene; ERP ble lagt til som manuell avklaring.
- Ny live-analyse viste fem dekkede forpliktelser og to problemer: fortsatt manglende ERP-integrasjon og en fristformulering med gammel dato i parentes. Alle sitater ble verifisert. Dette utkastet ble ikke automatisk godkjent.

Demoen ga et merket regelbasert utkast uten API-kall. Alle bekreftede eksempelrettelser ga syv dekkede funn i den begrensede sitatkontrollen. Tekstredigering fjernet tidligere kontroll og godkjenning. Fjerning av syntetisk-bekreftelsen sperret nye forespørsler; ny avkrysning åpnet kontrollknappen igjen.

Forslagsgenerering er funksjonstestet og inngår ikke i poengsummen fra evalueringsdatasettet.

## Klargjøring av porteføljerepositoriet

Den eksisterende funksjonaliteten er beholdt. Endringene gjelder dokumentasjon, ignore-regler, et lokalt kontrollskript og tilhørende tester. Se [publiseringskontrollen](repository-readiness.md) for Git-status og håndtering av hemmeligheter. Ingen GitHub-publisering eller push er utført.
