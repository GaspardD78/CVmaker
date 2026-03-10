import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { EventType } from '@/types/application';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Mail, Phone, Calendar, Clock, FileText, ArrowRight, CalendarPlus, Trash2 } from 'lucide-react';
import { EventFormModal } from './EventFormModal';
import { buildEventGoogleCalendarUrl, openInGoogleCalendar } from '@/lib/googleCalendar';
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

interface ApplicationTimelineProps {
  applicationId: string;
  applicationContext?: {
    companyName?: string;
    jobTitle?: string;
    location?: string | null;
  };
}

const getEventIcon = (type: EventType) => {
  switch (type) {
    case 'email_sent':
    case 'email_received':
      return <Mail size={16} />;
    case 'call':
      return <Phone size={16} />;
    case 'interview':
      return <Calendar size={16} />;
    case 'status_change':
      return <ArrowRight size={16} />;
    case 'document_sent':
      return <FileText size={16} />;
    case 'note':
      return <FileText size={16} />;
    default:
      return <Clock size={16} />;
  }
};

const getEventColor = (type: EventType) => {
  switch (type) {
    case 'status_change': return 'bg-blue-100 text-blue-600';
    case 'interview': return 'bg-purple-100 text-purple-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export function ApplicationTimeline({ applicationId, applicationContext }: ApplicationTimelineProps) {
  const { events, fetchEvents, deleteEvent } = useApplicationStore();
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  useEffect(() => {
    fetchEvents(applicationId);
  }, [applicationId, fetchEvents]);

  const handleOpenInCalendar = async (event: typeof events[0]) => {
    const url = buildEventGoogleCalendarUrl(
      {
        title: event.title,
        eventDate: event.eventDate,
        description: event.description,
        eventType: event.eventType,
      },
      applicationContext
    );
    await openInGoogleCalendar(url);
  };

  const handleDeleteEvent = async (eventId: string) => {
    let confirmed = false;
    try {
      confirmed = await tauriConfirm("Supprimer cet événement ?", {
        title: "Confirmation",
        kind: "warning",
      });
    } catch {
      confirmed = window.confirm("Supprimer cet événement ?");
    }
    if (confirmed) {
      try {
        await deleteEvent(eventId);
        toast.success("Événement supprimé");
      } catch {
        toast.error("Erreur lors de la suppression");
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-gray-800">Historique</h3>
        <button
          onClick={() => setIsEventModalOpen(true)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
        >
          <Plus size={14} /> Ajouter un événement
        </button>
      </div>

      <div className="relative border-l-2 border-gray-100 ml-3 space-y-6">
        {events.map((event) => (
          <div key={event.id} className="relative pl-6">
            <div className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center ${getEventColor(event.eventType)}`}>
              {getEventIcon(event.eventType)}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate">{event.title}</h4>
                  {event.calendarId === 'google' && (
                    <span title="Ajouté à Google Calendar" className="shrink-0 w-4 h-4 text-blue-500">
                      <CalendarPlus size={14} />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {format(new Date(event.eventDate), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </span>
                  {event.eventType !== 'status_change' && (
                    <button
                      onClick={() => handleOpenInCalendar(event)}
                      title="Ouvrir dans Google Calendar"
                      className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                    >
                      <CalendarPlus size={14} />
                    </button>
                  )}
                  {event.eventType !== 'status_change' && (
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      title="Supprimer"
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {event.description && (
                <p className="text-sm text-gray-600 mt-1">{event.description}</p>
              )}
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="pl-6 text-sm text-gray-500 italic">
            Aucun événement enregistré pour cette candidature.
          </div>
        )}
      </div>

      <EventFormModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        applicationId={applicationId}
        applicationContext={applicationContext}
      />
    </div>
  );
}
