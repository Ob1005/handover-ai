# Teknisk guide

Denne guiden forklarer dataflyten og de viktigste designvalgene. Oppsett og brukerflyt står i [README](../README.md).

## Arkitektur

Next.js samler grensesnitt og serverruter i ett prosjekt. Det er ingen database eller eksterne dokumenttjenester. Dokumenter behandles i serverminnet ved forespørsler. Arbeidsøkten med dokumenter, analyse, vurderinger, utkast og godkjenning ligger bare i nettleserminnet mens siden er åpen. En ny sideåpning starter en tom kontroll.

| Del | Ansvar |
| --- | --- |
| `src/components/` | Opplasting, funn, vurderinger og redigerbart notat |
| `src/lib/schemas.ts` | Zod-skjemaer og felles dokumentgrenser |
| `src/lib/evidence.ts` | Sitatkontroll, autoritetsregler og enkel sammenslåing av duplikater |
| `src/lib/review.ts`, `proposal.ts`, `reanalysis.ts` | Progresjon, forslagsgrunnlag og kontroll av opprinnelige funn |
| `src/lib/files.ts` | Uttrekk av PDF/TXT-tekst |
| `src/lib/server/` | Gemini og forespørselsgrenser |

Serverrutene følger arbeidsflyten: `/api/documents` henter tekst fra en fil, `/api/analyze` lager første analyse, `/api/proposal` lager et utkast og `/api/reanalyze` kontrollerer utkastet mot de opprinnelige funnene.

## Dokumenter og kilder

To faste dokumentplasser er obligatoriske. Tre er valgfrie, med én fil per plass:

| Stabil ID og dokumenttype | Rolle |
| --- | --- |
| `agreement` | Signert kundeavtale, primærkilde for avtaleforpliktelser |
| `handover` | Internnotatet som skal kontrolleres |
| `proposal` | Tilbud eller salgsforslag |
| `correspondence` | Kundekorrespondanse |
| `meeting_notes` | Møtenotater eller annen salgsinformasjon |

Hver fil har ID, dokumenttype, navn, byteantall, filtype og tekst. ID og type må stemme med dokumentplassen. Et filbytte nullstiller analysen først når den nye filen er lastet opp og validert. Ved feil beholdes dokumentet og arbeidsøkten. Faste plasser gjør kildehenvisningene stabile uten et dokumentregister. Prototypen kontrollerer ikke om en avtale faktisk er signert. Identisk tekst i flere dokumentfelt gir varsel og sperrer første analyse, også på serveren før Gemini kalles. Sammenligningen normaliserer Unicode og mellomrom, og er uavhengig av filnavn. Den avgjør ikke om en tekst faktisk er en kundeavtale.

Et funn inneholder klassifisering, forklaring, kategori, primærkilde med ordrett sitat og eventuelle tilleggssitater. `informationType` skiller avtaleforpliktelser fra oppfølgingsinformasjon og kildekonflikter. Koden legger til stabil funn-ID og verifiseringsstatus. Brukerens beslutning og kommentar lagres separat fra AI-vurderingen.

## Gemini og validering

Alle modellkall skjer på serveren gjennom `@google/genai` og Generate Content. Dokumenter og kommentarer sendes som ubetrodd data, adskilt fra systeminstruksen. Nøkkelen leses fra servermiljøet.

Gemini identifiserer relevante opplysninger og sammenligner meningen med notatet. Svaret skal være strukturert JSON. Leverandørskjemaet utledes fra Zod; enkelte lengde- og antallsgrenser håndheves bare lokalt fordi leverandøren tidligere avviste dem i svarskjemaet. Zod validerer hele svaret før det brukes.

Modellen er konfigurerbar. Ingen automatisk modellbytting, retry eller demofallback brukes. Hvert kall har 60 sekunders tidsgrense. Ugyldige svar, manglende tilgang, kvote og timeout gir egne feilmeldinger.

### Sitatkontroll og kildehierarki

Koden sjekker hvert sitat i dokumentet med angitt ID. Unicode og mellomrom normaliseres, mens ord, tall, store bokstaver og negasjoner beholdes. En ukjent kilde avviser resultatet. Et omskrevet eller manglende sitat blir uverifisert. Modellen kan ikke sette sin egen verifiseringsstatus.

Avtalen er førende. Opplysninger fra andre kilder blir ikke automatisk avtaleforpliktelser. Konflikter, tvetydighet og behov for bekreftelse gir «Må avklares» i første analyse. Det samme gjelder uverifisert kildebelegg. Et «Dekket»-svar må ha et verifiserbart sitat fra notatet.

Gemini skal samle samme opplysning i ett funn og vise begge sider av en konflikt. Koden samler i tillegg identiske sitater og beskrivelser innen samme kategori, samt speilvendte konflikter med samme kildesitater. Ulike eller tvetydige kildeutdrag beholdes separat. Dette fjerner noen duplikater uten å forsøke å avgjøre semantisk likhet med nøkkelord.

