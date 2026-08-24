/**
 * Génération du template HTML pour le digest email quotidien + envoi via commande Rust.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  JobOffer,
  JobOfferWithAlerts,
  JobSource,
  JobWatchAlert,
  JobWatchSettings,
} from '@/types/job-watch';
import { SOURCE_LABELS } from './sources';

/** Une offre dans le digest, avec le score de la piste qui l'accueille. */
export interface DigestOffer {
  offer: JobOffer;
  /** Score de la piste de cette section. */
  score: number;
  /** Autres pistes ayant capté la même offre. */
  alsoIn: string[];
}

/** Une section du digest — une piste du portefeuille. */
export interface DigestSection {
  alertId: string | null;
  name: string;
  color: string;
  offers: DigestOffer[];
}

/**
 * Répartit les offres en sections, une par piste.
 *
 * Une offre captée par plusieurs pistes n'apparaît qu'une fois, dans la
 * section où elle est la mieux notée, avec la mention des autres pistes : la
 * répéter gonflerait artificiellement le digest et masquerait le fait que les
 * pistes se recouvrent.
 *
 * Les sections vides sont conservées — l'absence de résultat sur une piste est
 * une information, pas un vide à masquer. Les offres qui ne sont plus
 * rattachées à aucune piste sont regroupées en fin de digest plutôt que
 * silencieusement perdues.
 */
export function buildDigestSections(
  offers: JobOfferWithAlerts[],
  alerts: JobWatchAlert[],
): DigestSection[] {
  const ordered = [...alerts].sort((a, b) => a.position - b.position);
  const byAlert = new Map<string, DigestSection>(
    ordered.map(a => [a.id, { alertId: a.id, name: a.name, color: a.color, offers: [] }]),
  );
  const nameOf = new Map(ordered.map(a => [a.id, a.name]));
  const unlinked: DigestOffer[] = [];

  for (const offer of offers) {
    const links = offer.alerts.filter(l => byAlert.has(l.alertId));
    if (links.length === 0) {
      unlinked.push({ offer, score: offer.score, alsoIn: [] });
      continue;
    }
    const best = links.reduce((acc, l) => (l.score > acc.score ? l : acc));
    byAlert.get(best.alertId)!.offers.push({
      offer,
      score: best.score,
      alsoIn: links
        .filter(l => l.alertId !== best.alertId)
        .map(l => nameOf.get(l.alertId) ?? '')
        .filter(Boolean),
    });
  }

  for (const section of byAlert.values()) {
    section.offers.sort((a, b) => b.score - a.score);
  }

  const sections = [...byAlert.values()];
  if (unlinked.length > 0) {
    unlinked.sort((a, b) => b.score - a.score);
    sections.push({ alertId: null, name: 'Non rattachées', color: '#6b7280', offers: unlinked });
  }
  return sections;
}

