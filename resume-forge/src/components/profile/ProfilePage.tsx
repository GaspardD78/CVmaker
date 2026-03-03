import { useEffect } from 'react';
import { useProfileStore } from '@/stores/profileStore';

export function ProfilePage() {
  const { profile, entries, fetchProfile, isLoading, error } = useProfileStore();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (isLoading) return <div className="p-4">Chargement...</div>;
  if (error) return <div className="p-4 text-red-500">Erreur : {error}</div>;

  return (
    <div className="p-4 space-y-8">
      <section>
        <h1 className="text-2xl font-bold mb-4">Profil Maître</h1>
        <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Prénom</label>
              <input type="text" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" defaultValue={profile?.firstName || ''} readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nom</label>
              <input type="text" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" defaultValue={profile?.lastName || ''} readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" defaultValue={profile?.email || ''} readOnly />
            </div>
          </div>
          <p className="text-sm text-gray-500 italic mt-2">Le formulaire complet sera implémenté ultérieurement.</p>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Entrées Maîtres (Expériences, Formations...)</h2>
          <button className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition">
            + Ajouter
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-lg border text-center text-gray-500">
            Aucune entrée pour le moment.
          </div>
        ) : (
          <ul className="space-y-4">
            {entries.map(entry => (
              <li key={entry.id} className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{entry.title}</h3>
                  <p className="text-sm text-gray-600">{entry.entryType}</p>
                </div>
                <div className="text-gray-400">
                  {/* Actions to be implemented */}
                  <span>Modifier</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