**Et verifisert sitat viser at teksten finnes, ikke at modellens tolkning er riktig.** Modellens klassifisering bevares separat fra klassifiseringen etter validering.

## Vurdering og oppdatert notat

Bare «Potensielt manglende» og «Må avklares» krever bekreftelse eller avvisning før forslag kan genereres. Dekkede krav kan vurderes valgfritt. Klient og server bruker samme regel. En analyse uten funn gir ikke noe kontrollgrunnlag og kan ikke brukes til forslagsgenerering. Å bekrefte et funn betyr enighet i vurderingen, ikke at saken er løst.

Forslagskallet får dokumentene, funnene, beslutningene og kommentarene. Serveren beregner sitatverifisering på nytt og kontrollerer at endringslisten bare viser til kjente, bekreftede funn. Gemini skal bevare korrekt innhold, rette bekreftede avvik og beskrive åpne ønsker og konflikter som oppfølging. Avviste funn skal ikke gi automatiske rettelser.

Brukeren kan redigere notatet. En lokal linjesammenligning viser tillegg i grønt, slettinger i rødt og uendret tekst nøytralt. Den sammenligner alltid originalnotatet med gjeldende tekst, uavhengig av AI-ens endringsoppsummering. Store linjemengder gir en grovere sammenligning for å begrense minnebruken.

## Ny kontroll og godkjenning

Ny kontroll beholder alle opprinnelige funn, ID-er, dokumenthenvisninger og kildesitater. Bare notatet byttes ut. Gemini får de faste funnene og skal vurdere hvert av dem, uten å trekke ut nye krav.

Koden bygger resultatet fra originalfunnene. Manglende eller dupliserte svar blir «Må avklares» og `not_evaluated`. Også et tomt svar beholder hele grunnlaget. Ukjente ID-er avvises. Godkjenning sperres til alle opprinnelige funn er vurdert.

En åpen sak kan være korrekt overført uten å være løst. For «Overført med oppfølging» må Gemini eksplisitt vurdere saken som dokumentert, og både kilder og sitat fra det nye notatet må være verifisert. Kildeautoritet og bekreftelsesbehov beholdes. Dette skiller mangler i notatet fra saker leveringsteamet fortsatt må følge opp.

Sluttkontrollen skiller mellom overførte avtalekrav, dokumentert oppfølging og utilstrekkelig dekning. Et eksplisitt krav fra avtalen kan bli «Dekket» selv om første analyse flagget det for bekreftelse. Dette krever en ny semantisk vurdering og verifiserte kilde- og notatsitater. Støttekilder, tvetydige krav og kildekonflikter kan ikke bruke denne veien. Opprinnelige beskrivelser og flagg beholdes som historikk; de avgjør ikke alene om kravet er overført.

Brukeren godkjenner notatet manuelt og kan gjøre det med synlige, vurderte avklaringspunkter. En endring i tekst eller beslutningsgrunnlag gjør tidligere kontroll og godkjenning ugyldig. Fast grunnlag beskytter bare funn som ble identifisert i første analyse; det sikrer ikke at alle nye, udokumenterte tillegg i utkastet oppdages.

## Grenser og sikkerhet

- Per fil: PDF/TXT, 2 MiB, 20 til 20 000 teksttegn og inntil 40 PDF-sider. Skannede og teksttomme PDF-er avvises; ingen OCR.
- Alle dokumenter deler 40 000 tegn, også når utkastet erstatter notatet. Budsjettet er beholdt fra todokumentversjonen. Tekst avkortes ikke automatisk.
- Første analyse tillater 260 000 byte JSON. Forslag og ny kontroll tillater 512 000 byte. Maksimalt 40 funn og tre tilleggssitater per funn.
- AI-rutene deler fem kall per ti minutter og én samtidig forespørsel per serverprosess. Dette er lokal struping, ikke produksjonssikring.
- Serveren kontrollerer input, forespørselsstørrelse og origin. Innhold vises som tekst. Systeminstrukser reduserer, men eliminerer ikke risiko for instruksjoner i dokumenter.

Bruk bare syntetisk materiale. Google behandler teksten ved live-kall etter prosjektets tjenestevilkår og innstillinger. API-nøkler holdes lokale. [Sikkerhetsrutinen](../SECURITY.md) beskriver kontroll før deling av kildekode.

## Demo og testing

Demoen bruker forhåndsberegnede funn og et regelbasert forslag. Ny kontroll gjenkjenner kjente eksempeltekster. Den viser arbeidsflyten uten API-kall, men er ikke en generell analyse av fri tekst.

Automatiske tester bruker mockede Gemini-svar og lokal PDF/TXT-ekstraksjon. De kontrollerer programvarens oppførsel, ikke modellens generelle presisjon. [Verifisering og evaluering](verification.md) skiller disse kontrollene fra faktiske modellkjøringer og beskriver kjente feil.
