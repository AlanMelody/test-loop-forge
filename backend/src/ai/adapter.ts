import type { Section, Status } from '../domain/status.js';

export interface DraftInput {
  requirementId: string;
  title: string;
  status: Status;
  section: Section;
  currentSections: Record<Section, string>;
  documentVersion: number;
}

export interface AiDraftAdapter {
  generate(input: DraftInput): Promise<{ content: string }>;
}
