# Lokal verifisering

Utført 20. oktober 2026. Funksjonstester med SDK-mock og faktiske Gemini-resultater rapporteres separat.

## Gjeldende kontrollstatus

| Kontroll | Resultat |
| --- | --- |
| Automatiske tester | 57 tester i fem filer besto uten Gemini-kvote. |
| Lint | Besto uten feil eller advarsler. |
| TypeScript | Separat kontroll besto etter fullført bygg. |
| Produksjonsbygg | Next.js-produksjonsbygg med Webpack besto. |
| Startside | Lokal side starter på steg 01 uten tidligere dokumenter eller resultater. |
| Opplasting | Begge syntetiske TXT-filer ble lastet opp i nettleseren. Filnavn og tekstuttrekk ble vist. |
| PDF | Ekte parser testet mot generert tekst-PDF, teksttom PDF og ugyldig PDF-signatur. |
| Kilder og review | Kildefremvisning, filtre, bekreft/avvis/angre og kommentarer ble kontrollert i nettleseren. |
| Responsivitet | 390 × 844 og 1440 × 1000 kontrollert uten horisontal overflow. |
| Demo | Syv funn: to potensielt manglende, én datokonflikt og fire dekkede. Ingen AI-kall. «Lukk demo» nullstiller kontrollen. |
| Live-evaluering | Ti av ti syntetiske tilfeller fullført med `gemini-3.5-flash-lite`. Se rårapporten nedenfor. |

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
