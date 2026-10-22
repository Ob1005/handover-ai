import { createAnalysis } from "./evidence";
import { aiResponseSchema, documentsSchema, type AiFinding } from "./schemas";

export const demoDocuments = documentsSchema.parse({
  agreement: {
    id: "agreement",
    documentType: "agreement",
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
    documentType: "handover",
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
  sourceQuote: string,
  handoverQuote: string | null,
  explanation: string,
): AiFinding => ({
  title,
  description: title + " i avtalt implementering hos Fjordlogistikk.",
  category,
  classification,
  certainty: "explicit",
  sourceQuote,
  sourceDocumentId: "agreement",
  informationType: "contractual",
  requiresConfirmation: false,
  relatedSources: [],
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
// Keep the original two-document fixtures unchanged for regression tests.
// The current demo uses a more natural document style, with the same issues.
const currentAgreement = `SYNTETISK EKSEMPEL. Selskaper og personer er oppdiktet.
AVTALE OM INNFØRING AV NORDLYS PROSJEKT

Leverandør: Nordlys Programvare AS
Kunde: Fjordlogistikk AS
Signert: 15. september 2026

1. Leveranse
Nordlys Programvare AS skal konfigurere og sette i drift Nordlys Prosjekt for Fjordlogistikk AS.
Integrasjon med kundens ERP-system, Visma Business, er inkludert i leveransen.

2. Fremdrift og rapportering
Løsningen skal være klar for produksjonssetting senest 1. desember 2026.
Leverandøren skal sende skriftlig prosjektstatus til kunden hver fredag frem til produksjonssetting.

3. Opplæring
Leverandøren skal gjennomføre to opplæringsøkter for fem nøkkelbrukere før produksjonssetting.

4. Kundens ansvar
Kunden skal levere kvalitetssikrede kundedata i avtalt CSV-format senest 1. november 2026.

5. Avgrensning
Migrering av historiske fakturaer er ikke inkludert i prosjektets omfang.`;

const currentHandover = `OVERLEVERING FRA SALG: FJORDLOGISTIKK
Fra: Marius Berg, salg
Til: prosjektleder og leveringsteam
Dato: 18. september 2026

- Nordlys Prosjekt: oppsett og oppstart hos Fjordlogistikk.
- Sikter på produksjonssetting 15. desember 2026.
- To kursøkter for fem superbrukere før oppstart.
- Prosjektleder sender skriftlig status til kunden hver fredag frem til oppstart.
- Historiske fakturaer skal ikke migreres. Dette er utenfor avtalt prosjektomfang.

Prosjektleder booker oppstartsmøtet med Kari hos kunden. Ta kontakt neste uke.`;

const currentCorrespondence = `SYNTETISK EKSEMPEL. Selskaper og personer er oppdiktet.
Fra: Kari Holm, Fjordlogistikk AS
Til: Marius Berg, Nordlys Programvare AS
Dato: 18. september 2026
Emne: Oppstart og fakturahistorikk

Hei Marius,

Takk for gjennomgangen i går. Vi forventer at alle historiske fakturaer migreres som del av prosjektet. Økonomi bruker historikken når de følger opp kundene, så det er viktig at vi har den med fra start.

Vi ønsker at oppstartsmøtet holdes digitalt på Teams. Da får vi med kollegaene i Bergen også.

Jeg har notert dette fra avtalen: «Integrasjon med kundens ERP-system, Visma Business, er inkludert i leveransen.» Fint om dere tar det med i planen for oppstarten.

Hilsen Kari`;

export const multiDemoDocuments = documentsSchema.parse({
  agreement: {
    ...demoDocuments.agreement,
    text: currentAgreement,
    bytes: new TextEncoder().encode(currentAgreement).length,
  },
  handover: {
    ...demoDocuments.handover,
    text: currentHandover,
    bytes: new TextEncoder().encode(currentHandover).length,
  },
  correspondence: {
    id: "correspondence",
    documentType: "correspondence",
    type: "txt",
    name: "Fjordlogistikk_Kundekorrespondanse.txt",
    bytes: new TextEncoder().encode(currentCorrespondence).length,
    text: currentCorrespondence,
  },
});
const currentHandoverQuotes: Partial<Record<AiFinding["category"], string>> = {
  deadlines: "Sikter på produksjonssetting 15. desember 2026.",
  training: "To kursøkter for fem superbrukere før oppstart.",
  service: "Prosjektleder sender skriftlig status til kunden hver fredag frem til oppstart.",
  exclusions: "Historiske fakturaer skal ikke migreres. Dette er utenfor avtalt prosjektomfang.",
  deliverables: "Nordlys Prosjekt: oppsett og oppstart hos Fjordlogistikk.",
};
const currentDescriptions: Partial<Record<AiFinding["category"], string>> = {
  integrations: "Integrasjon med Visma Business inngår i leveransen.",
  deadlines: "Avtalt frist for produksjonssetting er 1. desember 2026.",
  customer_responsibilities: "Kunden skal levere kvalitetssikrede CSV-data innen 1. november.",
  training: "Fem nøkkelbrukere skal få to opplæringsøkter før oppstart.",
  service: "Kunden skal få skriftlig prosjektstatus hver fredag frem til oppstart.",
  exclusions: "Kunden forventer fakturamigrering, selv om avtalen utelukker dette.",
  deliverables: "Leverandøren skal konfigurere og sette i drift Nordlys Prosjekt.",
};
export const multiDemoResponse = aiResponseSchema.parse({
  findings: [
    ...demoResponse.findings.map((original): AiFinding => {
      const f = {
        ...original,
        description: currentDescriptions[original.category] ?? original.description,
        handoverQuote: currentHandoverQuotes[original.category] ?? null,
      };
      return f.category === "exclusions"
        ? {
            ...f,
            title: "Fakturamigrering: avtale og kundeforventning",
            informationType: "conflict",
            requiresConfirmation: true,
            classification: "needs_clarification",
            relatedSources: [
              {
                documentId: "correspondence",
                quote:
                  "Vi forventer at alle historiske fakturaer migreres som del av prosjektet.",
              },
            ],
            explanation:
              "Kunden forventer migrering, mens avtalen og notatet sier at den ikke inngår. Forventningen må avklares og synliggjøres for leveringsteamet.",
          }
        : f.category === "integrations"
          ? {
              ...f,
              relatedSources: [
                { documentId: "correspondence", quote: f.sourceQuote },
              ],
            }
          : f;
    }),
    {
      title: "Ønske om digitalt oppstartsmøte",
      description:
        "Kunden ønsker oppstartsmøtet på Teams, slik at kollegaene i Bergen kan delta.",
      category: "implementation",
      classification: "needs_clarification",
      certainty: "explicit",
      sourceDocumentId: "correspondence",
      sourceQuote: "Vi ønsker at oppstartsmøtet holdes digitalt på Teams.",
      relatedSources: [],
      informationType: "follow_up",
      requiresConfirmation: true,
      handoverQuote: null,
      explanation:
        "Notatet sier at prosjektleder skal booke et møte, men utelater ønsket om Teams. Ta det med som et åpent punkt til prosjektleder.",
    },
  ],
});
export function getDemoAnalysis(includeSupporting = true) {
  return createAnalysis(
    includeSupporting ? multiDemoResponse : demoResponse,
    includeSupporting ? multiDemoDocuments : demoDocuments,
    "demo",
    "Forhåndsberegnet demo",
  );
}
