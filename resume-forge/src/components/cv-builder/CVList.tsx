import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { Plus, Copy, Trash2, Edit, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { confirm } from '@tauri-apps/plugin-dialog';
import { exportToDocx } from '@/lib/export-docx';
import { getTemplate } from '@/templates';
import { getDb } from '@/lib/db';
import { keysToCamelCase } from '@/lib/mapping';
import { CVBlock } from '@/types/cv';
import { CVDocument } from '@/types/cv';

export function CVList() {
  const { cvs, fetchCvs, createCv, deleteCv, duplicateCv, isLoading } = useCvStore();
  const { profile, entries, fetchProfile } = useProfileStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newCvName, setNewCvName] = useState('');

  useEffect(() => {
    fetchCvs();
    fetchProfile();
  }, [fetchCvs, fetchProfile]);

  const handleCreate = async () => {
    if (!newCvName.trim() || !profile) return;
    setIsCreating(true);
    try {
      await createCv({
        profileId: profile.id,
        name: newCvName,
        templateId: 'ats-classic',
        targetJob: null,
        targetCompany: null,
        customSummary: null,
        settings: {},
        isFavorite: false,
        lastExported: null,
      });
      setNewCvName('');
      toast.success("CV créé avec succès");
    } catch (err) {
      toast.error("Erreur lors de la création du CV");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const isConfirmed = await confirm(`Êtes-vous sûr de vouloir supprimer le CV "${name}" ?`, {
      title: 'Confirmer la suppression',
      kind: 'warning',
    });
    if (isConfirmed) {
      try {
        await deleteCv(id);
        toast.success("CV supprimé");
      } catch (err) {
        toast.error("Erreur lors de la suppression du CV");
      }
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateCv(id);
      toast.success("CV dupliqué avec succès");
    } catch (err) {
      toast.error("Erreur lors de la duplication du CV");
    }
  };

  const loadBlocksForCv = async (cvId: string): Promise<CVBlock[]> => {
    const db = await getDb();
    const rawBlocks = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM cv_blocks WHERE cv_id = ?1 ORDER BY sort_order ASC',
      [cvId]
    );
    return rawBlocks.map(b => keysToCamelCase<CVBlock>(b));
  };

  const handleQuickExportDocx = async (cv: CVDocument) => {
    if (!profile) return;
    try {
      const blocks = await loadBlocksForCv(cv.id);
      const template = getTemplate(cv.templateId);
      const success = await exportToDocx(cv, profile, blocks, entries, template);
      if (success) toast.success(`DOCX exporté : ${cv.name}`);
    } catch (err) {
      toast.error(`Erreur export DOCX: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    }
  };

  const handleQuickExportPdf = async (cv: CVDocument) => {
    if (!profile) return;
    toast.info("Ouverture du CV pour export PDF...");
    // Navigate to the builder which renders PrintableCV, then trigger export
    // Since PDF relies on #printable-cv being in the DOM, we redirect to the builder
    window.location.hash = `/cv/${cv.id}?exportPdf=1`;
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mes CVs</h1>
          <p className="text-gray-500 mt-2">Gérez et créez vos CV ciblés</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-8 flex items-center gap-4">
        <input
          type="text"
          placeholder="Nom du nouveau CV (ex: Développeur React)..."
          className="flex-1 p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
          value={newCvName}
          onChange={(e) => setNewCvName(e.target.value)}
        />
        <button
          onClick={handleCreate}
          disabled={isCreating || !newCvName.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium flex items-center disabled:opacity-50"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nouveau CV
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Chargement de vos CVs...</div>
      ) : cvs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-500">Vous n'avez pas encore créé de CV.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cvs.map(cv => (
            <div key={cv.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition">
              <div className="p-5">
                <h3 className="font-semibold text-lg text-gray-900 truncate mb-1" title={cv.name}>
                  {cv.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Dernière modif : {new Date(cv.updatedAt).toLocaleDateString('fr-FR')}
                </p>
                <div className="flex justify-between items-center mt-4">
                  <Link
                    to={`/cv/${cv.id}`}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                  >
                    <Edit className="w-4 h-4 mr-1" /> Éditer
                  </Link>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleQuickExportDocx(cv)}
                      className="text-gray-500 hover:text-blue-600 p-1"
                      title="Exporter DOCX"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleQuickExportPdf(cv)}
                      className="text-gray-500 hover:text-green-600 p-1"
                      title="Exporter PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(cv.id)}
                      className="text-gray-500 hover:text-blue-600 p-1"
                      title="Dupliquer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cv.id, cv.name)}
                      className="text-gray-500 hover:text-red-600 p-1"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
