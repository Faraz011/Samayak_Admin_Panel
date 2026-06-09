'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Role } from '@samayak/shared';
import { ROLE_CONFIG, NAV_PERMISSIONS, ADMIN_NAV_ROUTES } from '@samayak/shared';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  BookOpen,
  Users,
  FileText,
  Upload,
  LogOut,
  Menu,
  X,
  CalendarDays,
} from 'lucide-react';

const ALL_NAV_ITEMS = [
  { href: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/my-timetable',   label: 'My Timetable',   icon: CalendarDays },
  { href: '/departments',    label: 'Departments',    icon: Building2 },
  { href: '/rooms',          label: 'Rooms',          icon: DoorOpen },
  { href: '/courses',        label: 'Courses',        icon: BookOpen },
  { href: '/faculty',        label: 'Faculty',        icon: Users },
  { href: '/pdf-ingestion',  label: 'PDF Ingestion',  icon: FileText },
  { href: '/bulk-imports',   label: 'Bulk Imports',   icon: Upload },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [latestIngestion, setLatestIngestion] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('online');

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) setProfile(data as Profile);
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const fetchLatestIngestion = async () => {
      try {
        const { data, error } = await supabase
          .from('pdf_ingestions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          setLatestIngestion(data[0]);
        }
        setDbStatus('online');
      } catch (err) {
        console.error('Error fetching latest ingestion:', err);
        setDbStatus('offline');
      }
    };

    fetchLatestIngestion();

    const channel = supabase
      .channel('topbar_ingestion_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pdf_ingestions' },
        (payload) => {
          setLatestIngestion(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const roleConfig = profile ? ROLE_CONFIG[profile.role] : null;

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky z-50 w-[280px] bg-white/95 backdrop-blur-xl border border-line p-5 flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[320px] lg:translate-x-0'
        } top-4 left-4 h-[calc(100vh-2rem)] rounded-[24px] shadow-lg lg:shadow-sm lg:my-4 lg:ml-4`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-1 pt-1 pb-4">
          <div className="w-[42px] h-[42px] rounded-[12px] bg-black flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            <img src="/anugat_logo.png" alt="Anugat AI" className="w-full h-full object-contain p-1" />
          </div>
          <div>
            <h2 className="text-[17px] font-extrabold tracking-tight text-ink leading-tight">Anugat AI</h2>
            <p className="text-[11px] font-semibold text-muted">Admin Panel</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden p-1.5 rounded-full hover:bg-line/50"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-2">
          {(() => {
            const role = profile?.role as Role | undefined;
            const filteredItems = ALL_NAV_ITEMS.filter((item) => {
              const allowed = NAV_PERMISSIONS[item.href];
              return !allowed || !role || allowed.includes(role);
            });
            const primaryItems = filteredItems.filter((item) => !ADMIN_NAV_ROUTES.includes(item.href));
            const adminItems = filteredItems.filter((item) => ADMIN_NAV_ROUTES.includes(item.href));

            const renderItem = (item: typeof ALL_NAV_ITEMS[0]) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  id={`nav-${item.href.replace('/', '')}`}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-semibold text-[15px] transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-brand text-white shadow-[0_8px_18px_rgba(37,97,153,.3)]'
                      : 'text-ink-soft hover:bg-[#f1f7ff]'
                  }`}
                >
                  <Icon className="w-[19px] h-[19px]" strokeWidth={2} />
                  {item.label}
                </Link>
              );
            };

            return (
              <>
                <div className="space-y-1">
                  {primaryItems.map(renderItem)}
                </div>
                {adminItems.length > 0 && (
                  <>
                    <div className="h-px bg-line mx-3 my-3" />
                    <div className="space-y-1">
                      <span className="px-4 text-[10.5px] font-extrabold tracking-[.14em] uppercase text-muted">
                        Operations
                      </span>
                      {adminItems.map(renderItem)}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </nav>

        {/* Divider */}
        <div className="h-px bg-line mx-1.5 my-3" />

        {/* User profile */}
        {profile && (
          <div className="px-2 py-2">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-[13px] font-extrabold flex-shrink-0"
                style={{ background: roleConfig?.color || '#64748b' }}
              >
                {profile.full_name.split(' ').map(w => w[0]).join('').substring(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-ink truncate">{profile.full_name}</p>
                <p className="text-[11.5px] font-medium text-muted truncate">{profile.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          id="logout-button"
          className="flex items-center gap-3 bg-[#0b0b0d] text-white px-4 py-3.5 rounded-[16px] font-semibold text-[15px] hover:bg-[#1c1c22] transition-colors w-full"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
          Logout
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <div className="sticky top-0 z-30 lg:hidden bg-white/80 backdrop-blur-xl border-b border-line px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-[10px] hover:bg-line/50"
            id="mobile-menu-button"
          >
            <Menu className="w-5 h-5 text-ink" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] bg-black flex items-center justify-center overflow-hidden">
              <img src="/anugat_logo.png" alt="Anugat AI" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className="font-extrabold text-ink">Anugat AI</span>
          </div>
        </div>

        {/* Page content */}
        <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
          {/* Topbar */}
          <header className="hidden lg:flex items-center justify-between bg-white/80 backdrop-blur-md border border-line rounded-[20px] px-6 py-3.5 shadow-sm">
            {/* Left: Pathname & Session */}
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-[16px] text-ink capitalize tracking-tight">
                {pathname === '/' || pathname === '/dashboard' ? 'Dashboard' : pathname.replace('/', '').replaceAll('-', ' ')}
              </span>
              <div className="h-4 w-px bg-line" />
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                Spring 2026
              </span>
              {profile && (
                <>
                  <div className="h-4 w-px bg-line" />
                  <span
                    className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full"
                    style={{ color: roleConfig?.color, background: roleConfig?.bg }}
                  >
                    {roleConfig?.label}
                  </span>
                </>
              )}
            </div>

            {/* Right: DB status, Ingestion status, Profile */}
            <div className="flex items-center gap-4">
              {latestIngestion && (latestIngestion.status === 'queued' || latestIngestion.status === 'parsing' || latestIngestion.status === 'integrating') && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-[12px] text-[12px] font-semibold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Ingesting Timetable...
                </div>
              )}
              {latestIngestion && latestIngestion.status === 'done' && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-[12px] text-[12px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Timetable Synced
                </div>
              )}

              <div className="flex items-center gap-2 px-1">
                <span className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? '' : ''}`} />
                <span className="text-[11.5px] font-semibold text-muted">
                  {dbStatus === 'online' ? '' : ''}
                </span>
              </div>

              {profile && (
                <div className="flex items-center gap-2.5 pl-3 border-l border-line">
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                    style={{ background: roleConfig?.color || '#64748b' }}
                  >
                    {profile.full_name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                  </div>
                  <div className="text-left">
                    <p className="text-[12.5px] font-bold text-ink leading-tight">{profile.full_name}</p>
                    <p className="text-[10.5px] font-semibold text-muted capitalize leading-none mt-0.5">{profile.role}</p>
                  </div>
                </div>
              )}
            </div>
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
