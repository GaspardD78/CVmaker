import JSZip from 'jszip';
import { save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import { Application, ApplicationEvent, ApplicationAttachment, ApplicationStatus, EventType, AttachmentLabel } from '@/types/application';

// ─── French labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Brouillon',
  applied: 'Postulé',
  acknowledged: 'Accusé de réception',
  phone_screen: 'Pré-qualification',
  interview: 'Entretien',
  technical_test: 'Test technique',
  offer: 'Offre reçue',
  accepted: 'Accepté',
  rejected: 'Refusé',
  withdrawn: 'Retiré',
  ghosted: 'Sans réponse',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: '#94a3b8',
  applied: '#3b82f6',
  acknowledged: '#6366f1',
  phone_screen: '#8b5cf6',
  interview: '#f59e0b',
  technical_test: '#f97316',
  offer: '#22c55e',
  accepted: '#16a34a',
  rejected: '#ef4444',
  withdrawn: '#9ca3af',
  ghosted: '#6b7280',
};

const EVENT_LABELS: Record<EventType, string> = {
  status_change: 'Changement de statut',
  note: 'Note',
  email_sent: 'Email envoyé',
  email_received: 'Email reçu',
  call: 'Appel téléphonique',
  interview: 'Entretien',
  followup: 'Relance',
  document_sent: 'Document envoyé',
  other: 'Autre',
};

const ATTACHMENT_LABELS: Record<AttachmentLabel, string> = {
  cv: 'CV',
  cover_letter: 'Lettre de motivation',
  portfolio: 'Portfolio',
  certificate: 'Certificat',
  other: 'Autre document',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Haute',
  2: 'Normale',
  3: 'Basse',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatDateTime(d: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);
}

// ─── HTML generation ─────────────────────────────────────────────────────────

