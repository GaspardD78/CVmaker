import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { X, ExternalLink, Calendar } from 'lucide-react';
import { ApplicationTimeline } from './ApplicationTimeline';

interface ApplicationDetailsPanelProps {
  applicationId: string | null;
  onClose: () => void;
}

export function ApplicationDetailsPanel({ applicationId, onClose }: ApplicationDetailsPanelProps) {
  const { applications, updateApplication } = useApplicationStore();

  const application = applications.find(a => a.id === applicationId);

  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (application) {
      setNotes(application.notes || '');
      setNextAction(application.nextAction || '');
      setNextActionDate(application.nextActionDate || '');
    }
  }, [application]);

  if (!application) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await updateApplication(application.id, {
      notes: notes || null,
      nextAction: nextAction || null,
      nextActionDate: nextActionDate || null,
    });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-40 border-l border-gray-200 flex flex-col transform transition-transform duration-300">
      <div className="flex justify-between items-center p-4 border-b">
        <div>
          <h2 className="text-xl font-bold">{application.jobTitle}</h2>
          <p className="text-gray-600">{application.companyName}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
          <X size={20} />
        </button>
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
          {/* Add more info badges here if location, salary etc are provided */}
        </div>

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
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Enregistrement...' : 'Mettre à jour'}
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSave}
            placeholder="Notes personnelles..."
            className="w-full h-32 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Timeline */}
        <div className="border-t pt-6">
          <ApplicationTimeline applicationId={application.id} />
        </div>
      </div>
    </div>
  );
}