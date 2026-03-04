import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useProfileStore } from '@/stores/profileStore';
import { ApplicationStatus, ApplicationSource } from '@/types/application';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ApplicationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApplicationFormModal({ isOpen, onClose }: ApplicationFormModalProps) {
  const { createApplication } = useApplicationStore();
  const { profile, fetchProfile } = useProfileStore();

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [source, setSource] = useState<ApplicationSource>('job_board');
  const [status, setStatus] = useState<ApplicationStatus>('draft');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) {
      alert("Veuillez d'abord configurer votre profil !");
      return;
    }

    await createApplication({
      profileId: profile.id,
      cvId: null, // Will connect later
      companyName,
      jobTitle,
      jobUrl: jobUrl || null,
      source,
      sourceDetail: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      status,
      salaryMin: null,
      salaryMax: null,
      location: null,
      remotePolicy: null,
      priority,
      notes: null,
      appliedAt: status !== 'draft' ? new Date().toISOString() : null,
      nextAction: nextAction || null,
      nextActionDate: nextActionDate || null,
    });

    onClose();
    resetForm();
  };

  const resetForm = () => {
    setCompanyName('');
    setJobTitle('');
    setJobUrl('');
    setSource('job_board');
    setStatus('draft');
    setPriority(2);
    setNextAction('');
    setNextActionDate('');
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
        resetForm();
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-full max-w-md p-6 z-50 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <Dialog.Title className="text-lg font-bold">Nouvelle candidature</Dialog.Title>
            <Dialog.Close className="text-gray-500 hover:bg-gray-100 p-1 rounded-full">
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise *</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Ex: Acme Corp"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poste visé *</label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Ex: Développeur React"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL de l'offre</label>
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="draft">Brouillon</option>
                  <option value="applied">Postulé</option>
                  <option value="phone_screen">Pré-qual. tél.</option>
                  <option value="interview">Entretien</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value={1}>Haute</option>
                  <option value={2}>Moyenne</option>
                  <option value={3}>Basse</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t">
              <Dialog.Close className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">
                Annuler
              </Dialog.Close>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md"
              >
                Ajouter
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}