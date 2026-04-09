export type ApplicationSource =
  | 'job_board'
  | 'spontaneous'
  | 'network'
  | 'recruiter'
  | 'linkedin'
  | 'other';

export type ApplicationStatus =
  | 'draft'
  | 'applied'
  | 'acknowledged'
  | 'phone_screen'
  | 'interview'
  | 'technical_test'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'ghosted';

export type EventType =
  | 'status_change'
  | 'note'
  | 'email_sent'
  | 'email_received'
  | 'call'
  | 'interview'
  | 'followup'
  | 'document_sent'
  | 'other';

export interface Application {
  id: string;
  profileId: string;
  cvId: string | null;
  companyName: string;
  jobTitle: string;
  jobUrl: string | null;
  source: ApplicationSource | null;
  sourceDetail: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: ApplicationStatus;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  remotePolicy: string | null;
  priority: 1 | 2 | 3;
  notes: string | null;
  jobDescription: string | null;
  appliedAt: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  rejectionReason: string | null;
  rejectionEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  eventType: EventType;
  eventDate: string;
  title: string;
  description: string | null;
  oldStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus | null;
  calendarId: string | null;
  createdAt: string;
}

export type AttachmentLabel = 'cv' | 'cover_letter' | 'portfolio' | 'certificate' | 'other';

export interface ApplicationAttachment {
  id: string;
  applicationId: string;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  label: AttachmentLabel;
  createdAt: string;
}