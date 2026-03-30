import { useState, useEffect } from 'react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { JobOffersView } from './JobOffersView';
import { JobWatchConfigView } from './JobWatchConfig';

type Tab = 'offers' | 'config';

export function JobWatchPage() {
  const [activeTab, setActiveTab] = useState<Tab>('offers');
  const { initialize, isLoading, unreadCount } = useJobWatchStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'offers', label: `Offres${unreadCount() > 0 ? ` (${unreadCount()})` : ''}` },
    { id: 'config', label: 'Configuration' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Veille Emploi</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Agrégation automatique d'offres depuis APEC, Indeed, WTTJ et LinkedIn
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'offers' && <JobOffersView />}
      {activeTab === 'config' && <JobWatchConfigView />}
    </div>
  );
}
