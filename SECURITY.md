# Sikkerhet og publiseringsrutine

Handover AI er en lokal prototype for **syntetiske, ikke-konfidensielle dokumenter**. Ingen offentlige API-nøkler følger med. Kildekoden kan gjennomgås uten å konfigurere Gemini.

## Lokale hemmeligheter

- Behold `GEMINI_API_KEY` i `.env.local` eller serverens lokale miljø. Bruk aldri `NEXT_PUBLIC_` for hemmeligheter.
- `.env.example` er den eneste miljøfilen som skal deles, og nøkkelfeltet skal være tomt.
- Bruk `private/`, `confidential/`, `uploads/` eller `local-data/` for eventuelle lokale filer som aldri skal følge prosjektet. Ekte kundeavtaler skal ikke behandles i prototypen.
- Logger, HAR-filer og nye evalueringsrapporter kan inneholde tekst eller legitimasjon. De er ignorert som standard.
- `.gitignore` fjerner ikke filer som allerede er sporet. Bruk aldri `git add -f` på hemmeligheter.

## Før en godkjent publisering

```sh
pnpm secrets:check
git status --short --untracked-files=all
git diff --cached --stat
```

Gå deretter manuelt gjennom filene som skal deles, særlig bilder, rapporter og dokumenter. Den medfølgende kontrollen leser publiserbare arbeidsfiler og hele den lokale Git-objektdatabasen, inkludert commit-meldinger, tagger, indekserte blobs og utilgjengelige objekter. Verdier fra lokale miljøfiler sammenlignes også med innholdet; rapporten viser bare fil/objekt og regel, aldri den gjenkjente verdien.

Kontrollen er et ekstra kontrollpunkt, ikke en komplett hemmelighets- eller konfidensialitetsdetektor. Den oppdager kjente tokenformater, private nøkler og noen credential-filer, men vil ikke identifisere alle passord eller forretningshemmeligheter. Bilder må også gjennomgås visuelt.

Ingen GitHub-repositorier, eksterne remotes eller automatiske publiseringsjobber er nødvendig for lokal bruk. Publisering og push skal skje først etter eierens uttrykkelige godkjenning.

## Hvis en hemmelighet oppdages

Ikke push. Hvis nøkkelen har vært delt eller eksponert, tilbakekall/roter den hos leverandøren først. Å slette den fra siste filversjon fjerner den ikke fra historikken. Historikkrydding må planlegges separat og verifiseres før publisering; ikke skriv om delt historikk uten koordinering.

Ikke lim inn nøkler eller ekte kontrakter i issues, skjermbilder eller feilrapporter. Beskriv feil med syntetiske reproduksjonseksempler.

## Offentlig kildekode er ikke offentlig drift

API-rutene er laget for en lokal demonstrasjon. Origin-kontroll og prosessbasert struping beskytter ikke en offentlig tjeneste tilstrekkelig. Offentlig drift krever en egen gjennomgang av tilgang, kvoter, filbehandling og databehandling hos Google. Ingen fakturering aktiveres av appen.
