# Arkiv: klargjøring før første publisering

Historisk notat fra 20. oktober 2026, før repositoriet ble publisert. Git-status og publiseringsstatus nedenfor beskriver bare dette tidspunktet. Dagens sikkerhetsrutine står i [SECURITY.md](../../SECURITY.md).

# Lokal klargjøring for offentlig kildekode

Kontrollert 20. oktober 2026. **Ingenting er publisert eller pushet.**

## Git-status ved klargjøring

Prosjektmappen hadde ikke et Git-repositorium da kontrollen startet. Et tomt lokalt repositorium er opprettet med grenen `main`. Ingen commits, staging eller remotes er opprettet. Det finnes dermed ingen tidligere lokal Git-historikk i dette repositoriet som kan inneholde den eksisterende nøkkelen. Dette sier ingenting om eventuelle kopier utenfor prosjektmappen.

## Hva som kan følge kildekoden

- Applikasjonskode, låst avhengighetsfil og tester.
- `.env.example` med tomt nøkkelfelt.
- Ti syntetiske dokumentpar og to syntetiske eksempelnotater.
- Gjennomgått evalueringsrapport fra disse syntetiske parene, og skjermbilder med fiktive selskaper.
- Norsk README, teknisk guide, verifiseringslogg og sikkerhetsrutine.

Publiseringskandidatene ble gjennomgått for nøkler, lokale brukerstier og dokumentinnhold. Skjermbildene ble også kontrollert visuelt. Ingen reelle kundedokumenter ble identifisert blant publiseringskandidatene. Den gjennomgåtte evalueringsrapporten har ingen leverandørfeil eller nøkkelverdier.

## Hva som holdes lokalt

`.env.local` beholdes uendret og ignoreres. Det samme gjelder avhengigheter, pakkebuffer, byggeoutput, TypeScript-cache, nye evalueringskjøringer, OS-filer, logger og private dokumentmapper. Ingen nøkkel ble flyttet til kildekoden eller README.

`pnpm secrets:check` kontrollerer publiserbare arbeidsfiler og hele den lokale Git-objektdatabasen. Ved denne klargjøringen fantes ingen Git-innholdsobjekter eller commits. Kontrollen sammenligner også den lokale miljøhemmeligheten med filinnhold uten å vise selve verdien. Kontrollen besto for 58 publiseringskandidater. Separat skanning av 23 filer i det ferdige nettleserbygget fant ingen forekomst av den konfigurerte nøkkelen.

Tester med en konstruert, ubrukelig tokenstreng bekrefter at verktøyet feiler når strengen bare finnes i staging, og når den bare finnes i et utilgjengelig Git-objekt. Ingen faktisk nøkkel ble brukt i testhistorikk.

## Før eventuell senere publisering

Kjør kontrollen på nytt etter endringer, gjennomgå publiseringsutvalget, og innhent eierens uttrykkelige godkjenning før GitHub-opprettelse eller push. Kontrollverktøyet kan ikke garantere at alt vilkårlig innhold er ikke-konfidensielt; nye dokumenter og bilder krever fortsatt manuell gjennomgang. Se [SECURITY.md](../../SECURITY.md).
