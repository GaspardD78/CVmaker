import { useState } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { EventType } from '@/types/application';
import * as Dialog from '@radix-ui/react-dialog';
import { X, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  isCalendarWorthy,
  getDefaultDuration,
  buildEventGoogleCalendarUrl,
  openInGoogleCalendar,
} from '@/lib/googleCalendar';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  applicationContext?: {
    companyName?: string;
    jobTitle?: string;
    location?: string | null;
  };
}

export function EventFormModal({ isOpen, onClose, applicationId, applicationContext }: EventFormModalProps) {
  const { createEvent } = useApplicationStore();

  const [eventType, setEventType] = useState<EventType>('note');
  const [eventDate, setEventDate] = useState(new Date().toISOString().substring(0, 16));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [addToCalendar, setAddToCalendar] = useState(false);

  const getDefaultTitle = (type: EventType) => {
    switch (type) {
      case 'note': return 'Note ajoutée';
      case 'email_sent': return 'Email envoyé';
      case 'email_received': return 'Email reçu';
      case 'call': return 'Appel téléphonique';
      case 'interview': return 'Entretien';
      case 'followup': return 'Relance envoyée';
      case 'document_sent': return 'Document envoyé';
      case 'status_change': return 'Statut modifié';
      case 'other': return 'Autre événement';
      default: return 'Nouvel événement';
    }
  };

  const handleTypeChange = (newType: EventType) => {
    setEventType(newType);
    if (!title || title === getDefaultTitle(eventType)) {
      setTitle(getDefaultTitle(newType));
    }
    setDurationMinutes(getDefaultDuration(newType));
    if (!isCalendarWorthy(newType)) {
      setAddToCalendar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createEvent({
        applicationId,
        eventType,
        eventDate: new Date(eventDate).toISOString(),
        title: title || getDefaultTitle(eventType),
        description: description || null,
        oldStatus: null,
        newStatus: null,
        calendarId: addToCalendar ? 'google' : null,
      });

      if (addToCalendar) {
        const url = buildEventGoogleCalendarUrl(
          {
            title: title || getDefaultTitle(eventType),
            eventDate: new Date(eventDate).toISOString(),
            description: description || null,
            eventType,
            durationMinutes,
          },
          applicationContext
        );
        await openInGoogleCalendar(url);
      }

      toast.success("Événement ajouté");
      onClose();
      resetForm();
    } catch (error) {
      toast.error("Erreur lors de l'ajout de l'événement");
    }
  };

  const resetForm = () => {
    setEventType('note');
    setEventDate(new Date().toISOString().substring(0, 16));
    setTitle('');
    setDescription('');
    setDurationMinutes(30);
    setAddToCalendar(false);
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
            <Dialog.Title className="text-lg font-bold">Ajouter un événement</Dialog.Title>
            <Dialog.Close className="text-gray-500 hover:bg-gray-100 p-1 rounded-full">
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type d'événement *</label>
              <select
                required
                value={eventType}
                onChange={(e) => handleTypeChange(e.target.value as EventType)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="note">Note libre</option>
                <option value="email_sent">Email envoyé</option>
                <option value="email_received">Email reçu</option>
                <option value="call">Appel téléphonique</option>
                <option value="interview">Entretien</option>
                <option value="followup">Relance</option>
                <option value="document_sent">Document envoyé</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date et heure *</label>
              <input
                type="datetime-local"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

            {isCalendarWorthy(eventType) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durée</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 heure</option>
                  <option value={90}>1h30</option>
                  <option value={120}>2 heures</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder={getDefaultTitle(eventType)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-24 border border-gray-300 rounded-md px-3 py-2"
                placeholder="Détails supplémentaires..."
              />
            </div>

            {isCalendarWorthy(eventType) && (
              <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  checked={addToCalendar}
                  onChange={(e) => setAddToCalendar(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <CalendarPlus size={16} />
                  Créer dans Google Calendar
                </span>
              </label>
            )}

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
