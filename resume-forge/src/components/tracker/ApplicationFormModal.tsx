import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { Application, ApplicationStatus, ApplicationSource } from '@/types/application';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ApplicationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  application?: Application;
}

export function ApplicationFormModal({ isOpen, onClose, application }: ApplicationFormModalProps) {
  const { createApplication, updateApplication } = useApplicationStore();
  const { profile, fetchProfile } = useProfileStore();
  const { cvs, fetchCvs } = useCvStore();

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [source, setSource] = useState<ApplicationSource>('job_board');
  const [status, setStatus] = useState<ApplicationStatus>('draft');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  const [cvId, setCvId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [remotePolicy, setRemotePolicy] = useState('');
  const [salaryMin, setSalaryMin] = useState<number | ''>('');
  const [salaryMax, setSalaryMax] = useState<number | ''>('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionEmail, setRejectionEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchCvs();
  }, [fetchProfile, fetchCvs]);

  useEffect(() => {
    if (isOpen) {
      if (application) {
        setCompanyName(application.companyName);
        setJobTitle(application.jobTitle);
        setJobUrl(application.jobUrl || '');
        setSource(application.source || 'job_board');
        setStatus(application.status);
        setPriority(application.priority);
        setNextAction(application.nextAction || '');
        setNextActionDate(application.nextActionDate || '');
        setCvId(application.cvId || null);
        setLocation(application.location || '');
        setRemotePolicy(application.remotePolicy || '');
        setSalaryMin(application.salaryMin ?? '');
        setSalaryMax(application.salaryMax ?? '');
        setSourceDetail(application.sourceDetail || '');
        setContactName(application.contactName || '');
        setContactEmail(application.contactEmail || '');
        setContactPhone(application.contactPhone || '');
        setRejectionReason(application.rejectionReason || '');
        setRejectionEmail(application.rejectionEmail || '');
      } else {
        resetForm();
      }
    }
  }, [isOpen, application]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) {
      toast.error("Veuillez d'abord configurer votre profil !");
      return;
    }

    const fields = {
      cvId: cvId || null,
      companyName,
      jobTitle,
      jobUrl: jobUrl || null,
      source,
      sourceDetail: sourceDetail || null,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      status,
      salaryMin: salaryMin === '' ? null : Number(salaryMin),
      salaryMax: salaryMax === '' ? null : Number(salaryMax),
      location: location || null,
      remotePolicy: remotePolicy || null,
      priority,
      nextAction: nextAction || null,
      nextActionDate: nextActionDate || null,
      rejectionReason: rejectionReason || null,
      rejectionEmail: rejectionEmail || null,
    };

    setIsSubmitting(true);
    try {
      if (application) {
        await updateApplication(application.id, fields);
        toast.success("Candidature mise à jour");
      } else {
        await createApplication({
          profileId: profile.id,
          notes: null,
          jobDescription: null,
          appliedAt: status !== 'draft' ? new Date().toISOString() : null,
          ...fields,
        });
        toast.success("Candidature ajoutée avec succès");
      }
      onClose();
      resetForm();
    } catch (error) {
      toast.error(application ? "Erreur lors de la mise à jour" : "Erreur lors de l'ajout de la candidature");
    } finally {
      setIsSubmitting(false);
    }
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
    setCvId(null);
    setLocation('');
    setRemotePolicy('');
    setSalaryMin('');
    setSalaryMax('');
    setSourceDetail('');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setRejectionReason('');
    setRejectionEmail('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
        resetForm();
      }
    }}>
      <DialogContent className="w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-lg font-bold">{application ? 'Modifier la candidature' : 'Nouvelle candidature'}</DialogTitle>
          <DialogDescription className="sr-only">
            {application ? 'Formulaire pour modifier une candidature' : 'Formulaire pour créer une nouvelle candidature'}
          </DialogDescription>

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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CV utilisé</label>
              <select
                value={cvId || ''}
                onChange={(e) => setCvId(e.target.value || null)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">-- Aucun CV sélectionné --</option>
                {cvs.map(cv => (
                  <option key={cv.id} value={cv.id}>{cv.name}</option>
                ))}
              </select>
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
                  <option value="acknowledged">Accusé réception</option>
                  <option value="phone_screen">Pré-qual. tél.</option>
                  <option value="technical_test">Test technique</option>
                  <option value="interview">Entretien</option>
                  <option value="offer">Offre reçue</option>
                  <option value="accepted">Accepté</option>
                  <option value="rejected">Refusé</option>
                  <option value="withdrawn">Retiré</option>
                  <option value="ghosted">Sans réponse</option>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as ApplicationSource)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="job_board">Job Board</option>
                  <option value="spontaneous">Candidature spontanée</option>
                  <option value="network">Réseau</option>
                  <option value="recruiter">Recruteur</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="other">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Détail source</label>
                <input
                  type="text"
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Ex: Indeed, Recommandation"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Localisation</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Ex: Paris"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Politique Télétravail</label>
                <select
                  value={remotePolicy}
                  onChange={(e) => setRemotePolicy(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Non spécifié</option>
                  <option value="full_remote">100% Télétravail</option>
                  <option value="hybrid">Hybride</option>
                  <option value="onsite">Sur site</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salaire Min (€)</label>
                <input
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Ex: 40000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salaire Max (€)</label>
                <input
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Ex: 50000"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm text-gray-900">Contact</h4>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du contact</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Nom du recruteur..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="email@..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="06..."
                  />
                </div>
              </div>
            </div>

            {status === 'rejected' && (
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-sm text-gray-900">Détails du refus</h4>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Raison du refus</label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 h-24 resize-none"
                    placeholder="Ex: Profil ne correspondant pas, poste pourvue..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email du refus</label>
                  <input
                    type="email"
                    value={rejectionEmail}
                    onChange={(e) => setRejectionEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="email@exemple.com"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t">
              <DialogClose className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">
                Annuler
              </DialogClose>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Enregistrement...' : (application ? 'Modifier' : 'Ajouter')}
              </button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}