export function buildEmailHtml(sections: DigestSection[], date: string): string {
  const allOffers = sections.flatMap(s => s.offers);

  const summaryRows = sections
    .map(s => `<tr><td style="padding:4px 8px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px"></span>${escapeHtml(s.name)}</td><td style="padding:4px 8px;font-weight:600">${s.offers.length > 0 ? `${s.offers.length} offre${s.offers.length > 1 ? 's' : ''}` : '—'}</td></tr>`)
    .join('');

  const renderOffer = ({ offer: o, score, alsoIn }: DigestOffer) => {
    const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#ea580c' : '#6b7280';
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
            <a href="${safeUrl(o.url)}" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none">${escapeHtml(o.title)}</a>
            <div style="color:#6b7280;font-size:13px;margin-top:2px">${escapeHtml([o.company, o.location].filter(Boolean).join(' · '))}</div>
          </div>
          <span style="background:#f3f4f6;color:${scoreColor};font-weight:700;font-size:12px;padding:2px 8px;border-radius:4px;white-space:nowrap">⭐ ${score}</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <span style="background:#eff6ff;color:#1d4ed8;font-size:11px;padding:2px 6px;border-radius:4px">${SOURCE_LABELS[o.source as JobSource] ?? o.source}</span>
          ${o.contractType ? `<span style="background:#f3f4f6;color:#374151;font-size:11px;padding:2px 6px;border-radius:4px">${escapeHtml(o.contractType)}</span>` : ''}
          ${commute ? `<span style="background:#f0fdf4;color:#15803d;font-size:11px;padding:2px 6px;border-radius:4px">${commute}</span>` : ''}
          ${salaryLabel ? `<span style="background:#fefce8;color:#a16207;font-size:11px;padding:2px 6px;border-radius:4px">💶 ${escapeHtml(salaryLabel)}</span>` : ''}
          ${alsoIn.length > 0 ? `<span style="background:#faf5ff;color:#7e22ce;font-size:11px;padding:2px 6px;border-radius:4px">Aussi : ${escapeHtml(alsoIn.join(', '))}</span>` : ''}
        </div>
        ${o.descriptionSnippet ? `<p style="font-size:12px;color:#6b7280;margin-top:8px;line-height:1.5">${escapeHtml(o.descriptionSnippet.slice(0, 200))}${o.descriptionSnippet.length > 200 ? '…' : ''}</p>` : ''}
        <a href="${safeUrl(o.url)}" style="display:inline-block;margin-top:10px;background:#2563eb;color:#fff;font-size:12px;padding:6px 14px;border-radius:6px;text-decoration:none">Voir l'offre →</a>
      </div>`;
  };

  const sectionBlocks = sections
    .map(s => `
      <div style="margin-bottom:24px">
        <h2 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 10px;padding-left:10px;border-left:4px solid ${s.color}">
          ${escapeHtml(s.name)}
          <span style="font-weight:500;color:#6b7280">· ${s.offers.length} offre${s.offers.length > 1 ? 's' : ''}</span>
        </h2>
        ${s.offers.length > 0
          ? s.offers.map(renderOffer).join('')
          : '<p style="font-size:12px;color:#9ca3af;margin:0 0 4px">Aucune nouvelle offre sur cette piste.</p>'}
      </div>`)
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
        ${allOffers.length} nouvelle${allOffers.length > 1 ? 's' : ''} offre${allOffers.length > 1 ? 's' : ''} détectée${allOffers.length > 1 ? 's' : ''}
      </p>
      <table style="border-collapse:collapse;font-size:13px;color:#374151">
        ${summaryRows}
      </table>
    </div>
    <div style="padding:20px 24px">
      ${sectionBlocks}
    </div>
    <div style="padding:12px 24px;background:#f3f4f6;border-radius:0 0 8px 8px;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0">Généré par ResumeForge · Ouvrez l'app pour gérer vos offres</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * URL sûre pour un attribut `href`.
 *
 * Les URLs proviennent de pages tierces scrapées : une valeur contenant un
 * guillemet permettrait de sortir de l'attribut et d'injecter du balisage dans
 * l'email, et un schéma `javascript:` serait exécutable dans certains clients.
 * On restreint donc aux schémas http(s) et on échappe la valeur.
 */
function safeUrl(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '#';
  return escapeHtml(trimmed);
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
  sections: DigestSection[],
  settings: JobWatchSettings
): Promise<void> {
  if (!settings.emailDigestEnabled) return;
  if (!settings.emailTo || !settings.emailSmtpHost || !settings.emailSmtpUser) {
    throw new Error('Configuration email incomplète (destinataire, hôte SMTP ou utilisateur manquant)');
  }

  const total = sections.reduce((acc, s) => acc + s.offers.length, 0);
  if (total === 0) return;

  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const subject = `[ResumeForge] ${total} nouvelle${total > 1 ? 's' : ''} offre${total > 1 ? 's' : ''} · ${date}`;
  const htmlBody = buildEmailHtml(sections, date);

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
