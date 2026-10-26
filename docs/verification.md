# Verifisering og evaluering

## Gjeldende versjon

Kontrollert etter rettingene av filbytte, øktbehandling, sluttkontroll, tallfestede varigheter og avgrensede rettelser i notatet:

| Kontroll | Resultat |
| --- | --- |
| Automatiske tester | 171 av 171 besto i elleve testfiler |
| Lint og TypeScript | Besto, TypeScript ble kjørt separat etter bygg |
| Produksjonsbygg | Webpack-bygg besto |
| Installasjon og utviklingsserver | Låst pakkeinstallasjon og Turbopack-oppstart besto i en ren kopi uten API-nøkkel; startsiden svarte med HTTP 200 |
| Hemmeligheter og diff | Hemmelighetssjekk og `git diff --check` besto |
| Tidligere visuell kontroll | Desktop 1280 × 900 og mobil 390 × 844 kontrollert i nettleseren før siste logikkretting; ingen horisontal overflyt på mobil |

Hele demoen ble tidligere gjennomført i grensesnittet uten API-kall: åtte funn, fem nødvendige vurderinger, oppdatert forslag, tekstsammenligning, ny kontroll og manuell godkjenning. Ny kontroll beholdt alle åtte funn. Alle var dekket, med to åpne oppfølgingspunkter. Redigering fjernet godkjenningen og oppdaterte tekstsammenligningen. «Lukk demo» nullstilte kontrollen.

Et avvist filbytte beholdt alle vurderinger, det manuelt redigerte utkastet og godkjenningen. Et vellykket filbytte nullstilte analysen og utkastet. En sideoppdatering startet med tom kontroll. Arbeidsøkten bruker bare nettleserminnet.

