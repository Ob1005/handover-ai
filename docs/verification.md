# Verifisering og evaluering

## Gjeldende versjon

Kontrollert etter rettingen av filbytte og forenklingen av øktbehandling:

| Kontroll | Resultat |
| --- | --- |
| Automatiske tester | 125 av 125 besto i ni testfiler |
| Lint og TypeScript | Besto, TypeScript ble kjørt separat etter bygg |
| Produksjonsbygg | Webpack-bygg besto og ble startet lokalt |
| Hemmeligheter og diff | Hemmelighetssjekk og `git diff --check` besto |
| Visuell kontroll | Desktop 1280 × 900 og mobil 390 × 844 kontrollert i nettleseren; ingen horisontal overflyt på mobil |

Hele demoen ble gjennomført i grensesnittet uten API-kall: åtte funn, fem nødvendige vurderinger, oppdatert forslag, tekstsammenligning, ny kontroll og manuell godkjenning. Ny kontroll beholdt alle åtte funn. Alle var dekket, med to åpne oppfølgingspunkter. Redigering fjernet godkjenningen og oppdaterte tekstsammenligningen. «Lukk demo» nullstilte kontrollen.

Et avvist filbytte beholdt alle vurderinger, det manuelt redigerte utkastet og godkjenningen. Et vellykket filbytte nullstilte analysen og utkastet. En sideoppdatering startet med tom kontroll. Arbeidsøkten bruker bare nettleserminnet.

På mobil ble de to syntetiske TXT-filene tidligere lastet opp gjennom filvelgeren. Progresjonen gikk til steg 02, og analyseknappen ble tilgjengelig. [Skjermbildene](../README.md#skjermbilder) viser syntetiske dokumenter; funnvisningen er oppdatert etter forenklingen av øktbehandling.

Duplikatkontrollen er testet med samme tekst i ulike dokumentfelt, omdøpte filer, PDF/TXT og forskjeller i Unicode eller mellomrom. I nettleseren ga samme kunde-e-post i begge obligatoriske felt et varsel og sperret analyse. Varselet forsvant etter filbytte. Tomme analyser kan verken åpne forslag i grensesnittet eller sendes til forslagsruten; serverkontrollene ble testet uten Gemini-kall.

Automatiske tester bruker mockede Gemini-svar. De kontrollerer blant annet fil- og responsvalidering, kildesitater, beslutningsregler, forslag, fast grunnlag ved ny kontroll og tekstsammenligning. De måler ikke modellens treffsikkerhet. **Ingen nye live-kall til Gemini ble gjort i denne revisjonen.**

## Historisk modelevaluering

Den [uendrede rårapporten fra 20. oktober 2026](evaluation-gemini-3.5-flash-lite-2026-10-20.json) inneholder ti faktiske kall til `gemini-3.5-flash-lite`, med ti håndlagde, syntetiske dokumentpar. Hvert par besto av avtale og internnotat. Tilbud, korrespondanse, forslagsgenerering og dagens flerdokumentflyt inngikk ikke.

| Måling i denne kjøringen | Resultat |
| --- | --- |
| Fullførte tilfeller | 10 av 10 |
| Korrekt identifiserte utelatelser | 4 |
| Oversette utelatelser | 0 |
| Falske positive problemfunn | 0 |
| Klassifisering med streng matching | 10/14 (71,4 %) |

Matcheren krever både samme kategori og overlappende ordrett avtaleanker. To dekkede funn fikk andre kategorier enn fasiten og ble regnet som umatchede krav og ekstra funn, selv om klassifiseringen var riktig. Poengsummen er derfor avhengig av matcheregelen. Den er **ikke en generell suksessrate eller presisjonsmåling** for modellen.

Grunnlaget er lite og gjelder en eldre arbeidsflyt. Uavhengig validering er ikke dokumentert. Fasiten, rårapporten og tallene er beholdt. [Datasettet](../evaluation/dataset.ts) og [poengberegningen](../evaluation/score.ts) viser hvordan resultatet ble beregnet. Flere programvaretester eller en vellykket demokjøring endrer ikke dette empiriske grunnlaget.

## Observerte svakheter

Syntetiske live-kontroller av flerdokumentflyten fullførte analyse og ny kontroll med `gemini-3.5-flash-lite`. I et kort eksempel ble tre av tre opprinnelige funn beholdt. Dette var funksjonstester, ikke en ny presisjonsmåling. Et forslagskall med de tre Fjordlogistikk-dokumentene traff tidsgrensen på 60 sekunder, så hele denne live-forslagsflyten ble ikke bekreftet.

Første analyse kan utelate en opplysning fra korrespondansen eller finne ulike sett med krav ved gjentatte kjøringer. Det ble også observert et omskrevet kildesitat, som den deterministiske kontrollen merket uverifisert. Ingen av disse feilene skal skjules av demodata eller automatisk modellbytte.

Fast kontrollgrunnlag hindrer at kjente funn forsvinner fra neste analyse. Det fanger ikke opp krav som allerede ble oversett første gang. Verifiserte sitater og gjennomførte tester er heller ingen garanti for at tolkningen er riktig.
