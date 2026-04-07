import { useState, useEffect, FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Profile } from '@/types/profile';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import { User, Plus, Trash2 } from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useProfileStore } from '@/stores/profileStore';

export function LoginPage() {
  const { login, hasExplicitlyLoggedOut } = useAuthStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const db = await getDb();
      const rawProfiles = await db.select<Record<string, unknown>[]>('SELECT * FROM profiles ORDER BY first_name ASC');
      const allProfiles = rawProfiles.map(p => keysToCamelCase<Profile>(p));
      setProfiles(allProfiles);

      // Auto-login if there's exactly one profile and user didn't explicitly log out
      if (allProfiles.length === 1 && !hasExplicitlyLoggedOut) {
        login(allProfiles[0].id);
        return;
      }
    } catch {
      setError('Erreur lors du chargement des profils');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProfile = (profileId: string) => {
    login(profileId);
  };

  const handleCreateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    try {
      const db = await getDb();

      // Check if profile already exists
      const existing = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM profiles WHERE lower(first_name) = lower(?1) AND lower(last_name) = lower(?2)',
        [firstName.trim(), lastName.trim()]
      );

      if (existing.length > 0) {
        const profile = keysToCamelCase<Profile>(existing[0]);
        login(profile.id);
        return;
      }

      // Create new profile
      const result = await db.select<{id: string}[]>(
        'INSERT INTO profiles (first_name, last_name) VALUES (?1, ?2) RETURNING id',
        [firstName.trim(), lastName.trim()]
      );

      if (result.length > 0) {
        login(result[0].id);
      }
    } catch {
      setError('Erreur lors de la création du profil');
    }
  };

  const handleDeleteProfile = async (e: React.MouseEvent, profileId: string, name: string) => {
    e.stopPropagation();

    let isConfirmed = false;
    try {
      isConfirmed = await confirm(
        `Êtes-vous sûr de vouloir supprimer le profil "${name}" ? Toutes les données associées (CV, candidatures, entrées) seront définitivement supprimées.`,
        { title: 'Confirmer la suppression', kind: 'warning' }
      );
    } catch {
      isConfirmed = window.confirm(`Supprimer le profil "${name}" et toutes ses données ?`);
    }

    if (!isConfirmed) return;

    try {
      const { deleteProfile } = useProfileStore.getState();
      await deleteProfile(profileId);
      await loadProfiles();
    } catch {
      setError('Erreur lors de la suppression du profil');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ResumeForge</h1>
          <p className="text-gray-500 mt-2">Sélectionnez votre profil ou créez-en un nouveau</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {profiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Profils existants</h2>
            <div className="space-y-2">
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectProfile(profile.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectProfile(profile.id); }}
                  className="w-full flex items-center p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3 flex-shrink-0">
                    {profile.photoPath ? (
                      <img src={profile.photoPath} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{profile.firstName} {profile.lastName}</p>
                    {profile.title && <p className="text-sm text-gray-500 truncate">{profile.title}</p>}
                  </div>
                  <button
                    onClick={(e) => handleDeleteProfile(e, profile.id, `${profile.firstName} ${profile.lastName}`)}
                    className="ml-2 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Supprimer ce profil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isCreating ? (
          <form onSubmit={handleCreateProfile} className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Nouveau profil</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!firstName.trim() || !lastName.trim()}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  Connexion
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-colors text-gray-600 hover:text-blue-600"
          >
            <Plus className="w-5 h-5 mr-2" />
            Créer un nouveau profil
          </button>
        )}
      </div>
    </div>
  );
}
