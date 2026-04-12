import { z } from "zod";

/** A single lab test result */
export const LabResult = z.object({
  testName: z.string().describe("Name of the lab test (e.g. 'Hemoglobin A1c')"),
  value: z.string().describe("The result value (e.g. '5.4')"),
  unit: z.string().describe("Unit of measurement (e.g. '%', 'mg/dL')"),
  referenceRange: z
    .string()
    .describe("Normal reference range (e.g. '4.0-5.6')"),
  date: z.string().describe("Date the test was performed or resulted"),
  flag: z
    .enum(["H", "L", "normal"])
    .describe("Whether result is High, Low, or normal"),
  status: z.string().describe("Result status (e.g. 'Final', 'Preliminary')"),
});
export type LabResult = z.infer<typeof LabResult>;

/** A panel of lab results (e.g. CBC, CMP) */
export const LabPanel = z.object({
  panelName: z.string().describe("Name of the lab panel (e.g. 'Complete Blood Count')"),
  orderedDate: z.string().describe("Date the panel was ordered"),
  results: z.array(LabResult).describe("Individual test results in this panel"),
});
export type LabPanel = z.infer<typeof LabPanel>;

/** Metadata about the extraction run */
export const ExportMetadata = z.object({
  exportedAt: z.string().describe("ISO timestamp of when the export ran"),
  mychartUrl: z.string().describe("The MyChart URL that was scraped"),
  recordCounts: z.object({
    panels: z.number(),
    totalResults: z.number(),
  }),
  errors: z.array(z.string()).describe("Any errors encountered during extraction"),
});
export type ExportMetadata = z.infer<typeof ExportMetadata>;
