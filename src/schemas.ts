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

/** A clinic visit / appointment */
export const Visit = z.object({
  date: z.string().describe("Date of the visit (e.g. '04/10/2026')"),
  visitType: z.string().describe("Type of visit (e.g. 'Office Visit', 'Phone Call', 'Video Visit')"),
  provider: z.string().describe("Name of the provider or doctor seen"),
  department: z.string().optional().describe("Clinic or department name"),
  location: z.string().optional().describe("Location or facility name"),
  reason: z.string().optional().describe("Reason for visit or chief complaint"),
  diagnoses: z.array(z.string()).optional().describe("Any diagnoses listed"),
  notes: z.string().optional().describe("Additional notes, instructions, or summary text from the visit"),
});
export type Visit = z.infer<typeof Visit>;

/** A medication in the patient's medication list */
export const Medication = z.object({
  name: z.string().describe("Medication name and strength (e.g. 'Lisinopril 10 mg tablet')"),
  instructions: z.string().optional().describe("Dosing instructions (e.g. 'Take 1 tablet by mouth daily')"),
  prescribedBy: z.string().optional().describe("Prescribing provider name"),
  status: z.string().optional().describe("Status: Active, Discontinued, On Hold, etc."),
  refillsRemaining: z.string().optional().describe("Number of refills remaining"),
  lastFilled: z.string().optional().describe("Date last filled"),
  pharmacy: z.string().optional().describe("Associated pharmacy name"),
  startDate: z.string().optional().describe("Date medication was started"),
});
export type Medication = z.infer<typeof Medication>;

/** A message or message thread in the patient's inbox */
export const MessageReply = z.object({
  from: z.string().describe("Sender name"),
  date: z.string().describe("Date and time of the reply"),
  body: z.string().describe("Full text of the reply"),
});
export type MessageReply = z.infer<typeof MessageReply>;

export const Message = z.object({
  subject: z.string().describe("Message subject or thread title"),
  from: z.string().describe("Sender of the original message"),
  date: z.string().describe("Date of the original message"),
  body: z.string().describe("Full text of the original message body"),
  replies: z.array(MessageReply).optional().describe("Reply messages in the thread, in order"),
});
export type Message = z.infer<typeof Message>;

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
