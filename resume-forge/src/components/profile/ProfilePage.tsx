import { useEffect, useState, FormEvent } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { EntryType, MasterEntry } from '@/types/profile';

export function ProfilePage() {
  const { profile, entries, fetchProfile, updateProfile, addEntry, updateEntry, deleteEntry, isLoading, error } = useProfileStore();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleProfileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const updates = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      postalCode: formData.get('postalCode') as string,
      country: formData.get('country') as string,
      linkedinUrl: formData.get('linkedinUrl') as string,
      githubUrl: formData.get('githubUrl') as string,
      portfolioUrl: formData.get('portfolioUrl') as string,
      title: formData.get('title') as string,
      summary: formData.get('summary') as string,
    };
    await updateProfile(updates);
    setIsEditingProfile(false);
  };

  const handleAddEntry = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!profile) return;

    const entryData = {
      entryType: formData.get('entryType') as EntryType,
      title: formData.get('title') as string,
      subtitle: formData.get('subtitle') as string,
      location: formData.get('location') as string,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      isCurrent: formData.get('isCurrent') === 'on',
      description: formData.get('description') as string,
    };

    if (editingEntryId) {
      await updateEntry(editingEntryId, entryData);
      setEditingEntryId(null);
    } else {
      await addEntry({
        profileId: profile.id,
        ...entryData,
        metadata: {},
        sortOrder: entries.length,
        tags: [],
      });
      setIsAddingEntry(false);
    }
  };

  const handleEditEntryClick = (entry: MasterEntry) => {
    setEditingEntryId(entry.id);
    setIsAddingEntry(false);
  };

  const handleCancelEntryForm = () => {
    setIsAddingEntry(false);
    setEditingEntryId(null);
  };

  if (isLoading) return <div className="p-4">Chargement...</div>;
  if (error) return <div className="p-4 text-red-500">Erreur : {error}</div>;

  return (
    <div className="p-4 space-y-8">
      <section>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Profil Maître</h1>
          <button
            onClick={() => setIsEditingProfile(!isEditingProfile)}
            className="text-blue-600 hover:text-blue-800"
          >
            {isEditingProfile ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
          {isEditingProfile ? (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prénom</label>
                  <input name="firstName" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.firstName || ''} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom</label>
                  <input name="lastName" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.lastName || ''} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input name="email" type="email" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.email || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                  <input name="phone" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.phone || ''} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Adresse</label>
                  <input name="address" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.address || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ville</label>
                  <input name="city" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.city || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Code postal</label>
                  <input name="postalCode" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.postalCode || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Pays</label>
                  <input name="country" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.country || 'France'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Titre professionnel</label>
                  <input name="title" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.title || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">LinkedIn URL</label>
                  <input name="linkedinUrl" type="url" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.linkedinUrl || ''} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">GitHub URL</label>
                  <input name="githubUrl" type="url" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.githubUrl || ''} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Portfolio URL</label>
                  <input name="portfolioUrl" type="url" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={profile?.portfolioUrl || ''} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Résumé</label>
                  <textarea name="summary" className="mt-1 block w-full border border-gray-300 rounded-md p-2" rows={3} defaultValue={profile?.summary || ''} />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
                  Enregistrer
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Prénom</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.firstName || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.lastName || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.email || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.phone || '-'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Adresse</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.address || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Ville</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.city || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Code postal</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.postalCode || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Pays</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.country || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Titre professionnel</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.title || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">LinkedIn URL</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.linkedinUrl || '-'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">GitHub URL</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.githubUrl || '-'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Portfolio URL</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent">{profile?.portfolioUrl || '-'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Résumé</label>
                <div className="mt-1 p-2 bg-gray-50 rounded-md border border-transparent whitespace-pre-wrap">{profile?.summary || '-'}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Entrées Maîtres (Expériences, Formations...)</h2>
          {!isAddingEntry && !editingEntryId && (
            <button
              onClick={() => setIsAddingEntry(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition"
            >
              + Ajouter
            </button>
          )}
        </div>

        {(isAddingEntry || editingEntryId) && (
          <form onSubmit={handleAddEntry} className="bg-white p-6 rounded-lg shadow-sm border mb-6 space-y-4">
            <h3 className="font-semibold mb-2">
              {editingEntryId ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
            </h3>
            {(() => {
              const entryToEdit = entries.find(e => e.id === editingEntryId);
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <select name="entryType" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.entryType || 'experience'} required>
                      <option value="experience">Expérience</option>
                      <option value="education">Formation</option>
                      <option value="skill">Compétence</option>
                      <option value="certification">Certification</option>
                      <option value="language">Langue</option>
                      <option value="interest">Intérêt</option>
                      <option value="project">Projet</option>
                      <option value="volunteer">Bénévolat</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Titre</label>
                    <input name="title" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.title || ''} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Sous-titre (ex: Entreprise, École)</label>
                    <input name="subtitle" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.subtitle || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Lieu</label>
                    <input name="location" type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.location || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Date de début</label>
                    <input name="startDate" type="text" placeholder="YYYY-MM" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.startDate || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Date de fin</label>
                    <input name="endDate" type="text" placeholder="YYYY-MM" className="mt-1 block w-full border border-gray-300 rounded-md p-2" defaultValue={entryToEdit?.endDate || ''} />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" name="isCurrent" className="rounded border-gray-300" defaultChecked={entryToEdit?.isCurrent || false} />
                      <span className="text-sm font-medium text-gray-700">En cours</span>
                    </label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea name="description" className="mt-1 block w-full border border-gray-300 rounded-md p-2" rows={3} defaultValue={entryToEdit?.description || ''}></textarea>
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-end mt-4 space-x-3">
              <button type="button" onClick={handleCancelEntryForm} className="px-4 py-2 border rounded hover:bg-gray-50 text-gray-700">
                Annuler
              </button>
              <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700">
                Sauvegarder l'entrée
              </button>
            </div>
          </form>
        )}

        {entries.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-lg border text-center text-gray-500">
            Aucune entrée pour le moment.
          </div>
        ) : (
          <ul className="space-y-4">
            {entries.map(entry => (
              <li key={entry.id} className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center group">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded text-gray-600 uppercase">
                      {entry.entryType}
                    </span>
                    <h3 className="font-semibold text-gray-900">{entry.title}</h3>
                  </div>
                  {entry.subtitle && <p className="text-sm text-gray-600 mt-1">{entry.subtitle} {entry.location ? `- ${entry.location}` : ''}</p>}
                </div>
                <div className="text-gray-400 opacity-0 group-hover:opacity-100 transition flex space-x-3">
                  <button
                    onClick={() => handleEditEntryClick(entry)}
                    className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
