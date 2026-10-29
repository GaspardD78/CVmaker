import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { TargetPanel } from './TargetPanel';
import { TargetStatusLine } from './TargetStatusLine';
import { PrintableCV } from '../export/PrintableCV';
import { generateDocxBlob } from '@/lib/export-docx';
import { buildTargetSnapshot, reconcileAiTarget } from '@/lib/cv-target-snapshot';
import { resolveTarget, type TargetChoice } from '@/lib/cv-targets';
import { getTemplate } from '@/templates';
import { TEST_PROFILE, makeBlocks, makeEntries } from '@/lib/test-helpers/cv-fixtures';
import type { CVDocument } from '@/types/cv';

const panel = (choice: TargetChoice, detected = {}) => {
  const target = resolveTarget(choice, {}, detected);
  return renderToStaticMarkup(
    <TargetPanel choice={choice} onChange={() => {}} detected={detected} effectiveType={target.type} effectiveIntent={target.intent} />,
  );
};

describe('TargetPanel : cas courant rapide', () => {
  it('trois sélecteurs en Auto, formulaire replié', () => {
    const html = panel({});
    expect(html.match(/<select/g)).toHaveLength(3);
    expect(html.match(/<option value="auto"[^>]*>Auto<\/option>/g)).toHaveLength(3);
    expect(html).toContain('Type de structure');
    expect(html).toContain('Intention');
    expect(html).toContain('Premier lecteur');
    expect(html).toContain('Préciser la cible');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Premier lecteur : nom');
    expect(html).not.toContain('Entreprise');
  });

  it('info-bulle d\'une phrase par sélecteur', () => {
    const html = panel({});
    expect(html).toContain('title="Le type de structure adapte');
    expect(html).toContain('title="La démarche :');
    expect(html).toContain('title="Qui lira le CV en premier');
  });

  it('affiche ce que l\'application a détecté dans l\'option Auto', () => {
    const html = panel({}, { type: 'public', intent: 'annonce' });
    expect(html).toContain('Auto (Fonction publique)');
    expect(html).toContain('Auto (Annonce)');
  });

  it('candidature spontanée ou recommandation : le formulaire de cible remplace l\'annonce, ouvert', () => {
    for (const intent of ['spontanee', 'recommandation'] as const) {
      const html = panel({ intent });
      expect(html).toContain('aria-expanded="true"');
      for (const label of ['Entreprise', 'Activité', 'Contexte RH connu', 'Postes envisagés, par ordre de priorité', 'Atouts à mettre en avant', 'Autre contexte connu']) {
        expect(html).toContain(label);
      }
    }
  });

  it('champs du lecteur distincts ; « Transmis par » seulement pour une recommandation', () => {
    const reco = panel({ intent: 'recommandation' });
    for (const label of ['Premier lecteur : nom', 'Premier lecteur : fonction', 'Transmis par : nom', 'Ce que valorise ce lecteur']) expect(reco).toContain(label);
    const spont = panel({ intent: 'spontanee' });
    expect(spont).toContain('Premier lecteur : nom');
    expect(spont).not.toContain('Transmis par : nom');
  });

  it('catégorie et filière : seulement pour le type public', () => {
    expect(panel({ type: 'public', intent: 'spontanee' })).toContain('Catégorie visée');
    expect(panel({ type: 'esn', intent: 'spontanee' })).not.toContain('Catégorie visée');
  });

  it('rappelle que les noms restent sur l\'appareil', () => {
    expect(panel({ intent: 'recommandation' })).toContain('Les noms restent sur cet appareil');
  });
});

