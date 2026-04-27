import { useState, useEffect } from 'react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useProfileStore } from '@/stores/profileStore';
import { JobOffersView } from './JobOffersView';
import { JobWatchConfigView } from './JobWatchConfig';
import { HealthDashboard } from './HealthDashboard';
import { SetupWizard } from './SetupWizard';

type Tab = 'offers' | 'config';

export function JobWatchPage() {
  const [activeTab, setActiveTab] = useState<Tab>('offers');
  const { initialize, unreadCount, configs } = useJobWatchStore();
  const { profile } = useProfileStore();
  const [wizardDismissed, setWizardDismissed] = useState(false);

  useEffect(() => { initialize(); }, [initialize]);

  const showWizard = !wizardDismissed && configs.length === 0 && profile?.title;
  const unread = unreadCount();

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'offers', label: 'Offres', badge: unread > 0 ? unread : undefined },
    { id: 'config', label: 'Configuration' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--rf-bg)' }}>

      {/* Page header */}
      <div style={{
        padding: '28px 32px 20px',
        borderBottom: '1px solid var(--rf-border)',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16,
        background: 'var(--rf-surface)',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--rf-text)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.4px', margin: 0,
          }}>Veille Emploi</h1>
          <p style={{ fontSize: 13, color: 'var(--rf-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
            Agrégation depuis APEC, HelloWork, WTTJ, LinkedIn
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            className="rf-btn-secondary"
            onClick={() => setActiveTab('config')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Configuration
          </button>
        </div>
      </div>

      {showWizard ? (
        <div style={{ padding: '24px 32px' }}>
          <SetupWizard onComplete={() => { setWizardDismissed(true); initialize(); }} />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{
            background: 'var(--rf-surface)', borderBottom: '1px solid var(--rf-border)',
            padding: '0 32px', display: 'flex', gap: 0, flexShrink: 0,
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 16px 10px', fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-body)', background: 'none', border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--rf-accent)' : 'transparent'}`,
                  color: activeTab === tab.id ? 'var(--rf-accent)' : 'var(--rf-muted)',
                  cursor: 'pointer', transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span style={{
                    background: activeTab === tab.id ? 'rgba(99,102,241,.15)' : 'var(--rf-hover)',
                    color: activeTab === tab.id ? '#818cf8' : 'var(--rf-muted)',
                    borderRadius: 99, fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', fontFamily: 'var(--font-body)',
                  }}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'offers' && (
              <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <HealthDashboard />
                <JobOffersView />
              </div>
            )}
            {activeTab === 'config' && (
              <div style={{ padding: '24px 32px' }}>
                <JobWatchConfigView />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
