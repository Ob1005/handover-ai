import { createAnalysis } from "./evidence";
import { aiResponseSchema, documentsSchema, type AiFinding } from "./schemas";

export const demoDocuments = documentsSchema.parse({
  agreement: {
    id: "agreement",
    name: "Fjordlogistikk_Kundeavtale.txt",
    type: "txt",
    bytes: 1450,
    text: `SYNTETISK DEMODOKUMENT – ingen reelle kunder eller avtaler.
KUNDEAVTALE / IMPLEMENTERING
Leverandør: Nordlys Programvare AS (fiktiv)
Kunde: Fjordlogistikk AS (fiktiv)
Signert: 15. september 2026 (syntetisk signering)

1. Leveranse
Nordlys Programvare AS skal konfigurere og sette i drift Nordlys Prosjekt for Fjordlogistikk AS.
Integrasjon med kundens ERP-system, Visma Business, er inkludert i leveransen.

2. Fremdrift
Løsningen skal være klar for produksjonssetting senest 1. desember 2026.
Leverandøren skal sende skriftlig prosjektstatus til kunden hver fredag frem til produksjonssetting.

3. Opplæring
Leverandøren skal gjennomføre to opplæringsøkter for fem nøkkelbrukere før produksjonssetting.

4. Kundens ansvar
Kunden skal levere kvalitetssikrede kundedata i avtalt CSV-format senest 1. november 2026.

5. Avgrensning
Migrering av historiske fakturaer er ikke inkludert i prosjektets omfang.
`,
  },
  handover: {
    id: "handover",
    name: "Fjordlogistikk_Overlevering.txt",
    type: "txt",
    bytes: 870,
    text: `SYNTETISK DEMODOKUMENT – internt eksempel.
SALG TIL LEVERANSE / FJORDLOGISTIKK
Fra: salgsteamet i Nordlys Programvare AS
Til: prosjektleder og implementeringsteam
Dato: 18. september 2026

Prosjektet gjelder oppsett og oppstart av Nordlys Prosjekt hos Fjordlogistikk.
Planlagt produksjonssetting er 15. desember 2026.
Fem superbrukere skal få to kursøkter før løsningen tas i bruk.
Prosjektleder sender kunden en skriftlig statusrapport hver fredag frem til oppstart.
Historiske fakturaer skal ikke migreres; dette er utenfor avtalt prosjektomfang.

Prosjektleder avtaler oppstartsmøte med kunden. Kunden er positiv og ønsker en enkel innføring.
`,
  },
});
const item = (
  title: string,
  category: AiFinding["category"],
  classification: AiFinding["classification"],
  agreementQuote: string,
  handoverQuote: string | null,
  explanation: string,
): AiFinding => ({
  title,
  description: title + " i avtalt implementering hos Fjordlogistikk.",
  category,
  classification,
  certainty: "explicit",
  agreementQuote,
  handoverQuote,
  explanation,
});
export const demoResponse = aiResponseSchema.parse({
  findings: [
    item(
      "ERP-integrasjon med Visma Business",
      "integrations",
      "potentially_missing",
      "Integrasjon med kundens ERP-system, Visma Business, er inkludert i leveransen.",
      null,
      "Avtalen inkluderer ERP-integrasjonen. Overleveringen omtaler ikke integrasjonen; avklar ansvar og kapasitet før prosjektstart.",
    ),
    item(
      "Ulik dato for produksjonssetting",
      "deadlines",
      "needs_clarification",
      "Løsningen skal være klar for produksjonssetting senest 1. desember 2026.",
      "Planlagt produksjonssetting er 15. desember 2026.",
      "Overleveringen angir 15. desember, mens avtalen angir senest 1. desember. Prosjektleder må avklare fremdriften med salg.",
    ),
    item(
      "Kundens ansvar for dataleveranse",
      "customer_responsibilities",
      "potentially_missing",
      "Kunden skal levere kvalitetssikrede kundedata i avtalt CSV-format senest 1. november 2026.",
      null,
      "Kundens ansvar, dataformat og frist er ikke omtalt i overleveringen. Dette kan påvirke oppstart og datakvalitet.",
    ),
    item(
      "Opplæring av fem nøkkelbrukere",
      "training",
      "covered",
      "Leverandøren skal gjennomføre to opplæringsøkter for fem nøkkelbrukere før produksjonssetting.",
      "Fem superbrukere skal få to kursøkter før løsningen tas i bruk.",
      "To kursøkter for fem superbrukere før oppstart uttrykker det samme som avtalen, selv om ordlyden er forskjellig.",
    ),
    item(
      "Ukentlig skriftlig prosjektstatus",
      "service",
      "covered",
      "Leverandøren skal sende skriftlig prosjektstatus til kunden hver fredag frem til produksjonssetting.",
      "Prosjektleder sender kunden en skriftlig statusrapport hver fredag frem til oppstart.",
      "Mottaker, frekvens, format og periode er overført til prosjektleder.",
    ),
    item(
      "Historiske fakturaer er utenfor omfang",
      "exclusions",
      "covered",
      "Migrering av historiske fakturaer er ikke inkludert i prosjektets omfang.",
      "Historiske fakturaer skal ikke migreres; dette er utenfor avtalt prosjektomfang.",
      "Avgrensningen er tydelig videreført. Teamet kan se at historiske fakturaer ikke inngår.",
    ),
    item(
      "Konfigurere og sette i drift Nordlys Prosjekt",
      "deliverables",
      "covered",
      "Nordlys Programvare AS skal konfigurere og sette i drift Nordlys Prosjekt for Fjordlogistikk AS.",
      "Prosjektet gjelder oppsett og oppstart av Nordlys Prosjekt hos Fjordlogistikk.",
      "Oppsett og oppstart i overleveringen dekker konfigurering og idriftsettelse i avtalen.",
    ),
  ],
});
export function getDemoAnalysis() {
  return createAnalysis(
    demoResponse,
    demoDocuments,
    "demo",
    "Forhåndsberegnet demo",
  );
}
