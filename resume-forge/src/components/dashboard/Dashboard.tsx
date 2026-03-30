import { useEffect, useMemo } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useCvStore } from '@/stores/cvStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subDays, isBefore, startOfDay, isToday, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Briefcase, FileText, AlertCircle, TrendingUp, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const safeDate = (val: string | null | undefined): Date | null => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const TERMINAL_STATUSES = ['accepted', 'rejected', 'withdrawn', 'ghosted'];

export function Dashboard() {
  const { applications, fetchApplications } = useApplicationStore();
  const { cvs, fetchCvs } = useCvStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchApplications();
    fetchCvs();
  }, [fetchApplications, fetchCvs]);

  const now = new Date();

  const stats = useMemo(() => {

    const activeStatuses = ['draft', 'applied', 'acknowledged', 'phone_screen', 'interview', 'technical_test', 'offer'];
    const activeApps = applications.filter(a => activeStatuses.includes(a.status));

    const thirtyDaysAgo = subDays(now, 30);

    const recentApps = applications.filter(a => {
      const d = safeDate(a.createdAt);
      return d && d >= thirtyDaysAgo;
    });

    const respondedStatuses = ['phone_screen', 'interview', 'technical_test', 'offer', 'accepted', 'rejected'];
    const appsWithResponse = applications.filter(a => respondedStatuses.includes(a.status));
    const responseRate = applications.length > 0
      ? Math.round((appsWithResponse.length / applications.filter(a => a.status !== 'draft').length) * 100) || 0
      : 0;

    const needsFollowup = applications
      .filter(a => {
        if (!a.nextActionDate || ['accepted', 'rejected', 'withdrawn', 'ghosted'].includes(a.status)) return false;
        return safeDate(a.nextActionDate) !== null;
      })
      .sort((a, b) => {
        const da = safeDate(a.nextActionDate);
        const db = safeDate(b.nextActionDate);
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });

    const interviews = applications.filter(a => a.status === 'interview');

    // Chart data (last 4 weeks)
    const weeks = Array.from({ length: 4 }).map((_, i) => {
      const start = subDays(now, (i + 1) * 7);
      const end = subDays(now, i * 7);
      const count = applications.filter(a => {
        const d = safeDate(a.createdAt);
        if (!d) return false;
        return d >= start && d < end;
      }).length;
      return {
        name: `S-${i}`,
        'Candidatures': count
      };
    }).reverse();

    // Source distribution (non-draft only)
    const SOURCE_LABELS: Record<string, string> = {
      job_board: 'Job board',
      spontaneous: 'Spontanée',
      network: 'Réseau',
      recruiter: 'Recruteur',
      linkedin: 'LinkedIn',
      other: 'Autre',
    };
    const SOURCE_COLORS: Record<string, string> = {
      job_board: '#3b82f6',
      spontaneous: '#10b981',
      network: '#f59e0b',
      recruiter: '#8b5cf6',
      linkedin: '#0077b5',
      other: '#6b7280',
    };
    const nonDraft = applications.filter(a => a.status !== 'draft');
    const sourceCounts: Record<string, number> = {};
    nonDraft.forEach(a => {
      const src = a.source || 'other';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const sourceData = Object.entries(sourceCounts)
      .map(([key, value]) => ({
        name: SOURCE_LABELS[key] || key,
        value,
        color: SOURCE_COLORS[key] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value);

    // "À traiter aujourd'hui" — overdue + today, non-terminal
    const todayItems = applications.filter(a => {
      if (TERMINAL_STATUSES.includes(a.status)) return false;
      const d = safeDate(a.nextActionDate);
      if (!d) return false;
      return d <= startOfDay(subDays(now, -1)); // today or past
    }).sort((a, b) => {
      const da = safeDate(a.nextActionDate)!;
      const db = safeDate(b.nextActionDate)!;
      return da.getTime() - db.getTime();
    });

    return {
      activeCount: activeApps.length,
      recentCount: recentApps.length,
      responseRate,
      needsFollowup,
      interviewsCount: interviews.length,
      chartData: weeks,
      recentCvs: cvs.slice(0, 3),
      sourceData,
      todayItems,
    };
  }, [applications, cvs]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 sm:p-6 pb-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap gap-3 justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-1">
            Bienvenue ! Voici l'état de vos recherches.
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link to="/cv" className="min-h-[44px] px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium flex items-center gap-2 text-sm">
            <FileText size={16} />
            Mes CV
          </Link>
          <Link to="/tracker" className="min-h-[44px] px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 text-sm">
            <Briefcase size={16} />
            Suivi
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1 bg-gray-50 dark:bg-gray-900">

        {/* À traiter aujourd'hui */}
        {stats.todayItems.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-amber-800 mb-3">⚡ À traiter aujourd'hui</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {stats.todayItems.slice(0, 5).map(app => (
                <button
                  key={app.id}
                  onClick={() => navigate('/tracker', { state: { openApplicationId: app.id } })}
                  className="flex-shrink-0 px-3 py-1.5 bg-white border border-amber-200 rounded-full text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors truncate max-w-[250px]"
                >
                  {app.companyName} — {app.nextAction || 'Relance'}
                </button>
              ))}
              {stats.todayItems.length > 5 && (
                <button
                  onClick={() => navigate('/tracker')}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
                >
                  et {stats.todayItems.length - 5} autres → voir le suivi
                </button>
              )}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-xs sm:text-sm font-medium mb-1">Candidatures actives</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.activeCount}</h3>
            </div>
            <div className="p-2 sm:p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Briefcase size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-xs sm:text-sm font-medium mb-1">Ce mois-ci</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.recentCount}</h3>
            </div>
            <div className="p-2 sm:p-3 bg-green-50 text-green-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-xs sm:text-sm font-medium mb-1">Taux de réponse</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.responseRate}%</h3>
            </div>
            <div className="p-2 sm:p-3 bg-purple-50 text-purple-600 rounded-lg">
              <FileText size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-xs sm:text-sm font-medium mb-1">Entretiens en cours</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.interviewsCount}</h3>
            </div>
            <div className="p-2 sm:p-3 bg-orange-50 text-orange-600 rounded-lg">
              <CalendarIcon size={20} />
            </div>
          </div>
        </div>

        {/* Source distribution chart */}
        {stats.sourceData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Briefcase size={20} className="text-purple-500" />
              Répartition par source
            </h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={stats.sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {stats.sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number | undefined) => [`${value ?? 0} candidature${(value ?? 0) > 1 ? 's' : ''}`, '']}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Chart */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 lg:col-span-2">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-500" />
              Activité des 4 dernières semaines
            </h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="Candidatures" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Action Alerts */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-red-500" />
                Relances à faire ({stats.needsFollowup.length})
              </h3>

              <div className="space-y-3">
                {stats.needsFollowup.length > 0 ? (
                  stats.needsFollowup.map(app => {
                    const d = safeDate(app.nextActionDate);
                    const overdue = d ? isBefore(startOfDay(d), startOfDay(now)) : false;
                    const today = d ? isToday(d) : false;
                    const daysUntil = d ? differenceInDays(startOfDay(d), startOfDay(now)) : null;
                    const urgent = overdue || today;
                    return (
                      <div key={app.id} className={`p-3 rounded-lg border ${urgent ? 'border-red-100 bg-red-50' : 'border-blue-100 bg-blue-50'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-sm text-gray-900">{app.companyName}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${urgent ? 'text-red-600 bg-white' : 'text-blue-600 bg-white'}`}>
                            {d ? format(d, 'dd MMM', { locale: fr }) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-1">{app.jobTitle}</p>
                        {app.nextAction && (
                          <p className={`text-xs mt-2 font-medium flex items-center gap-1 ${urgent ? 'text-red-700' : 'text-blue-700'}`}>
                            <AlertCircle size={12} />
                            {app.nextAction}
                            {!urgent && daysUntil !== null && daysUntil > 0 && (
                              <span className="ml-auto text-blue-400 font-normal">dans {daysUntil}j</span>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
                    Aucune action requise pour le moment.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText size={20} className="text-indigo-500" />
                Derniers CV modifiés
              </h3>

              <div className="space-y-3">
                {stats.recentCvs.length > 0 ? (
                  stats.recentCvs.map(cv => {
                    const d = cv.updatedAt ? new Date(cv.updatedAt) : null;
                    const isValidDate = d && !isNaN(d.getTime());
                    return (
                      <Link key={cv.id} to={`/cv/${cv.id}`} className="block p-3 border border-gray-100 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-100 transition-colors rounded-lg group">
                        <div className="font-semibold text-sm text-gray-900 group-hover:text-indigo-700">{cv.name}</div>
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <Clock size={12} className="mr-1" />
                          Modifié le {isValidDate ? format(d, 'dd MMM yyyy', { locale: fr }) : ''}
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-center p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
                    Aucun CV créé pour le moment.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}