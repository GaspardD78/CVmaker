/**
 * Génération du template HTML pour le digest email quotidien + envoi via commande Rust.
 */

import { invoke } from '@tauri-apps/api/core';
import type { JobOffer, JobWatchSettings, JobSource } from '@/types/job-watch';

const SOURCE_LABELS: Record<JobSource, string> = {
  apec: 'APEC', wttj: 'WTTJ', linkedin_rss: 'LinkedIn', jobicy: 'Jobicy',
  france_travail: 'France Travail', emploi_territorial: 'Emploi Territorial', mantiks: 'Mantiks',
};

export function buildEmailHtml(offers: JobOffer[], date: string): string {
  const bySource = offers.reduce<Partial<Record<JobSource, JobOffer[]>>>((acc, o) => {
    const key = o.source as JobSource;
    (acc[key] ??= []).push(o);
    return acc;
  }, {});
  const sources: JobSource[] = ['apec', 'wttj', 'linkedin_rss', 'france_travail'];

  const summaryRows = sources
    .filter(s => bySource[s]?.length)
    .map(s => `<tr><td style="padding:4px 8px">${SOURCE_LABELS[s]}</td><td style="padding:4px 8px;font-weight:600">${bySource[s]!.length} offre${bySource[s]!.length > 1 ? 's' : ''}</td></tr>`)
    .join('');

  const offerCards = offers
    .sort((a, b) => b.score - a.score)
    .map(o => {
      const scoreColor = o.score >= 70 ? '#16a34a' : o.score >= 40 ? '#ea580c' : '#6b7280';
      const commute = o.commuteStatus === 'ok' && o.commuteMinutes !== null
        ? `🚇 ${o.commuteMinutes} min`
        : o.commuteStatus === 'not_found' ? '📍 Non précisé' : '';

      const salaryLabel = o.salaryMin && o.salaryMax && o.salaryMin !== o.salaryMax
        ? `${Math.round(o.salaryMin / 1000)}k€ – ${Math.round(o.salaryMax / 1000)}k€`
        : o.salaryMin ? `${Math.round(o.salaryMin / 1000)}k€`
        : o.salaryRaw ? o.salaryRaw.slice(0, 30)
        : null;

      return `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div>
              <a href="${o.url}" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none">${escapeHtml(o.title)}</a>
              <div style="color:#6b7280;font-size:13px;margin-top:2px">${escapeHtml([o.company, o.location].filter(Boolean).join(' · '))}</div>
            </div>
            <span style="background:#f3f4f6;color:${scoreColor};font-weight:700;font-size:12px;padding:2px 8px;border-radius:4px;white-space:nowrap">⭐ ${o.score}</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <span style="background:#eff6ff;color:#1d4ed8;font-size:11px;padding:2px 6px;border-radius:4px">${SOURCE_LABELS[o.source as JobSource] ?? o.source}</span>
            ${o.contractType ? `<span style="background:#f3f4f6;color:#374151;font-size:11px;padding:2px 6px;border-radius:4px">${escapeHtml(o.contractType)}</span>` : ''}
            ${commute ? `<span style="background:#f0fdf4;color:#15803d;font-size:11px;padding:2px 6px;border-radius:4px">${commute}</span>` : ''}
            ${salaryLabel ? `<span style="background:#fefce8;color:#a16207;font-size:11px;padding:2px 6px;border-radius:4px">💶 ${escapeHtml(salaryLabel)}</span>` : ''}
          </div>
          ${o.descriptionSnippet ? `<p style="font-size:12px;color:#6b7280;margin-top:8px;line-height:1.5">${escapeHtml(o.descriptionSnippet.slice(0, 200))}${o.descriptionSnippet.length > 200 ? '…' : ''}</p>` : ''}
          <a href="${o.url}" style="display:inline-block;margin-top:10px;background:#2563eb;color:#fff;font-size:12px;padding:6px 14px;border-radius:6px;text-decoration:none">Voir l'offre →</a>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ResumeForge — Digest</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;margin:0;padding:20px">
  <div style="max-width:640px;margin:0 auto">
    <div style="background:#1d4ed8;padding:20px 24px;border-radius:8px 8px 0 0">
      <h1 style="color:#fff;margin:0;font-size:20px">📋 ResumeForge — Nouvelles offres</h1>
      <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px">${date}</p>
    </div>
    <div style="background:#fff;padding:20px 24px;border-bottom:1px solid #e5e7eb">
      <p style="font-size:15px;font-weight:600;margin:0 0 12px;color:#111827">
        ${offers.length} nouvelle${offers.length > 1 ? 's' : ''} offre${offers.length > 1 ? 's' : ''} détectée${offers.length > 1 ? 's' : ''}
      </p>
      <table style="border-collapse:collapse;font-size:13px;color:#374151">
        ${summaryRows}
      </table>
    </div>
    <div style="padding:20px 24px">
      ${offerCards}
    </div>
    <div style="padding:12px 24px;background:#f3f4f6;border-radius:0 0 8px 8px;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0">Généré par ResumeForge · Ouvrez l'app pour gérer vos offres</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendDigestEmail(
  offers: JobOffer[],
  settings: JobWatchSettings
): Promise<void> {
  if (!settings.emailDigestEnabled) return;
  if (!settings.emailTo || !settings.emailSmtpHost || !settings.emailSmtpUser) {
    throw new Error('Configuration email incomplète (destinataire, hôte SMTP ou utilisateur manquant)');
  }

  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const subject = `[ResumeForge] ${offers.length} nouvelle${offers.length > 1 ? 's' : ''} offre${offers.length > 1 ? 's' : ''} · ${date}`;
  const htmlBody = buildEmailHtml(offers, date);

  await invoke('send_email', {
    payload: {
      smtp_host:     settings.emailSmtpHost,
      smtp_port:     settings.emailSmtpPort,
      smtp_user:     settings.emailSmtpUser,
      smtp_password: settings.emailSmtpPassword,
      to:            settings.emailTo,
      subject,
      html_body:     htmlBody,
    },
  });
}
