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
// The original two-document fixtures above remain available for regression tests.
export const multiDemoDocuments = documentsSchema.parse({
  ...demoDocuments,
  correspondence: {
    id: "correspondence",
    documentType: "correspondence",
    type: "txt",
    name: "Fjordlogistikk_Kundekorrespondanse.txt",
    bytes: 620,
    text: `SYNTETISK KUNDE-E-POST – fiktivt eksempel, ingen personopplysninger.
Fra: prosjektkontakt i Fjordlogistikk AS (fiktiv)
Til: salgsteamet i Nordlys Programvare AS (fiktiv)
Dato: 18. september 2026

Vi forventer at alle historiske fakturaer migreres som del av prosjektet.
Vi ønsker at oppstartsmøtet holdes digitalt på Teams.
Integrasjon med kundens ERP-system, Visma Business, er inkludert i leveransen.
Ønskene må avklares med prosjektleder; denne e-posten endrer ikke den signerte avtalen.`,
  },
});
export const multiDemoResponse = aiResponseSchema.parse({
  findings: [
    ...demoResponse.findings.map((f): AiFinding =>
      f.category === "exclusions"
        ? {
            ...f,
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
              "E-posten forventer fakturamigrering, men signert avtale utelukker dette. Avtalen er førende. Avklar forventningen med kunden; ikke legg migrering inn som en avtalt leveranse.",
          }
        : f.category === "integrations"
          ? {
              ...f,
              relatedSources: [
                { documentId: "correspondence", quote: f.sourceQuote },
              ],
            }
          : f,
    ),
    {
      title: "Ønske om digitalt oppstartsmøte",
      description:
        "Kunden ønsker Teams som møteform. Dette er et ønske fra salgsfasen, ikke et bekreftet avtalevilkår.",
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
        "Ønsket er ikke overført til notatet. Prosjektleder bør bekrefte møteformen med kunden før det behandles som en avtale.",
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
