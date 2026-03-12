import { useEffect, useState } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { KanbanBoard } from './KanbanBoard';
import { ApplicationFormModal } from './ApplicationFormModal';
import { ApplicationDetailsPanel } from './ApplicationDetailsPanel';
import { ExportApplicationsModal } from './ExportApplicationsModal';
import { Search, Filter, Download } from 'lucide-react';
import { Application, ApplicationSource } from '@/types/application';

export function TrackerPage() {
  const { applications, fetchApplications, isLoading, error } = useApplicationStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<ApplicationSource | 'all'>('all');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Keep selectedApplication in sync with the store when it changes (e.g. after edit)
  useEffect(() => {
    if (selectedApplication) {
      const fresh = applications.find(a => a.id === selectedApplication.id);
      if (!fresh) setSelectedApplication(null); // deleted
      else if (fresh !== selectedApplication) setSelectedApplication(fresh);
    }
  }, [applications]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-gray-500">Chargement des candidatures...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-md m-4">
        <p>Erreur: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 pb-2 border-b flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Suivi des candidatures</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gérez vos candidatures et leur avancement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            onClick={() => setIsExportOpen(true)}
            title="Exporter les candidatures"
          >
            <Download size={15} />
            Exporter
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            onClick={() => setIsModalOpen(true)}
          >
            Nouvelle candidature
          </button>
        </div>
      </div>

      <div className="bg-white border-b px-6 py-3 flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par entreprise, poste..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <div className="relative flex items-center gap-2">
          <Filter className="text-gray-400" size={18} />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as ApplicationSource | 'all')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes les sources</option>
            <option value="job_board">Job Board</option>
            <option value="spontaneous">Candidature spontanée</option>
            <option value="network">Réseau</option>
            <option value="recruiter">Recruteur / Chasseur</option>
            <option value="linkedin">LinkedIn</option>
            <option value="other">Autre</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6 bg-gray-50">
        <KanbanBoard
          searchTerm={searchTerm}
          sourceFilter={sourceFilter}
          onCardClick={(app) => setSelectedApplication(app)}
        />
      </div>

      {/* Details panel rendered at TrackerPage level to avoid overflow clipping */}
      {selectedApplication && (
        <ApplicationDetailsPanel
          applicationId={selectedApplication.id}
          onClose={() => {
            setSelectedApplication(null);
            setEditingApplication(null);
          }}
          onEdit={() => {
            setEditingApplication(selectedApplication);
          }}
        />
      )}

      <ExportApplicationsModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      {/* New application modal */}
      <ApplicationFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Edit application modal */}
      <ApplicationFormModal
        isOpen={editingApplication !== null}
        onClose={() => setEditingApplication(null)}
        application={editingApplication ?? undefined}
      />
    </div>
  );
}