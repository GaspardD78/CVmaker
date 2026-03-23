import { openUrl } from '@tauri-apps/plugin-opener';
import { EventType } from '@/types/application';

function formatGCalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

export function getDefaultDuration(eventType: EventType): number {
  switch (eventType) {
    case 'interview': return 60;
    case 'call': return 30;
    case 'followup': return 15;
    default: return 30;
  }
}

export function isCalendarWorthy(eventType: EventType): boolean {
  return ['interview', 'call', 'followup'].includes(eventType);
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  startDate: Date;
  durationMinutes?: number;
  description?: string;
  location?: string;
}): string {
  const { title, startDate, durationMinutes = 30, description, location } = params;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`);
  if (description) url.searchParams.set('details', description);
  if (location) url.searchParams.set('location', location);

  return url.toString();
}

export function buildEventGoogleCalendarUrl(
  event: {
    title: string;
    eventDate: string;
    description?: string | null;
    eventType: EventType;
    durationMinutes?: number;
  },
  application?: {
    companyName?: string;
    jobTitle?: string;
    location?: string | null;
  }
): string {
  const startDate = new Date(event.eventDate);

  const descriptionParts: string[] = [];
  if (event.description) descriptionParts.push(event.description);
  if (application?.companyName) descriptionParts.push(`Entreprise : ${application.companyName}`);
  if (application?.jobTitle) descriptionParts.push(`Poste : ${application.jobTitle}`);

  return buildGoogleCalendarUrl({
    title: event.title,
    startDate,
    durationMinutes: event.durationMinutes ?? getDefaultDuration(event.eventType),
    description: descriptionParts.join('\n') || undefined,
    location: application?.location || undefined,
  });
}

export async function openInGoogleCalendar(url: string): Promise<void> {
  await openUrl(url);
}
