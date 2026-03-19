import { useEffect, useState } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { AttachmentLabel } from '@/types/application';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { open as openInShell } from '@tauri-apps/plugin-shell';
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';
import { Paperclip, Plus, ExternalLink, Trash2, FileText, FileImage, FileArchive, File } from 'lucide-react';
import { toast } from 'sonner';

interface ApplicationAttachmentsProps {
  applicationId: string;
}

const LABEL_OPTIONS: { value: AttachmentLabel; label: string }[] = [
  { value: 'cv', label: 'CV' },
  { value: 'cover_letter', label: 'Lettre de motivation' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'certificate', label: 'Certificat / Diplôme' },
  { value: 'other', label: 'Autre' },
];

const LABEL_COLORS: Record<AttachmentLabel, string> = {
  cv: 'bg-blue-100 text-blue-700',
  cover_letter: 'bg-purple-100 text-purple-700',
  portfolio: 'bg-green-100 text-green-700',
  certificate: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
};

const LABEL_LABELS: Record<AttachmentLabel, string> = {
  cv: 'CV',
  cover_letter: 'LM',
  portfolio: 'Portfolio',
  certificate: 'Certificat',
  other: 'Autre',
};

function getFileIcon(fileType: string | null) {
  if (!fileType) return <File size={16} />;
  if (fileType.startsWith('image/')) return <FileImage size={16} />;
  if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('7z')) return <FileArchive size={16} />;
  return <FileText size={16} />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function ApplicationAttachments({ applicationId }: ApplicationAttachmentsProps) {
  const { attachments, fetchAttachments, addAttachment, deleteAttachment } = useApplicationStore();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    fetchAttachments(applicationId).catch((err) => {
      const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err));
      setLoadError(msg);
    });
  }, [applicationId, fetchAttachments]);

  const handleAddFile = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        title: 'Sélectionner un document',
        filters: [
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: 'Tous les fichiers', extensions: ['*'] },
        ],
      });

      if (!selected) return;

      const filePath = selected as string;
      const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        odt: 'application/vnd.oasis.opendocument.text',
        txt: 'text/plain',
        rtf: 'application/rtf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
      };

      await addAttachment({
        applicationId,
        fileName,
        filePath,
        fileType: MIME_MAP[ext] ?? null,
        fileSize: null,
        label: 'other',
      });

      toast.success(`"${fileName}" ajouté`);
    } catch (err) {
      if (err !== null && err !== undefined) {
        toast.error("Impossible d'ajouter le fichier");
      }
    }
  };

  const handleOpen = async (filePath: string, fileName: string) => {
    try {
      await openInShell(filePath);
    } catch {
      toast.error(`Impossible d'ouvrir "${fileName}"`);
    }
  };

  const handleDelete = async (id: string, fileName: string) => {
    let confirmed = false;
    try {
      confirmed = await tauriConfirm(`Retirer "${fileName}" de cette candidature ?`, {
        title: 'Confirmation',
        kind: 'warning',
      });
    } catch {
      confirmed = window.confirm(`Retirer "${fileName}" de cette candidature ?`);
    }
    if (confirmed) {
      await deleteAttachment(id);
      toast.success('Document retiré');
    }
  };

  const handleLabelChange = async (id: string, newLabel: AttachmentLabel) => {
    try {
      const db = await import('@/lib/db').then(m => m.getDb());
      await db.execute(
        'UPDATE application_attachments SET label = ?1 WHERE id = ?2',
        [newLabel, id]
      );
      await fetchAttachments(applicationId);
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  useEffect(() => {
    if (loadError) toast.error(`Pièces jointes : ${loadError}`);
  }, [loadError]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Paperclip size={16} /> Documents joints
        </h3>
        <button
          onClick={handleAddFile}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {attachments.length === 0 ? (
        <button
          onClick={handleAddFile}
          className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
        >
          <Paperclip size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Cliquer pour ajouter un document</p>
          <p className="text-xs mt-1">PDF, Word, image…</p>
        </button>
      ) : (
        <ul className="space-y-2">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 group"
            >
              <span className="text-gray-400 shrink-0">
                {getFileIcon(att.fileType)}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate" title={att.filePath}>
                  {att.fileName}
                </p>
                {att.fileSize && (
                  <p className="text-xs text-gray-400">{formatFileSize(att.fileSize)}</p>
                )}
              </div>

              <select
                value={att.label}
                onChange={(e) => handleLabelChange(att.id, e.target.value as AttachmentLabel)}
                className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${LABEL_COLORS[att.label]}`}
                title="Type de document"
              >
                {LABEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleOpen(att.filePath, att.fileName)}
                  title="Ouvrir le fichier"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => handleDelete(att.id, att.fileName)}
                  title="Retirer"
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Badge label always visible on small screens */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium group-hover:hidden ${LABEL_COLORS[att.label]}`}>
                {LABEL_LABELS[att.label]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
