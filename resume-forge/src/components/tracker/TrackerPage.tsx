import { useEffect } from 'react';
import { useState } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { KanbanBoard } from './KanbanBoard';
import { ApplicationFormModal } from './ApplicationFormModal';

export function TrackerPage() {
  const { fetchApplications, isLoading, error } = useApplicationStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

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
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={() => setIsModalOpen(true)}
        >
          Nouvelle candidature
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-6 bg-gray-50">
        <KanbanBoard />
      </div>

      <ApplicationFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}