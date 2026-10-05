import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackupProfilePicker } from './ImportConflictModal';
import { defaultSourceProfileId } from '@/lib/backup';

// Profils fictifs.
const profiles = [{ id: 'p-autre', label: 'Alex Fictif' }, { id: 'p-actif', label: 'Sam Exemple' }];

describe('choix du profil à restaurer', () => {
  it('présélection : le profil actif s\'il est présent, l\'unique profil, sinon aucun (jamais le premier)', () => {
    expect(defaultSourceProfileId(profiles, 'p-actif')).toBe('p-actif');
    expect(defaultSourceProfileId(profiles, 'p-inconnu')).toBe('');
    expect(defaultSourceProfileId([profiles[0]], 'p-inconnu')).toBe('p-autre');
    expect(defaultSourceProfileId([], 'p-actif')).toBe('');
  });

  it('sélecteur affiché seulement avec plusieurs profils, profil actif signalé', () => {
    const html = renderToStaticMarkup(<BackupProfilePicker profiles={profiles} currentUserId="p-actif" value="p-actif" onChange={() => {}} />);
    expect(html).toContain('La sauvegarde contient 2 profils');
    expect(html).toContain('Sam Exemple (profil actif)');
    expect(html).toContain('Alex Fictif');
    expect(renderToStaticMarkup(<BackupProfilePicker profiles={[profiles[0]]} currentUserId={null} value="" onChange={() => {}} />)).toBe('');
  });
});