function generateHtml(
  apps: Application[],
  eventsMap: Map<string, ApplicationEvent[]>,
  attachmentsMap: Map<string, ApplicationAttachment[]>,
  exportDate: string,
): string {
  const totalActive = apps.filter(a => !['accepted', 'rejected', 'withdrawn', 'ghosted'].includes(a.status)).length;
  const totalInterviews = apps.filter(a => eventsMap.get(a.id)?.some(e => e.eventType === 'interview')).length;

  const byStatus = Object.entries(STATUS_LABELS).reduce<Record<string, number>>((acc, [status]) => {
    acc[status] = apps.filter(a => a.status === status).length;
    return acc;
  }, {});

  // ── Summary table rows ────────────────────────────────────────────────────
  const tableRows = apps.map((app, idx) => {
    const folderName = `${String(idx + 1).padStart(2, '0')}_${slugify(app.companyName)}_${slugify(app.jobTitle)}`;
    const attachments = attachmentsMap.get(app.id) ?? [];
    const attachmentLinks = attachments
      .map(a => `<a href="pieces_jointes/${folderName}/${a.fileName}" title="${ATTACHMENT_LABELS[a.label]}">${a.fileName}</a>`)
      .join('<br>');
    return `
      <tr>
        <td><a href="#app-${app.id}">${idx + 1}</a></td>
        <td><a href="#app-${app.id}">${escapeHtml(app.companyName)}</a></td>
        <td>${escapeHtml(app.jobTitle)}</td>
        <td><span class="badge" style="background:${STATUS_COLORS[app.status]}">${STATUS_LABELS[app.status]}</span></td>
        <td class="center">${PRIORITY_LABELS[app.priority]}</td>
        <td class="center">${formatDate(app.appliedAt)}</td>
        <td>${app.nextAction ? escapeHtml(app.nextAction) : '—'}<br><small>${app.nextActionDate ? formatDate(app.nextActionDate) : ''}</small></td>
        <td>${attachmentLinks || '—'}</td>
      </tr>`;
  }).join('');

  // ── Detail sections ───────────────────────────────────────────────────────
  const detailSections = apps.map((app, idx) => {
    const folderName = `${String(idx + 1).padStart(2, '0')}_${slugify(app.companyName)}_${slugify(app.jobTitle)}`;
    const attachments = attachmentsMap.get(app.id) ?? [];
    const events = (eventsMap.get(app.id) ?? []).slice().sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );

    const attachmentsHtml = attachments.length === 0
      ? '<p class="empty">Aucune pièce jointe</p>'
      : `<ul class="attachments">${attachments.map(a =>
          `<li><a href="pieces_jointes/${folderName}/${a.fileName}">📎 ${escapeHtml(a.fileName)}</a> <span class="att-label">${ATTACHMENT_LABELS[a.label]}</span>${a.fileSize ? ` <small>(${formatFileSize(a.fileSize)})</small>` : ''}</li>`
        ).join('')}</ul>`;

    const eventsHtml = events.length === 0
      ? '<p class="empty">Aucun événement enregistré</p>'
      : `<div class="timeline">${events.map(e => `
          <div class="event">
            <div class="event-dot"></div>
            <div class="event-content">
              <span class="event-type">${EVENT_LABELS[e.eventType]}</span>
              <span class="event-date">${formatDateTime(e.eventDate)}</span>
              <p class="event-title">${escapeHtml(e.title)}</p>
              ${e.description ? `<p class="event-desc">${escapeHtml(e.description)}</p>` : ''}
              ${e.oldStatus && e.newStatus ? `<p class="status-change">${STATUS_LABELS[e.oldStatus as ApplicationStatus]} → ${STATUS_LABELS[e.newStatus as ApplicationStatus]}</p>` : ''}
            </div>
          </div>`).join('')}</div>`;

    const contact = [app.contactName, app.contactEmail, app.contactPhone].filter(Boolean).join(' — ');
    const salary = app.salaryMin || app.salaryMax
      ? [app.salaryMin ? `${app.salaryMin.toLocaleString('fr-FR')} €` : null, app.salaryMax ? `${app.salaryMax.toLocaleString('fr-FR')} €` : null].filter(Boolean).join(' – ')
      : null;

    return `
      <section id="app-${app.id}" class="app-detail">
        <div class="app-header">
          <div>
            <h2>${escapeHtml(app.companyName)} — <span class="job-title">${escapeHtml(app.jobTitle)}</span></h2>
            <div class="app-meta">
              <span class="badge" style="background:${STATUS_COLORS[app.status]}">${STATUS_LABELS[app.status]}</span>
              ${app.location ? `<span>📍 ${escapeHtml(app.location)}</span>` : ''}
              ${app.remotePolicy ? `<span>🏠 ${escapeHtml(app.remotePolicy)}</span>` : ''}
              ${salary ? `<span>💰 ${salary}</span>` : ''}
              ${app.jobUrl ? `<a href="${escapeHtml(app.jobUrl)}" target="_blank">🔗 Voir l'offre</a>` : ''}
            </div>
          </div>
          <a href="#top" class="back-top">↑ Retour au tableau</a>
        </div>
        <div class="app-grid">
          <div>
            <h3>Informations</h3>
            <table class="info-table">
              <tr><th>Candidature déposée</th><td>${formatDate(app.appliedAt)}</td></tr>
              <tr><th>Priorité</th><td>${PRIORITY_LABELS[app.priority]}</td></tr>
              ${contact ? `<tr><th>Contact</th><td>${escapeHtml(contact)}</td></tr>` : ''}
              ${app.nextAction ? `<tr><th>Prochaine action</th><td>${escapeHtml(app.nextAction)}${app.nextActionDate ? ` <em>(${formatDate(app.nextActionDate)})</em>` : ''}</td></tr>` : ''}
              ${app.notes ? `<tr><th>Notes</th><td>${escapeHtml(app.notes)}</td></tr>` : ''}
            </table>
            <h3>Pièces jointes</h3>
            ${attachmentsHtml}
          </div>
          <div>
            <h3>Historique des événements</h3>
            ${eventsHtml}
          </div>
        </div>
      </section>`;
  }).join('');

  // ── Status summary chips ──────────────────────────────────────────────────
  const statusChips = Object.entries(STATUS_LABELS)
    .filter(([status]) => byStatus[status] > 0)
    .map(([status, label]) => `<span class="chip" style="border-color:${STATUS_COLORS[status as ApplicationStatus]};color:${STATUS_COLORS[status as ApplicationStatus]}">${byStatus[status]} ${label}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export candidatures — ${exportDate}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #1e293b; background: #f8fafc; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .page-header { background: #1e40af; color: #fff; padding: 24px 40px; }
  .page-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .page-header p { opacity: .75; font-size: 13px; }

  /* Stats bar */
  .stats-bar { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 40px; display: flex; gap: 32px; align-items: center; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat-value { font-size: 24px; font-weight: 700; color: #1e40af; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .chip { border: 1.5px solid; border-radius: 99px; padding: 2px 10px; font-size: 12px; font-weight: 500; }

  /* Main content */
  main { padding: 32px 40px; max-width: 1400px; margin: 0 auto; }

  /* Summary table */
  h2.section-title { font-size: 17px; font-weight: 600; margin-bottom: 12px; }
  .table-wrap { overflow-x: auto; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  thead { background: #f1f5f9; }
  th { padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  td.center { text-align: center; }
  .badge { color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; display: inline-block; white-space: nowrap; }

  /* App detail section */
  .app-detail { margin-top: 48px; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }
  .app-header { padding: 20px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .app-header h2 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  .job-title { color: #475569; font-weight: 400; }
  .app-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 13px; color: #475569; }
  .back-top { font-size: 12px; white-space: nowrap; color: #94a3b8; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; }
  .back-top:hover { color: #2563eb; text-decoration: none; border-color: #2563eb; }
  .app-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .app-grid > div { padding: 20px 24px; }
  .app-grid > div + div { border-left: 1px solid #f1f5f9; }
  h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 16px 0 8px; }
  h3:first-child { margin-top: 0; }

  .info-table { width: 100%; border-collapse: collapse; }
  .info-table th { width: 140px; text-align: left; font-weight: 500; color: #64748b; padding: 5px 8px 5px 0; vertical-align: top; font-size: 13px; }
  .info-table td { padding: 5px 8px; font-size: 13px; }

  .attachments { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .attachments li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .att-label { background: #f1f5f9; color: #475569; font-size: 11px; padding: 1px 7px; border-radius: 99px; }
  .empty { font-size: 13px; color: #94a3b8; font-style: italic; }

  /* Timeline */
  .timeline { display: flex; flex-direction: column; gap: 0; }
  .event { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
  .event:last-child { border-bottom: none; }
  .event-dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; margin-top: 5px; flex-shrink: 0; }
  .event-content { flex: 1; }
  .event-type { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #2563eb; margin-right: 8px; }
  .event-date { font-size: 11px; color: #94a3b8; }
  .event-title { font-weight: 500; margin-top: 2px; font-size: 13px; }
  .event-desc { color: #475569; font-size: 12px; margin-top: 3px; white-space: pre-wrap; }
  .status-change { font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic; }

  @media print {
    body { background: #fff; }
    .stats-bar { page-break-inside: avoid; }
    .app-detail { page-break-inside: avoid; box-shadow: none; border: 1px solid #e2e8f0; }
  }
</style>
</head>
<body>
<div id="top">
  <header class="page-header">
    <h1>Export des candidatures</h1>
    <p>Généré le ${exportDate} · ${apps.length} candidature${apps.length > 1 ? 's' : ''}</p>
  </header>
  <div class="stats-bar">
    <div class="stat"><div class="stat-value">${apps.length}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-value">${totalActive}</div><div class="stat-label">En cours</div></div>
    <div class="stat"><div class="stat-value">${totalInterviews}</div><div class="stat-label">Entretiens</div></div>
    <div class="chips">${statusChips}</div>
  </div>
</div>

<main>
  <h2 class="section-title">Tableau récapitulatif</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Entreprise</th>
          <th>Poste</th>
          <th>Statut</th>
          <th>Priorité</th>
          <th>Candidature</th>
          <th>Prochaine action</th>
          <th>Documents</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  ${detailSections}
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ─── Main export function ─────────────────────────────────────────────────────

export interface ExportOptions {
  /** ISO date string (inclusive) — filters on appliedAt, falling back to createdAt */
  startDate?: string;
  endDate?: string;
}

export async function exportApplicationsZip(options: ExportOptions = {}): Promise<void> {
  const db = await getDb();

  // Fetch all applications
  const rawApps = await db.select<Record<string, unknown>[]>(
    'SELECT * FROM applications ORDER BY updated_at DESC'
  );
  let apps = rawApps.map(a => keysToCamelCase<Application>(a));

  // Date-range filter (based on appliedAt, fallback to createdAt)
  if (options.startDate || options.endDate) {
    const start = options.startDate ? new Date(options.startDate).getTime() : -Infinity;
    const end = options.endDate ? new Date(options.endDate + 'T23:59:59').getTime() : Infinity;
    apps = apps.filter(a => {
      const ref = a.appliedAt ?? a.createdAt;
      const t = new Date(ref).getTime();
      return t >= start && t <= end;
    });
  }

  if (apps.length === 0) {
    throw new Error('Aucune candidature ne correspond à la période sélectionnée.');
  }

  // Fetch events and attachments for all applications
  const eventsMap = new Map<string, ApplicationEvent[]>();
  const attachmentsMap = new Map<string, ApplicationAttachment[]>();

  for (const app of apps) {
    const rawEvents = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM application_events WHERE application_id = ?1 ORDER BY event_date DESC',
      [app.id]
    );
    eventsMap.set(app.id, rawEvents.map(e => keysToCamelCase<ApplicationEvent>(e)));

    const rawAttachments = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM application_attachments WHERE application_id = ?1 ORDER BY created_at DESC',
      [app.id]
    );
    attachmentsMap.set(app.id, rawAttachments.map(a => keysToCamelCase<ApplicationAttachment>(a)));
  }

  // Build ZIP
  const zip = new JSZip();
  const exportDate = new Intl.DateTimeFormat('fr-FR').format(new Date());
  const exportDateSlug = new Date().toISOString().slice(0, 10);

  // index.html
  const html = generateHtml(apps, eventsMap, attachmentsMap, exportDate);
  zip.file('index.html', html);

  // Attached files — copy into pieces_jointes/<folder>/<file>
  for (let idx = 0; idx < apps.length; idx++) {
    const app = apps[idx];
    const attachments = attachmentsMap.get(app.id) ?? [];
    if (attachments.length === 0) continue;

    const folderName = `${String(idx + 1).padStart(2, '0')}_${slugify(app.companyName)}_${slugify(app.jobTitle)}`;

    for (const att of attachments) {
      try {
        const content = await readFile(att.filePath);
        zip.file(`pieces_jointes/${folderName}/${att.fileName}`, content);
      } catch {
        // File may have been moved/deleted; skip silently
      }
    }
  }

  const uint8 = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  const savePath = await save({
    defaultPath: `candidatures_${exportDateSlug}.zip`,
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
  });

  if (!savePath) return; // user cancelled

  await writeFile(savePath, uint8);
}
