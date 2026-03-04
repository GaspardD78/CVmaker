import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { exportToDocx } from '@/lib/export-docx';
import { printPDF } from '@/lib/export-pdf';
import { getTemplate } from '@/templates';

export function CVBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCv, currentCvBlocks, fetchCvById, fetchCvBlocks, updateCv } = useCvStore();
  const { profile, entries, fetchProfile } = useProfileStore();
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCvById(id);
      fetchCvBlocks(id);
      fetchProfile();
    }
  }, [id, fetchCvById, fetchCvBlocks, fetchProfile]);

  const handleExportDocx = async () => {
    if (!currentCv || !profile) return;
    setIsExporting(true);
    try {
      const template = getTemplate(currentCv.templateId);
      const success = await exportToDocx(currentCv, profile, currentCvBlocks, entries, template);
      if (success) {
        // TODO: Replace with proper toast
      }
    } catch (error) {
      // TODO: Replace with proper toast
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    printPDF();
  };

  const handleTemplateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!currentCv) return;
    await updateCv(currentCv.id, { templateId: e.target.value });
  };

  if (!currentCv || !profile) {
    return <div className="p-8 text-center text-gray-500">Chargement du CV...</div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm print:hidden">
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
        <div className="flex items-center space-x-3">
           <select
             value={currentCv.templateId}
             onChange={handleTemplateChange}
             className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 block p-2"
           >
             <option value="ats-classic">ATS Classique</option>
             <option value="ats-modern">ATS Moderne</option>
           </select>
           <button
             onClick={handleExportDocx}
             disabled={isExporting}
             className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 transition flex items-center shadow-sm disabled:opacity-50"
           >
             <FileText className="w-4 h-4 mr-2" />
             {isExporting ? 'Export...' : 'Exporter DOCX'}
           </button>
           <button
             onClick={handleExportPdf}
             className="bg-gray-800 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-700 transition flex items-center shadow-sm"
           >
             <Download className="w-4 h-4 mr-2" />
             Exporter PDF
           </button>
        </div>
      </div>

      {/* Main Builder Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Editing */}
        <div className="w-1/3 min-w-[300px] max-w-[450px] bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden print:hidden">
          <LeftPanel cvId={id!} />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 h-full overflow-auto bg-gray-50 p-8 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          <div className="print:w-full print:max-w-none print:shadow-none print:m-0 print:border-none">
            <RightPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