describe('TargetStatusLine', () => {
  const retained = resolveTarget({ type: 'public', intent: 'annonce', firstReader: 'rh' });
  const html = (proposal?: Parameters<typeof TargetStatusLine>[0]['proposal']) =>
    renderToStaticMarkup(<TargetStatusLine retained={retained} proposal={proposal} onEdit={() => {}} onApplyProposal={() => {}} />);

  it('Ciblage retenu et bouton Modifier et régénérer', () => {
    const out = html();
    expect(out).toContain('Ciblage retenu :');
    expect(out).toContain('Fonction publique · Annonce · RH');
    expect(out).toContain('Modifier et régénérer');
    expect(out).not.toContain('Ciblage proposé');
  });

  it('Ciblage proposé : bouton Appliquer et régénérer seulement s\'il y a un axe à combler', () => {
    const auto = resolveTarget({ type: 'esn' });
    const outcome = reconcileAiTarget(auto, { firstReader: 'direction', raison: 'Poste de responsable' });
    const out = renderToStaticMarkup(<TargetStatusLine retained={auto} proposal={outcome} onEdit={() => {}} onApplyProposal={() => {}} />);
    expect(out).toContain('Ciblage proposé :');
    expect(out).toContain('Direction');
    expect(out).toContain('Poste de responsable');
    expect(out).toContain('Appliquer et régénérer');
  });

  it('désaccord avec un choix explicite : expliqué, pas de bouton', () => {
    const explicit = resolveTarget({ type: 'esn', intent: 'annonce', firstReader: 'rh' });
    const outcome = reconcileAiTarget(explicit, { type: 'public' });
    const out = renderToStaticMarkup(<TargetStatusLine retained={explicit} proposal={outcome} onEdit={() => {}} onApplyProposal={() => {}} />);
    expect(out).toContain('L&#x27;IA proposait « public » pour le type de structure');
    expect(out).toContain('votre choix');
    expect(out).not.toContain('Appliquer et régénérer');
  });
});

describe('les noms du ciblage ne sortent jamais dans l\'export', () => {
  const target = resolveTarget({ type: 'esn', intent: 'recommandation', readerName: 'Camille Fictif', readerRole: 'directeur des opérations', referrerName: 'Alex Fictif', readerNote: 'délais' });
  const entries = makeEntries();
  const cv: CVDocument = {
    id: 'cv1', profileId: 'p1', name: 'T', templateId: 'ats-classic', targetJob: null, targetCompany: null, customSummary: null,
    settings: { target: buildTargetSnapshot(target) }, isFavorite: false, lastExported: null, markdownContent: null, markdownMode: 0, createdAt: '', updatedAt: '',
  };

  it('rendu imprimé / PDF', () => {
    const html = renderToStaticMarkup(<PrintableCV cv={cv} profile={TEST_PROFILE} blocks={makeBlocks(entries)} entries={entries} template={getTemplate('ats-classic')} />);
    for (const secret of ['Camille Fictif', 'Alex Fictif', 'directeur des opérations']) expect(html).not.toContain(secret);
  });

  it('export DOCX', async () => {
    const blob = await generateDocxBlob(cv, TEST_PROFILE, makeBlocks(entries), entries, getTemplate('ats-classic'));
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string');
    for (const secret of ['Camille Fictif', 'Alex Fictif', 'directeur des opérations']) expect(xml).not.toContain(secret);
  });
});

describe('TargetPanel : régénération et titre', () => {
  const render = (props: { dirty?: boolean; onCopyPrompt?: () => void }) => {
    const choice = {};
    const target = resolveTarget(choice);
    return renderToStaticMarkup(
      <TargetPanel choice={choice} onChange={() => {}} detected={{}} effectiveType={target.type} effectiveIntent={target.intent} {...props} />,
    );
  };
  it('« Copier le nouveau prompt » apparaît dès qu\'un champ a changé', () => {
    expect(render({})).not.toContain('Copier le nouveau prompt');
    expect(render({ dirty: false, onCopyPrompt: () => {} })).not.toContain('Copier le nouveau prompt');
    expect(render({ dirty: true, onCopyPrompt: () => {} })).toContain('Copier le nouveau prompt');
    expect(render({ dirty: true })).not.toContain('Copier le nouveau prompt');
  });
  it('règle de titre par CV, dont « Titre libre »', () => {
    const html = renderToStaticMarkup(
      <TargetPanel choice={{ titleRule: 'free' }} onChange={() => {}} detected={{}} effectiveType={null} effectiveIntent="spontanee" />,
    );
    expect(html).toContain('Règle de titre pour ce CV');
    expect(html).toContain('Titre libre (conservé tel quel)');
    expect(html).toContain('Le titre proposé par l&#x27;IA est conservé tel quel, même avec un angle actif.');
  });
});
