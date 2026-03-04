import { useState, useEffect } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { EventType } from '@/types/application';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Mail, Phone, Calendar, Clock, FileText, ArrowRight } from 'lucide-react';
import { EventFormModal } from './EventFormModal';

interface ApplicationTimelineProps {
  applicationId: string;
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

export function ApplicationTimeline({ applicationId }: ApplicationTimelineProps) {
  const { events, fetchEvents } = useApplicationStore();
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  useEffect(() => {
    fetchEvents(applicationId);
  }, [applicationId, fetchEvents]);

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
                <h4 className="text-sm font-bold text-gray-900">{event.title}</h4>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-3">
                  {format(new Date(event.eventDate), 'dd MMM yyyy HH:mm', { locale: fr })}
                </span>
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
      />
    </div>
  );
}