På mobil ble de to syntetiske TXT-filene tidligere lastet opp gjennom filvelgeren. Progresjonen gikk til steg 02, og analyseknappen ble tilgjengelig. [Skjermbildene](../README.md#skjermbilder) viser syntetiske dokumenter; funnvisningen er oppdatert etter forenklingen av øktbehandling.

Duplikatkontrollen er testet med samme tekst i ulike dokumentfelt, omdøpte filer, PDF/TXT og forskjeller i Unicode eller mellomrom. I nettleseren ga samme kunde-e-post i begge obligatoriske felt et varsel og sperret analyse. Varselet forsvant etter filbytte. Tomme analyser kan verken åpne forslag i grensesnittet eller sendes til forslagsruten; serverkontrollene ble testet uten Gemini-kall.

Automatiske tester bruker mockede Gemini-svar. De kontrollerer blant annet fil- og responsvalidering, kildesitater, beslutningsregler, forslag, fast grunnlag ved ny kontroll og tekstsammenligning. De måler ikke modellens treffsikkerhet. Live-kontrollen nedenfor er separat fra programvaretestene.

Regresjonstester dekker ERP- og CSV-krav som feilaktig ble flagget for bekreftelse i første analyse. De kan nå bli dekket når sluttkontrollen eksplisitt vurderer avtalekravet som overført med verifiserte sitater. Egne negative tilfeller kontrollerer at støttekilder, konflikter, tvetydighet og ugyldige sitater ikke kan bruke denne veien. Rettingen er kontrollert med mockede modellvurderinger, ikke en ny live-evaluering.

Et mocket forslagskall gjenskaper at Teams-spørsmålet bare finnes i modellens oppfølgingsliste. Testene kontrollerer at spørsmålet blir med i selve notatet og grunnlaget for sluttkontroll, at eksisterende spørsmål ikke gjentas, og at tilføyelser ikke kan overskride tekstgrensene.

## Gjentakelseskontroll 25. oktober 2026

Seks sekvensielle live-kall til `gemini-3.5-flash-lite` brukte de samme tre Fjordlogistikk-filene fra `public/examples`: kundeavtale, overleveringsnotat og kundekorrespondanse. Dokumentinnhold, modell, responsformat og genereringsinnstillinger var uendret. Råsvarene ble lagret før kilde- og klassifiseringskontrollen.

| Instruksjon | Funn i de tre kjøringene | Dekket før appens validering | Dekket etter validering |
| --- | --- | --- | --- |
| Opprinnelig | 5, 6, 5 | 0, 0, 0 | 0, 0, 0 |
| Presisert til å inkludere dekkede avtalepunkter | 8, 8, 8 | 3, 3, 3 | 3, 3, 3 |

Den opprinnelige instruksen ble tolket som en avviksliste. Modellen utelot dekkede leveranse- og opplæringspunkter; rapportering kom bare med i én kjøring, da som et avklaringspunkt om «oppstart» mot «produksjonssetting». Rettingen presiserer at alle selvstendige avtalepunkter skal med, også dekkede, uten å endre eksempeltekstene eller hardkode forventede funn.

Alle seks råsvar ble kjørt gjennom valideringen på nytt og ga identiske funn som første gang. Ingen «Dekket»-vurderinger ble overstyrt i disse kjøringene. Appen endret Teams-ønsket fra «Potensielt manglende» til «Må avklares» i alle seks, fordi modellen samtidig satte `requiresConfirmation=true`. Det er tilsiktet. I én av de tre siste kjøringene oppga modellen et sitat fra overleveringen som om det kom fra kundekorrespondansen. Appen markerte det korrekt som uverifisert; datoavviket var allerede klassifisert som «Må avklares».

Dette er en liten diagnose på ett dokumentsett, ikke en presisjonsmåling eller garanti for gjentakbarhet. Titler og forklaringer varierte fortsatt. Rårapportene er lagret lokalt i ignorert `evaluation-results/` og inneholder både instruksjon, dokumenter, modellrespons og validerte funn.

## Lengre PDF-eksempel: Vestvik

Avsnittet beskriver testen før rettingene 26. oktober. Ny kontroll etter rettingene følger nedenfor.

Tre nye [syntetiske PDF-er](../public/examples/pdf/README.md) har fire, tre og tre sider. Appens egen PDF-leser hentet ut 9 646, 7 105 og 7 376 tegn, totalt 24 127, innenfor eksisterende fil- og tekstgrenser. Sideoppsettet ble rendret og visuelt kontrollert. En automatisert test kontrollerer tekst fra alle dokumentenes siste sider, norske tegn og kildeankrene i det separate kontrollgrunnlaget.

Kontrollgrunnlaget i [`evaluation/pdf-scenario.json`](../evaluation/pdf-scenario.json) ble skrevet før live-testen. Det inneholder 14 utvalgte kontrollpunkter, ikke en uttømmende liste over alle mulige funn. Det importeres ikke av appen eller sendes til Gemini. De korte TXT-eksemplene er beholdt uendret.

Fem live-kall til `gemini-3.5-flash-lite` omfattet tre førsteanalyser og ett løp med generering og sluttkontroll. To analyser ga henholdsvis 20 og 15 validerte funn; ett modellsvar ble avvist av appens validering. Det avviste råsvaret ble ikke bevart før feilen, så den konkrete valideringsårsaken kan ikke etterprøves fra loggen. Det første analyseresultatet ble brukt videre, med simulerte bekreftelser av avvik og uten fasit eller korrigerende kommentarer. Dette var en kodebasert funksjonstest, ikke en manuell nettlesergjennomgang eller en faktisk menneskelig godkjenning.

Testen avdekket konkrete modellbegrensninger:

- Begge vellykkede førsteanalyser kalte fem dagers oppstartsoppfølging «Dekket», selv om avtalen krever ti. Gyldige sitater fanget ikke denne tolkingsfeilen. Sluttkontrollen flagget varigheten som uavklart i det genererte notatet.
- Modellen slo sammen sitater som ikke var sammenhengende i kilden, og brukte ellipser. Appen markerte disse sitatene som uverifiserte.
- Modellen vurderte eksport kl. 08.00 som dekning av kravet kl. 06.00. I begge vellykkede analyser ble funnet likevel «Må avklares» fordi sitatene ikke kunne verifiseres; den semantiske begrunnelsen var fortsatt feil.
- CSV-fristen ble feilaktig kalt dekket. I første analyse manglet notatsitatet, og appen overstyrte til «Må avklares». I den andre vellykkede analysen ble punktet fortsatt vist som dekket. Dette viser at kildevalidering ikke alene sikrer korrekt tolkning.
- Forslaget ble vesentlig kortere enn originalnotatet og mistet korrekt informasjon. Sluttkontrollen oppdaget blant annet utelatt statusrapportering, sletting av importfiler og akseptansetest. Alle de 20 opprinnelige funnene ble beholdt; ti ble dekket, tre potensielt manglende og sju måtte avklares. Ingen automatisk godkjenning ble utført.

PDF-uttrekk og dataflyt fungerte, men testen dokumenterer ikke at den lengre live-arbeidsflyten gir et fullstendig eller korrekt notat. Modell, analyseinstruks og kontrollregler ble ikke endret under denne PDF-testen. Råresultater og det genererte notatet ligger lokalt i ignorert `evaluation-results/`.

## Retting og ny PDF-kontroll 26. oktober 2026

Appen kontrollerer nå gjenkjente varigheter og klokkeslett i verifiserte sitater. Begge lagrede, vellykkede PDF-svar fra forrige test ble kjørt gjennom den nye valideringen. Oppstartsoppfølging på fem i stedet for ti virkedager ble «Må avklares» i begge, selv om modellen hadde svart «Dekket». Enhetstester kontrollerer også at ny kontroll ikke kan omgå regelen, at norske tallord og sifre kan samsvare, og at reell oppfølging kan dokumentere begge verdier.

Forslagsgenereringen bruker nå avgrensede rettelser og tillegg. Appen anvender dem på originalnotatet og beholder resten av teksten. Tester avviser blant annet overlappende rettelser, endringer av dekkede eller avviste funn, tvetydige tekstmål og fjerning av et annet dekket punkts notatsitat. Ingen ekstra avhengigheter er innført.

Fem nye live-kall med samme PDF-tekst og samme `gemini-3.5-flash-lite` omfattet to analyser, ett forslag og to sluttkontroller av det samme forslaget. Ingen testfasit ble sendt. Det første vellykkede analyseresultatet ble brukt videre med simulerte bekreftelser av avvik og uten korrigerende kommentarer.

- Analysene ga 23 og 30 funn. Modellen foreslo fortsatt «Dekket» både for fem mot ti virkedager og kl. 08.00 mot kl. 06.00. Appens nye kontroll overstyrte begge avvikene i begge kjøringer.
- Forslaget gjennomførte ni avgrensede rettelser og tillegg. Oppstartsoppfølging ble rettet til ti virkedager og eksportfristen til kl. 06.00. Notatet hadde 8 646 tegn, sammenlignet med 7 105 i originalen og 2 985 i forslaget fra den tidligere testen.
- Alle 14 opprinnelig dekkede, verifiserte notatsitater var fortsatt til stede. Statusrapportering, sletting av importfiler og akseptansetest ble beholdt og vurdert som dekket i begge sluttkontrollene. Alle 23 opprinnelige funn fulgte med videre.
- Første sluttkontroll vurderte den rettede oppfølgingsperioden som dekket med samsvarende tall. I den gjentatte kontrollen omformulerte modellen notatsitatet, og appen markerte det korrekt som uverifisert og «Må avklares». Det korrigerte notatet var uendret.
- Kildekonflikten om fakturahistorikk og det opprinnelige datoavviket ble fortsatt holdt på «Må avklares»: modellen foreslo dekning som avtalekrav, mens det faste grunnlaget fortsatt merker dem som konflikter. Et omformulert sitat om roller ga også et avklaringspunkt i første, men ikke andre sluttkontroll. Disse resultatene viser gjenværende variasjon og konservative avklaringer, ikke tap av innhold.

Testen bekrefter de to målrettede rettingene, men dokumenterer ikke generell modellpresisjon eller at alle fremtidige forslag er riktige. Den deterministiske tallkontrollen dekker ikke alle tallformater eller full semantikk. Ingen faktisk menneskelig godkjenning ble utført. Råresultater og utkast er lagret lokalt i `evaluation-results/vestvik-fixes-1793024432598.json`.

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
