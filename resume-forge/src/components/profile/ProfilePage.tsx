import { useEffect, useState, FormEvent } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { EntryType, MasterEntry } from '@/types/profile';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirm } from '@tauri-apps/plugin-dialog';
import { PhotoCropModal } from './PhotoCropModal';
import { AiEnrichModal } from './AiEnrichModal';

function EntryFormFields({ entryToEdit, defaultTab, availableTypes }: any) {
  const [selectedType, setSelectedType] = useState(entryToEdit?.entryType || (defaultTab !== 'all' ? defaultTab : 'experience'));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label>Type</Label>
        <select
          name="entryType"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          required
        >
          {availableTypes.map((t: any) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {selectedType === 'skill' ? (
        <>
          <div>
            <Label>Nom de la compétence *</Label>
            <Input name="title" type="text" className="mt-1" defaultValue={entryToEdit?.title || ''} required />
          </div>
          <div>
            <Label>Niveau (Optionnel)</Label>
            <Input name="subtitle" type="text" className="mt-1" defaultValue={entryToEdit?.subtitle || ''} />
          </div>
          <div className="col-span-2">
            <Label>Description / Détails (Optionnel)</Label>
            <textarea name="description" className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm" rows={2} defaultValue={entryToEdit?.description || ''}></textarea>
            <p className="text-xs text-gray-500 mt-1">Astuce : <code className="bg-gray-100 px-1 rounded">- texte</code> liste · <code className="bg-gray-100 px-1 rounded">**texte**</code> gras · <code className="bg-gray-100 px-1 rounded">*texte*</code> italique</p>
          </div>
          {/* Hidden fields to satisfy the form data structure */}
          <input type="hidden" name="location" value="" />
          <input type="hidden" name="startDate" value="" />
          <input type="hidden" name="endDate" value="" />
        </>
      ) : selectedType === 'education' ? (
        <>
          <div>
            <Label>Diplôme *</Label>
            <Input name="title" type="text" className="mt-1" defaultValue={entryToEdit?.title || ''} required />
          </div>
          <div>
            <Label>École / Établissement</Label>
            <Input name="subtitle" type="text" className="mt-1" defaultValue={entryToEdit?.subtitle || ''} />
          </div>
          <div>
            <Label>Ville</Label>
            <Input name="location" type="text" className="mt-1" defaultValue={entryToEdit?.location || ''} />
          </div>
          <div>
             {/* Filler to keep grid layout clean */}
          </div>
          <div>
            <Label>Date de début</Label>
            <Input name="startDate" type="text" placeholder="YYYY-MM" className="mt-1" defaultValue={entryToEdit?.startDate || ''} />
          </div>
          <div>
            <Label>Date de fin</Label>
            <Input name="endDate" type="text" placeholder="YYYY-MM" className="mt-1" defaultValue={entryToEdit?.endDate || ''} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center space-x-2">
              <input type="checkbox" name="isCurrent" className="rounded border-gray-300" defaultChecked={entryToEdit?.isCurrent || false} />
              <span className="text-sm font-medium text-gray-700">En cours</span>
            </label>
          </div>
          <div className="col-span-2">
            <Label>Mention / Description</Label>
            <textarea name="description" className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} defaultValue={entryToEdit?.description || ''}></textarea>
            <p className="text-xs text-gray-500 mt-1">Astuce : <code className="bg-gray-100 px-1 rounded">- texte</code> liste · <code className="bg-gray-100 px-1 rounded">**texte**</code> gras · <code className="bg-gray-100 px-1 rounded">*texte*</code> italique</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <Label>Poste / Titre *</Label>
            <Input name="title" type="text" className="mt-1" defaultValue={entryToEdit?.title || ''} required />
          </div>
          <div>
            <Label>Entreprise / Organisation</Label>
            <Input name="subtitle" type="text" className="mt-1" defaultValue={entryToEdit?.subtitle || ''} />
          </div>
          <div>
            <Label>Lieu</Label>
            <Input name="location" type="text" className="mt-1" defaultValue={entryToEdit?.location || ''} />
          </div>
          <div>
             {/* Filler */}
          </div>
          <div>
            <Label>Date de début</Label>
            <Input name="startDate" type="text" placeholder="YYYY-MM" className="mt-1" defaultValue={entryToEdit?.startDate || ''} />
          </div>
          <div>
            <Label>Date de fin</Label>
            <Input name="endDate" type="text" placeholder="YYYY-MM" className="mt-1" defaultValue={entryToEdit?.endDate || ''} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center space-x-2">
              <input type="checkbox" name="isCurrent" className="rounded border-gray-300" defaultChecked={entryToEdit?.isCurrent || false} />
              <span className="text-sm font-medium text-gray-700">En cours</span>
            </label>
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <textarea name="description" className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} defaultValue={entryToEdit?.description || ''}></textarea>
            <p className="text-xs text-gray-500 mt-1">Astuce : <code className="bg-gray-100 px-1 rounded">- texte</code> liste · <code className="bg-gray-100 px-1 rounded">**texte**</code> gras · <code className="bg-gray-100 px-1 rounded">*texte*</code> italique</p>
          </div>
        </>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { profile, entries, fetchProfile, updateProfile, addEntry, updateEntry, deleteEntry, isLoading, error } = useProfileStore();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected after cancel
    e.target.value = '';
    const objectUrl = URL.createObjectURL(file);
    setCropImageSrc(objectUrl);
  };

  const handleCropConfirm = async (base64: string) => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    try {
      await updateProfile({ photoPath: base64 });
      toast.success('Photo de profil mise à jour');
    } catch {
      toast.error("Erreur lors de l'enregistrement de la photo");
    }
  };

  const handleCropCancel = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  };

  const handleRemovePhoto = async () => {
    try {
      await updateProfile({ photoPath: null });
      toast.success('Photo supprimée');
    } catch {
      toast.error('Erreur lors de la suppression de la photo');
    }
  };
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EntryType | 'all'>('all');

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleProfileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const updates: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        updates[key] = value;
      }
    }
    // If the form doesn't contain a specific field, it just won't be in updates.
    // We only update/insert fields actually present in the form.

    // Ensure NOT NULL constraints for SQLite when creating the profile initially
    if (!profile) {
      if (!updates.firstName || updates.firstName.trim() === '') updates.firstName = 'Prénom par défaut';
      if (!updates.lastName || updates.lastName.trim() === '') updates.lastName = 'Nom par défaut';
    }

    try {
      await updateProfile(updates);
      setIsEditingProfile(false);
      toast.success(profile ? "Profil mis à jour avec succès" : "Profil créé avec succès");
    } catch (err) {
      const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : 'Erreur inconnue');
      toast.error(`Erreur : ${errorMessage}`);
      console.error(err);
    }
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

    try {
      if (editingEntryId) {
        await updateEntry(editingEntryId, entryData);
        setEditingEntryId(null);
        toast.success("Entrée modifiée avec succès");
      } else {
        await addEntry({
          profileId: profile.id,
          ...entryData,
          metadata: {},
          sortOrder: entries.length,
          tags: [],
        });
        setIsAddingEntry(false);
        toast.success("Nouvelle entrée ajoutée");
      }
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde de l'entrée");
    }
  };

  const handleEditEntryClick = (entry: MasterEntry) => {
    setEditingEntryId(entry.id);
    setIsAddingEntry(false);
  };

  const handleDeleteEntry = async (id: string) => {
    const isConfirmed = await confirm("Êtes-vous sûr de vouloir supprimer cette entrée ? Elle sera retirée de tous vos CV.", {
      title: 'Confirmer la suppression',
      kind: 'warning',
    });

    if (isConfirmed) {
      try {
        await deleteEntry(id);
        toast.success("Entrée supprimée");
      } catch (err) {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  const handleCancelEntryForm = () => {
    setIsAddingEntry(false);
    setEditingEntryId(null);
  };

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  if (isLoading) return <div className="p-4">Chargement...</div>;

  const availableTypes: { value: EntryType; label: string }[] = [
    { value: 'experience', label: 'Expériences' },
    { value: 'education', label: 'Formations' },
    { value: 'skill', label: 'Compétences' },
    { value: 'certification', label: 'Certifications' },
    { value: 'language', label: 'Langues' },
    { value: 'project', label: 'Projets' },
    { value: 'interest', label: 'Intérêts' },
    { value: 'volunteer', label: 'Bénévolat' },
  ];

  const filteredEntries = activeTab === 'all'
    ? entries
    : entries.filter((e) => e.entryType === activeTab);

  if (!profile && !isEditingProfile) {
    // Si aucun profil, forcer la création (et cacher les entrées)
    return (
      <div className="p-4 space-y-8 max-w-4xl mx-auto">
        <section>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Créer votre Profil Maître</h1>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prénom *</Label>
                  <Input name="firstName" type="text" className="mt-1" required />
                </div>
                <div>
                  <Label>Nom *</Label>
                  <Input name="lastName" type="text" className="mt-1" required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="email" type="email" className="mt-1" />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input name="phone" type="text" className="mt-1" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">
                  Créer le profil
                </Button>
              </div>
            </form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-8 max-w-5xl mx-auto">
      <section>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Profil Maître</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEnrichModalOpen(true)}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
            >
              ✨ Enrichir avec l'IA
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="text-blue-600 hover:text-blue-800"
            >
              {isEditingProfile ? 'Annuler' : 'Modifier'}
            </Button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
          {isEditingProfile ? (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prénom</Label>
                  <Input name="firstName" type="text" className="mt-1" defaultValue={profile?.firstName || ''} required />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input name="lastName" type="text" className="mt-1" defaultValue={profile?.lastName || ''} required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input name="email" type="email" className="mt-1" defaultValue={profile?.email || ''} />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input name="phone" type="text" className="mt-1" defaultValue={profile?.phone || ''} />
                </div>
                <div className="col-span-2">
                  <Label>Adresse</Label>
                  <Input name="address" type="text" className="mt-1" defaultValue={profile?.address || ''} />
                </div>
                <div>
                  <Label>Ville</Label>
                  <Input name="city" type="text" className="mt-1" defaultValue={profile?.city || ''} />
                </div>
                <div>
                  <Label>Code postal</Label>
                  <Input name="postalCode" type="text" className="mt-1" defaultValue={profile?.postalCode || ''} />
                </div>
                <div>
                  <Label>Pays</Label>
                  <Input name="country" type="text" className="mt-1" defaultValue={profile?.country || 'France'} />
                </div>
                <div>
                  <Label>Titre professionnel</Label>
                  <Input name="title" type="text" className="mt-1" defaultValue={profile?.title || ''} />
                </div>
                <div>
                  <Label>LinkedIn URL</Label>
                  <Input name="linkedinUrl" type="url" className="mt-1" defaultValue={profile?.linkedinUrl || ''} />
                </div>
                <div>
                  <Label>GitHub URL</Label>
                  <Input name="githubUrl" type="url" className="mt-1" defaultValue={profile?.githubUrl || ''} />
                </div>
                <div className="col-span-2">
                  <Label>Portfolio URL</Label>
                  <Input name="portfolioUrl" type="url" className="mt-1" defaultValue={profile?.portfolioUrl || ''} />
                </div>
                <div className="col-span-2">
                  <Label>Résumé</Label>
                  <textarea name="summary" className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} defaultValue={profile?.summary || ''} />
                </div>
                <div className="col-span-2">
                  <Label>Photo de profil</Label>
                  {profile?.photoPath && (
                    <div className="mt-2 mb-3 flex items-center gap-3">
                      <img src={profile.photoPath} alt="Photo actuelle" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-xs text-red-600 hover:text-red-800 underline"
                      >
                        Supprimer la photo
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                  <p className="text-xs text-gray-400 mt-1">Formats acceptés : JPG, PNG, WebP. Taille recommandée : 200×200 px.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">
                  Enregistrer
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {profile?.photoPath && (
                <div className="col-span-2 flex items-center gap-4 pb-2 border-b border-gray-100">
                  <img src={profile.photoPath} alt="Photo de profil" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Photo de profil</p>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-xs text-red-500 hover:text-red-700 underline mt-1"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
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
            <Button
              onClick={() => setIsAddingEntry(true)}
            >
              + Ajouter
            </Button>
          )}
        </div>

        <div className="flex space-x-2 overflow-x-auto pb-2 mb-4 border-b">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-100 text-blue-800 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Tout
          </button>
          {availableTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => setActiveTab(type.value)}
              className={`px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === type.value
                  ? 'bg-blue-100 text-blue-800 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {(isAddingEntry || editingEntryId) && (
          <form onSubmit={handleAddEntry} className="bg-white p-6 rounded-lg shadow-sm border mb-6 space-y-4">
            <h3 className="font-semibold mb-2">
              {editingEntryId ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
            </h3>
            {(() => {
              const entryToEdit = entries.find(e => e.id === editingEntryId);
              // Use a local state for the form's entry type so fields update immediately when changing the select
              return <EntryFormFields key={entryToEdit?.id ?? 'new'} entryToEdit={entryToEdit} defaultTab={activeTab} availableTypes={availableTypes} />;
            })()}
            <div className="flex justify-end mt-4 space-x-3">
              <Button type="button" variant="outline" onClick={handleCancelEntryForm}>
                Annuler
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">
                Sauvegarder l'entrée
              </Button>
            </div>
          </form>
        )}

        {filteredEntries.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-lg border text-center text-gray-500">
            Aucune entrée pour cette catégorie pour le moment.
          </div>
        ) : (
          <ul className="space-y-4">
            {filteredEntries.map(entry => (
              <li key={entry.id} className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center group">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded text-gray-600 uppercase">
                      {availableTypes.find(t => t.value === entry.entryType)?.label || entry.entryType}
                    </span>
                    <h3 className="font-semibold text-gray-900">{entry.title}</h3>
                  </div>
                  {(entry.subtitle || entry.location) && (
                    <p className="text-sm text-gray-600 mt-1">
                      {entry.subtitle} {entry.location ? `— ${entry.location}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-gray-400 opacity-0 group-hover:opacity-100 transition flex space-x-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditEntryClick(entry)}
                    className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cropImageSrc && (
        <PhotoCropModal
          imageSrc={cropImageSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {isEnrichModalOpen && (
        <AiEnrichModal onClose={() => setIsEnrichModalOpen(false)} />
      )}
    </div>
  );
}
