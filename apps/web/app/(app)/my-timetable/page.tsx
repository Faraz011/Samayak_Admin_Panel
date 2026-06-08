'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DAYS_SHORT, PERIOD_TIMES, PERIODS } from '@samayak/shared';
import type { TimetableEntry, Course, Room, Profile } from '@samayak/shared';
import { CalendarDays, Clock, BookOpen, DoorOpen } from 'lucide-react';

type EnrichedEntry = TimetableEntry & { course?: Course; room?: Room };

export default function MyTimetablePage() {
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, ttRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('timetable_entries')
        .select('*, course:courses(*), room:rooms(*)')
        .eq('faculty_id', user.id),
    ]);

    if (profileRes.data) setProfile(profileRes.data as Profile);
    if (ttRes.data) setEntries(ttRes.data as EnrichedEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const today = new Date().getDay() || 7;
  const todayEntries = entries
    .filter((e) => e.day_of_week === today)
    .sort((a, b) => a.period - b.period);

  const totalSlots = entries.length;
  const uniqueCourses = new Set(entries.map((e) => e.course_id)).size;
  const uniqueRooms = new Set(entries.filter((e) => e.room_id).map((e) => e.room_id)).size;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-[10px] bg-[#e0efff] flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-brand-blue" />
            </div>
            <div>
              <p className="text-[28px] font-extrabold tracking-tight text-ink leading-none">{totalSlots}</p>
              <p className="text-[12px] font-bold text-muted mt-0.5">Weekly Slots</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-[10px] bg-[#f3e8ff] flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[#7c3aed]" />
            </div>
            <div>
              <p className="text-[28px] font-extrabold tracking-tight text-ink leading-none">{uniqueCourses}</p>
              <p className="text-[12px] font-bold text-muted mt-0.5">Courses</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-[10px] bg-[#e9f7f1] flex items-center justify-center">
              <DoorOpen className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-[28px] font-extrabold tracking-tight text-ink leading-none">{uniqueRooms}</p>
              <p className="text-[12px] font-bold text-muted mt-0.5">Rooms Used</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Timetable Grid */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <CalendarDays className="w-[18px] h-[18px] text-brand-blue" />
            <h3 className="text-[16px] font-extrabold text-ink">Weekly Timetable</h3>
          </div>

          <div className="overflow-x-auto">
            <div
              className="grid gap-[3px] min-w-[700px]"
              style={{ gridTemplateColumns: `60px repeat(${PERIODS.length}, 1fr)` }}
            >
              {/* Header row: period times */}
              <div className="h-10" />
              {PERIODS.map((p) => (
                <div
                  key={p}
                  className="h-10 flex items-center justify-center text-[11px] font-extrabold text-muted bg-[#f7fafd] rounded-[8px]"
                >
                  {PERIOD_TIMES[p]}
                </div>
              ))}

              {/* Day rows */}
              {[1, 2, 3, 4, 5, 6].map((day) => {
                const isToday = day === today;
                return (
                  <>
                    <div
                      key={`day-${day}`}
                      className={`flex items-center justify-center text-[12px] font-extrabold rounded-[8px] ${
                        isToday ? 'bg-gradient-brand text-white' : 'text-muted bg-[#f7fafd]'
                      }`}
                    >
                      {DAYS_SHORT[day]}
                    </div>
                    {PERIODS.map((period) => {
                      const entry = entries.find(
                        (e) => e.day_of_week === day && e.period === period
                      );

                      if (!entry) {
                        return (
                          <div
                            key={`${day}-${period}`}
                            className="min-h-[72px] rounded-[10px] bg-[#f8fafb] border border-line/30"
                          />
                        );
                      }

                      return (
                        <div
                          key={`${day}-${period}`}
                          className={`min-h-[72px] rounded-[10px] p-2.5 border transition-all hover:shadow-md hover:-translate-y-0.5 cursor-default ${
                            isToday
                              ? 'bg-gradient-brand text-white border-transparent shadow-sm'
                              : 'bg-white border-line hover:border-brand-blue/30'
                          }`}
                        >
                          <p className={`text-[11px] font-extrabold truncate ${isToday ? 'text-white' : 'text-ink'}`}>
                            {entry.course?.code || '—'}
                          </p>
                          <p className={`text-[9.5px] font-semibold mt-0.5 truncate ${isToday ? 'text-white/80' : 'text-muted'}`}>
                            {entry.course?.name || ''}
                          </p>
                          <p className={`text-[9px] font-bold mt-1 ${isToday ? 'text-white/70' : 'text-muted'}`}>
                            📍 {entry.room?.room_number || '—'}
                          </p>
                        </div>
                      );
                    })}
                  </>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Schedule List */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <Clock className="w-[18px] h-[18px] text-brand-blue" />
            <h3 className="text-[16px] font-extrabold text-ink">
              Today&apos;s Schedule · {DAYS_SHORT[today]}
            </h3>
            <Badge className="ml-auto">{todayEntries.length} classes</Badge>
          </div>

          {todayEntries.length === 0 ? (
            <div className="text-center py-10 text-muted font-medium">
              <CalendarDays className="w-10 h-10 mx-auto mb-2 text-line-2" />
              No classes scheduled for today
            </div>
          ) : (
            <div className="space-y-3">
              {todayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 bg-[#f7fafd] rounded-[16px] p-4 border border-line/50 hover:shadow-sm transition-all"
                >
                  <div className="w-12 h-12 rounded-[12px] bg-gradient-brand text-white flex items-center justify-center flex-shrink-0">
                    <div className="text-center leading-tight">
                      <p className="text-[10px] font-bold opacity-80">P{entry.period}</p>
                      <p className="text-[11px] font-extrabold">{PERIOD_TIMES[entry.period]}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-ink text-[15px]">
                      {entry.course?.name || 'Class'}
                    </p>
                    <p className="text-muted text-[12.5px] font-semibold mt-0.5">
                      {entry.course?.code} · Room {entry.room?.room_number || '—'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant={entry.course?.course_type as any || 'muted'}>
                      {entry.course?.course_type || 'class'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
