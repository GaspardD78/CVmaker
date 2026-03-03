import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { ArrowLeft } from 'lucide-react';

export function CVBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCv, fetchCvById, fetchCvBlocks } = useCvStore();
  const { fetchProfile } = useProfileStore();

  useEffect(() => {
    if (id) {
      fetchCvById(id);
      fetchCvBlocks(id);
      fetchProfile();
    }
  }, [id, fetchCvById, fetchCvBlocks, fetchProfile]);

  if (!currentCv) {
    return <div className="p-8 text-center text-gray-500">Chargement du CV...</div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/cv')}
            className="text-gray-500 hover:text-gray-900 transition flex items-center"
          >
            <ArrowLeft className="w-5 h-5 mr-1" /> Retour
          </button>
          <h1 className="text-xl font-semibold text-gray-900 truncate max-w-md">
            CV: {currentCv.name}
          </h1>
        </div>
        <div>
           {/* Export Buttons will go here */}
           <button className="bg-gray-800 text-white px-4 py-2 rounded font-medium hover:bg-gray-700 transition">
             Exporter DOCX
           </button>
        </div>
      </div>

      {/* Main Builder Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Editing */}
        <div className="w-1/3 min-w-[300px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
          <LeftPanel cvId={id!} />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 h-full overflow-auto bg-gray-50 p-8 flex justify-center">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
