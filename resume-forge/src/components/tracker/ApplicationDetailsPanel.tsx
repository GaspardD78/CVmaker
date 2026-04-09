import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useCvStore } from '@/stores/cvStore';
import { X, ExternalLink, Calendar, Trash2, FileText, MapPin, DollarSign, Users, Briefcase, Pencil, CalendarPlus } from 'lucide-react';
import { CompatibilityScorePanel } from './CompatibilityScorePanel';
import { ApplicationTimeline } from './ApplicationTimeline';
import { ApplicationAttachments } from './ApplicationAttachments';
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { buildGoogleCalendarUrl, openInGoogleCalendar } from '@/lib/googleCalendar';

interface ApplicationDetailsPanelProps {
  applicationId: string | null;
  onClose: () => void;
  onEdit?: () => void;
}

export function ApplicationDetailsPanel({ applicationId, onClose, onEdit }: ApplicationDetailsPanelProps) {
  const { applications, updateApplication, deleteApplication } = useApplicationStore();
  const { cvs, fetchCvs } = useCvStore();

  const application = applications.find(a => a.id === applicationId);

  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const SOURCE_LABELS: Record<string, string> = {
    job_board: 'Job Board',
    spontaneous: 'Candidature spontanée',
    network: 'Réseau',
    recruiter: 'Recruteur',
    linkedin: 'LinkedIn',
    other: 'Autre',
  };

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

  useEffect(() => {
    fetchCvs();
  }, [fetchCvs]);

  useEffect(() => {
    if (application) {
      setNotes(application.notes || '');
      setNextAction(application.nextAction || '');
      setNextActionDate(application.nextActionDate || '');
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
    }
  }, [application]);

  if (!application) return null;

  const linkedCv = application.cvId ? cvs.find(cv => cv.id === application.cvId) : null;

  const handleDelete = async () => {
    let isConfirmed = false;
    try {
      isConfirmed = await tauriConfirm("Voulez-vous vraiment supprimer cette candidature ?", {
        title: "Confirmation de suppression",
        kind: "warning",
      });
    } catch {
      // Fallback to browser confirm if Tauri dialog is unavailable
      isConfirmed = window.confirm("Voulez-vous vraiment supprimer cette candidature ?");
    }

    if (isConfirmed) {
      try {
        await deleteApplication(application.id);
        toast.success("Candidature supprimée");
        onClose();
      } catch (error) {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  const handleSave = async (overrides?: Partial<Parameters<typeof updateApplication>[1]>) => {
    setIsSaving(true);
    try {
      await updateApplication(application.id, {
        notes: notes || null,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate || null,
        location: location || null,
        remotePolicy: remotePolicy || null,
        salaryMin: salaryMin === '' ? null : Number(salaryMin),
        salaryMax: salaryMax === '' ? null : Number(salaryMax),
        sourceDetail: sourceDetail || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        rejectionReason: rejectionReason || null,
        rejectionEmail: rejectionEmail || null,
        ...overrides
      });
      toast.success("Candidature mise à jour");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 border-l border-gray-200 flex flex-col transform transition-transform duration-300">
      <div className="flex justify-between items-center p-4 border-b">
        <div>
          <h2 className="text-xl font-bold">{application.jobTitle}</h2>
          <p className="text-gray-600">{application.companyName}</p>
        </div>
        <div className="flex gap-2">
          {onEdit && (
            <button onClick={onEdit} className="p-2 hover:bg-blue-50 text-blue-500 rounded-full transition-colors" title="Modifier">
              <Pencil size={20} />
            </button>
          )}
          <button onClick={handleDelete} className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors" title="Supprimer">
            <Trash2 size={20} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4">
          {application.jobUrl && (
             <a href={application.jobUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
               <ExternalLink size={18} />
               <span className="text-sm font-medium">Voir l'offre</span>
             </a>
          )}

          {linkedCv && (
             <Link to={`/cv/${linkedCv.id}`} className="flex items-center gap-2 p-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors">
               <FileText size={18} />
               <span className="text-sm font-medium truncate">{linkedCv.name}</span>
             </Link>
          )}
        </div>

        {/* Infos supplémentaires */}
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Briefcase size={16} /> Détails de l'offre
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><MapPin size={12}/> Localisation</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="Ex: Paris" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Télétravail</label>
              <select value={remotePolicy} onChange={(e) => {
                const newValue = e.target.value;
                setRemotePolicy(newValue);
                handleSave({ remotePolicy: newValue });
              }} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none">
                <option value="">Non spécifié</option>
                <option value="full_remote">100% Télétravail</option>
                <option value="hybrid">Hybride</option>
                <option value="onsite">Sur site</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><DollarSign size={12}/> Salaire Min</label>
               <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value ? Number(e.target.value) : '')} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="40000" />
             </div>
             <div>
               <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><DollarSign size={12}/> Salaire Max</label>
               <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value ? Number(e.target.value) : '')} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="50000" />
             </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Détail source ({application.source ? SOURCE_LABELS[application.source] || application.source : 'Non spécifié'})</label>
            <input type="text" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="Détail..." />
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Users size={16} /> Contact
          </h3>

          <div>
             <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
             <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="Nom du contact..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
               <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="email@..." />
             </div>
             <div>
               <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
               <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} onBlur={() => handleSave()} className="w-full px-2 py-1 text-sm border-b border-gray-300 bg-transparent focus:border-blue-500 outline-none" placeholder="06..." />
             </div>
          </div>
        </div>

        {/* Détails du refus */}
        {application.status === 'rejected' && (
          <div className="space-y-4 bg-red-50 p-4 rounded-lg border border-red-100">
            <h3 className="text-sm font-bold text-red-800 mb-3">Détails du refus</h3>

            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">Raison du refus</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                onBlur={() => handleSave()}
                placeholder="Raison du refus..."
                className="w-full h-20 px-3 py-2 text-sm border border-red-200 rounded bg-white focus:ring-1 focus:ring-red-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">Email du refus</label>
              <input
                type="email"
                value={rejectionEmail}
                onChange={(e) => setRejectionEmail(e.target.value)}
                onBlur={() => handleSave()}
                placeholder="email@exemple.com"
                className="w-full px-3 py-2 text-sm border border-red-200 rounded bg-white focus:ring-1 focus:ring-red-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Prochaine action */}
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
          <h3 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
            <Calendar size={16} /> Prochaine action
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Ex: Relancer par email"
              className="w-full px-3 py-2 text-sm border border-orange-200 rounded bg-white"
            />
            <input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-orange-200 rounded bg-white"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
              {nextAction && nextActionDate && (
                <button
                  onClick={async () => {
                    const startDate = new Date(`${nextActionDate}T09:00:00`);
                    const url = buildGoogleCalendarUrl({
                      title: nextAction,
                      startDate,
                      durationMinutes: 30,
                      description: `Candidature : ${application.jobTitle} chez ${application.companyName}`,
                      location: application.location || undefined,
                    });
                    await openInGoogleCalendar(url);
                  }}
                  title="Créer un rappel dans Google Calendar"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded hover:bg-blue-100 border border-blue-200 transition-colors"
                >
                  <CalendarPlus size={14} />
                  Google Calendar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Compatibility score */}
        <CompatibilityScorePanel application={application} />

        {/* Notes */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleSave()}
            placeholder="Notes personnelles..."
            className="w-full h-32 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Pièces jointes */}
        <div className="border-t pt-6">
          <ApplicationAttachments applicationId={application.id} />
        </div>

        {/* Timeline */}
        <div className="border-t pt-6">
          <ApplicationTimeline
            applicationId={application.id}
            applicationContext={{
              companyName: application.companyName,
              jobTitle: application.jobTitle,
              location: application.location,
            }}
          />
        </div>
      </div>
    </div>
  );
}