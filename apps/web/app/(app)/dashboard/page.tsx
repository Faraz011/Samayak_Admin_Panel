'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DAYS_SHORT, PERIOD_TIMES, PERIODS, ROLE_CONFIG,
  ROLE_DASHBOARD_CONFIG,
} from '@samayak/shared';
import type {
  Profile, Role, RoomUtilization, EmptyRoomProbability,
  UnderRunningCourse, AvgEmptyRoomHours, Department, TimetableEntry,
  Course, Room,
} from '@samayak/shared';
import {
  BarChart3, Percent, BookX, Clock, TrendingUp, DoorOpen,
  Activity, CalendarDays, Target, Building2, Users,
  AlertTriangle, ClipboardList, CalendarPlus, ArrowRight,
  BookOpen, CheckCircle2, Shield, Plus, Sparkles, Check, Trash2, Video, Bell, Terminal, Database
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  CalendarDays, Target, CalendarPlus, ClipboardList,
  Building2, Users, BarChart3, AlertTriangle, Activity, TrendingUp,
};

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  return { toast, showToast };
}

function ToastNotification({ message, type }: { message: string; type: 'success' | 'info' | 'error' }) {
  const bg = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-error' : 'bg-brand-deep';
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${bg} text-white px-5 py-3.5 rounded-[16px] shadow-lg animate-fade-in flex items-center gap-2.5 max-w-sm font-bold text-[13.5px] border border-white/10`}>
      {type === 'success' && <Check className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />}
      {type === 'error' && <AlertTriangle className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />}
      {type === 'info' && <Sparkles className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />}
      <span>{message}</span>
    </div>
  );
}

function WelcomeBanner({ role, onActionClick }: { role: Role; onActionClick?: (actionLabel: string) => void }) {
  const config = ROLE_DASHBOARD_CONFIG[role];

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-brand p-8 text-white shadow-lg">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(400px 200px at 90% 10%, rgba(255,255,255,.2), transparent 60%)',
        }}
      />
      <div className="relative z-10">
        <h2 className="text-[30px] font-extrabold tracking-tight leading-tight">
          {config.greeting}
        </h2>
        <p className="text-white/90 text-[14.5px] mt-2 max-w-[60%] font-medium leading-relaxed">
          {config.subtitle}
        </p>
        <div className="flex gap-3 mt-5 flex-wrap">
          {config.actions.map((action) => {
            const Icon = ICON_MAP[action.icon] || ArrowRight;
            if (action.href) {
              return (
                <Link key={action.label} href={action.href}>
                  <button className="inline-flex items-center gap-2 bg-white text-ink font-bold text-[14px] px-5 py-3 rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                    <Icon className="w-[17px] h-[17px] text-brand-blue" strokeWidth={2.2} />
                    {action.label}
                  </button>
                </Link>
              );
            }
            return (
              <button
                key={action.label}
                onClick={() => onActionClick?.(action.label)}
                className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/30 text-white font-semibold text-[13px] px-4 py-2.5 rounded-full hover:bg-white/25 transition-all"
              >
                <Icon className="w-[16px] h-[16px]" strokeWidth={2} />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg, delta, className }: {
  title: string; value: string; icon: React.ElementType;
  color: string; bg: string; delta: string; className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: bg }}>
            <Icon className="w-[18px] h-[18px]" style={{ color }} />
          </div>
          <span className="text-[14px] font-bold text-ink-soft">{title}</span>
        </div>
        <p className="text-[38px] font-extrabold tracking-tight text-ink leading-none">
          {value}
        </p>
        <p className="text-[12.5px] font-bold mt-1" style={{ color }}>
          {delta}
        </p>
      </CardContent>
    </Card>
  );
}

function TodaysFocus({
  tasks,
  onToggleTask,
  onAddTask,
}: {
  tasks: { id: string; text: string; completed: boolean }[];
  onToggleTask: (id: string) => void;
  onAddTask: (text: string) => void;
}) {
  const [newTaskText, setNewTaskText] = useState('');
  const [showInput, setShowInput] = useState(false);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      onAddTask(newTaskText.trim());
      setNewTaskText('');
      setShowInput(false);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardContent className="p-6 flex flex-col h-full justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <Target className="w-[18px] h-[18px] text-brand-blue" />
            <h3 className="text-[16px] font-extrabold text-ink">Today&apos;s Focus</h3>
            <Badge className="ml-auto" variant={progressPct === 100 ? 'success' : 'default'}>
              {completedCount}/{totalCount} Done
            </Badge>
          </div>

          {totalCount > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-[11px] font-bold text-muted mb-1.5">
                <span>Task Completion Progress</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-brand transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {progressPct === 100 && totalCount > 0 ? (
            <div className="text-center py-6 text-muted font-medium bg-emerald-50/30 border border-emerald-100 rounded-card mb-4">
              <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-success" />
              <p className="text-ink font-bold text-[14px]">All tasks completed!</p>
              <p className="text-[12px] text-muted mt-0.5">You&apos;ve completed all your tasks for today, great job!</p>
            </div>
          ) : (
            <div className="space-y-2.5 mb-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onToggleTask(task.id)}
                  className={`flex items-start gap-2.5 p-3 rounded-[12px] border cursor-pointer transition-all ${
                    task.completed
                      ? 'bg-emerald-50/20 border-emerald-100/50 text-muted line-through'
                      : 'bg-[#f8fafb] border-line hover:border-brand-blue/30'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center mt-0.5 flex-shrink-0 transition-all ${
                    task.completed ? 'bg-success border-success text-white' : 'border-muted/50 bg-white'
                  }`}>
                    {task.completed && <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                  <span className="text-[13px] font-semibold leading-tight">{task.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {showInput ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Enter task title..."
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="text-[13px] h-9 px-3"
                autoFocus
              />
              <button
                type="submit"
                className="bg-brand-deep text-white font-bold text-[12.5px] px-3.5 rounded-[10px] hover:bg-brand-mid transition-colors h-9"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowInput(true)}
              className="inline-flex items-center gap-1.5 w-full justify-center bg-white text-brand-deep border border-line-2 hover:bg-[#f8fafb] font-bold text-[13px] py-2 rounded-[12px] transition-all"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InvigilatorDuty({
  duty,
  onAcknowledge,
}: {
  duty: any;
  onAcknowledge: () => void;
}) {
  if (!duty) {
    return (
      <Card className="h-full">
        <CardContent className="p-6 flex flex-col justify-center items-center h-full text-center text-muted">
          <Shield className="w-10 h-10 mb-2 text-line-2" />
          <p className="font-bold text-[14px]">No Invigilator Duties</p>
          <p className="text-[12px] mt-1">You have no assigned exam invigilation duties at this time.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardContent className="p-6 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <Shield className="w-[18px] h-[18px] text-[#256199]" />
            <h3 className="text-[16px] font-extrabold text-ink">Invigilator Duty</h3>
            <Badge variant={duty.acknowledged ? 'success' : 'warning'} className="ml-auto">
              {duty.acknowledged ? 'Confirmed' : 'Pending Action'}
            </Badge>
          </div>

          <div className="bg-[#f8fafb] border border-line rounded-card p-4 text-center mb-4">
            <p className="text-[11px] font-extrabold text-muted uppercase tracking-[.06em]">Assigned Location</p>
            <p className="text-[28px] font-extrabold text-ink tracking-tight mt-1 leading-none">
              Room no. {duty.room?.room_number || 'TBD'}
            </p>
            <div className="flex items-center justify-center gap-1.5 text-ink-soft text-[13px] font-bold mt-3">
              <Clock className="w-4 h-4 text-muted" />
              {duty.time_description}
            </div>
          </div>
          <p className="text-[12px] font-semibold text-muted text-center leading-relaxed">
            Please arrive at the control room at least 15 minutes before the exam starts.
          </p>
        </div>

        <div className="mt-4">
          <button
            onClick={onAcknowledge}
            disabled={duty.acknowledged}
            className={`w-full py-2.5 rounded-[12px] font-bold text-[13.5px] transition-all flex items-center justify-center gap-1.5 ${
              duty.acknowledged
                ? 'bg-emerald-50 text-success border border-emerald-100 cursor-default'
                : 'bg-gradient-brand text-white hover:opacity-90 shadow-md shadow-brand-blue/20'
            }`}
          >
            {duty.acknowledged ? (
              <>
                <Check className="w-[16px] h-[16px]" strokeWidth={2.5} />
                Duty Confirmed
              </>
            ) : (
              'Confirm / Acknowledge Duty'
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function Meetings({
  meetings,
  onJoin,
}: {
  meetings: any[];
  onJoin: (meeting: any) => void;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-6 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <CalendarDays className="w-[18px] h-[18px] text-[#7c3aed]" />
            <h3 className="text-[16px] font-extrabold text-ink">Meetings</h3>
            <Badge className="ml-auto bg-[#f3e8ff] text-[#7c3aed] border-transparent">
              {meetings.length} Scheduled
            </Badge>
          </div>

          <div className="space-y-2.5 max-h-[160px] overflow-y-auto">
            {meetings.map((meet) => (
              <div key={meet.id} className="bg-[#f7f5fc] border border-[#f3e8ff] rounded-card p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-white border border-[#e9e3f8] flex items-center justify-center flex-shrink-0">
                  <Video className="w-4 h-4 text-[#7c3aed]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-[#7c3aed] truncate">{meet.title}</p>
                  <p className="text-[11px] font-semibold text-muted truncate mt-0.5">{meet.time_description}</p>
                </div>
                {meet.url && (
                  <button
                    onClick={() => onJoin(meet)}
                    className="bg-brand-deep text-white font-bold text-[11px] px-2.5 py-1 rounded-[6px] hover:bg-brand-mid transition-all flex-shrink-0"
                  >
                    Join
                  </button>
                )}
              </div>
            ))}
            {meetings.length === 0 && (
              <div className="text-center py-6 text-muted">
                No meetings scheduled.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniTimetable({ entries }: { entries: Array<TimetableEntry & { course?: Course }> }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <CalendarDays className="w-[18px] h-[18px] text-brand-blue" />
          <h3 className="text-[16px] font-extrabold text-ink">My Weekly Schedule</h3>
        </div>
        <div className="grid gap-[2.5px]" style={{ gridTemplateColumns: `45px repeat(${PERIODS.length}, 1fr)` }}>
          <div />
          {PERIODS.map((p) => (
            <div key={p} className="text-center text-[9px] font-bold text-muted pb-1">
              {PERIOD_TIMES[p]}
            </div>
          ))}
          {[1, 2, 3, 4, 5, 6].map((day) => (
            <React.Fragment key={`day-block-${day}`}>
              <div className="text-[10.5px] font-extrabold text-muted flex items-center">
                {DAYS_SHORT[day]}
              </div>
              {PERIODS.map((period) => {
                const entry = entries.find((e) => e.day_of_week === day && e.period === period);
                return (
                  <div
                    key={`${day}-${period}`}
                    className={`aspect-square rounded-[6px] flex items-center justify-center text-[7.5px] font-extrabold transition-all border ${
                      entry
                        ? 'bg-gradient-brand text-white border-transparent shadow-sm'
                        : 'bg-[#f8fafb] border-line/50 hover:bg-[#f1f5f9]'
                    }`}
                    title={entry ? `${entry.course?.code || 'Class'} P${period}` : 'Free'}
                  >
                    {entry ? entry.course?.code?.substring(0, 4) : ''}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UtilizationByDay({ utilization }: { utilization: RoomUtilization[] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <TrendingUp className="w-[18px] h-[18px] text-brand-blue" />
          <h3 className="text-[16px] font-extrabold text-ink">Room Utilization by Day</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((day) => {
            const dayData = utilization.filter((r) => r.day_of_week === day);
            const avgPct = dayData.length
              ? dayData.reduce((s, r) => s + Number(r.utilization_pct), 0) / dayData.length
              : 0;
            return (
              <div key={day} className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-muted w-10">{DAYS_SHORT[day]}</span>
                <div className="flex-1 h-7 bg-[#eef2f8] rounded-[8px] overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-brand rounded-[8px] transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(avgPct, 100)}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-soft">
                    {avgPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRoomHeatmap({ emptyProb }: { emptyProb: EmptyRoomProbability[] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <DoorOpen className="w-[18px] h-[18px] text-brand-blue" />
          <h3 className="text-[16px] font-extrabold text-ink">Empty Room Probability</h3>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `40px repeat(${PERIODS.length}, 1fr)` }}>
          <div />
          {PERIODS.map((p) => (
            <div key={p} className="text-center text-[10px] font-bold text-muted pb-1">{PERIOD_TIMES[p]}</div>
          ))}
          {[1, 2, 3, 4, 5, 6].map((day) => (
            <React.Fragment key={`heatmap-day-${day}`}>
              <div className="text-[11px] font-bold text-muted flex items-center">{DAYS_SHORT[day]}</div>
              {PERIODS.map((period) => {
                const cell = emptyProb.find((r) => r.day_of_week === day && r.period === period);
                const prob = cell ? Number(cell.probability) : 1;
                const bgColor =
                  prob > 0.7 ? `rgba(39, 174, 138, ${0.15 + prob * 0.3})`
                    : prob > 0.3 ? `rgba(245, 165, 36, ${0.15 + (1 - prob) * 0.2})`
                    : `rgba(239, 70, 85, ${0.15 + (1 - prob) * 0.3})`;
                return (
                  <div
                    key={`${day}-${period}`}
                    className="aspect-square rounded-[6px] flex items-center justify-center text-[9.5px] font-bold transition-all duration-300 hover:scale-110 cursor-default"
                    style={{ backgroundColor: bgColor }}
                    title={`${DAYS_SHORT[day]} P${period}: ${(prob * 100).toFixed(0)}% free`}
                  >
                    {(prob * 100).toFixed(0)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-[10.5px] font-bold text-muted">
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-[rgba(239,70,85,0.3)]" /> Busy</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-[rgba(245,165,36,0.25)]" /> Moderate</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-[rgba(39,174,138,0.35)]" /> Free</span>
        </div>
      </CardContent>
    </Card>
  );
}

function UnderRunningTable({ courses }: { courses: UnderRunningCourse[] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <BookX className="w-[18px] h-[18px] text-warning" />
            <h3 className="text-[16px] font-extrabold text-ink">Under-Running Courses</h3>
          </div>
          <Badge variant="warning">{courses.length} courses</Badge>
        </div>
        {courses.length === 0 ? (
          <div className="text-center py-8 text-muted font-medium">
            <BookX className="w-10 h-10 mx-auto mb-2 text-line-2" />
            All courses are fully scheduled! 🎉
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line text-[12px] font-extrabold text-muted">
                  <th className="py-2.5">Code</th>
                  <th className="py-2.5">Name</th>
                  <th className="py-2.5">Branch/Sem</th>
                  <th className="py-2.5 text-right">Remaining Gap</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.course_id} className="border-b border-line/40 text-[13.5px]">
                    <td className="py-3 font-bold text-ink">{course.code}</td>
                    <td className="py-3 text-ink-soft truncate max-w-[160px]">{course.name}</td>
                    <td className="py-3">
                      <Badge variant="muted">
                        {course.branch} S{course.semester}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Badge variant="warning">-{course.gap} slots</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FacultyWorkload({ entries, profiles }: {
  entries: TimetableEntry[];
  profiles: Profile[];
}) {
  const workload = profiles.map((p) => {
    const count = entries.filter((e) => e.faculty_id === p.id).length;
    return { name: p.full_name, count, role: p.role };
  }).sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...workload.map((w) => w.count), 1);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <Users className="w-[18px] h-[18px] text-brand-blue" />
          <h3 className="text-[16px] font-extrabold text-ink">Faculty Workload</h3>
        </div>
        <div className="space-y-3">
          {workload.slice(0, 8).map((w) => (
            <div key={w.name} className="flex items-center gap-3">
              <span className="text-[12.5px] font-bold text-ink truncate w-28">{w.name}</span>
              <div className="flex-1 h-6 bg-[#eef2f8] rounded-[6px] overflow-hidden relative">
                <div
                  className="h-full bg-gradient-brand rounded-[6px] transition-all duration-500"
                  style={{ width: `${(w.count / maxCount) * 100}%` }}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-ink-soft">
                  {w.count} slots
                </span>
              </div>
            </div>
          ))}
          {workload.length === 0 && (
            <p className="text-center text-muted font-medium py-4">No faculty data available</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeptComparison({ departments, utilization, underRunning }: {
  departments: Department[];
  utilization: RoomUtilization[];
  underRunning: UnderRunningCourse[];
}) {
  const deptStats = departments.map((dept) => {
    const deptUtil = utilization.filter((u) => u.department_id === dept.id);
    const avgUtil = deptUtil.length
      ? (deptUtil.reduce((s, r) => s + Number(r.utilization_pct), 0) / deptUtil.length).toFixed(1)
      : '—';
    const underCount = underRunning.filter((c) => c.branch === dept.short_code).length;
    return { dept, avgUtil, underCount };
  });

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Building2 className="w-[18px] h-[18px] text-brand-blue" />
          <h3 className="text-[16px] font-extrabold text-ink">Department Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line text-[12px] font-extrabold text-muted">
                <th className="py-2.5">Department</th>
                <th className="py-2.5">Avg Utilization</th>
                <th className="py-2.5">Under-Scheduled</th>
                <th className="py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {deptStats.map(({ dept, avgUtil, underCount }) => (
                <tr key={dept.id} className="border-b border-line/45 text-[13.5px]">
                  <td className="py-3.5">
                     <div className="flex items-center gap-2">
                       <Badge>{dept.short_code}</Badge>
                       <span className="font-bold text-ink">{dept.name}</span>
                     </div>
                  </td>
                  <td className="py-3.5 font-bold">{avgUtil}%</td>
                  <td className="py-3.5">
                    {underCount > 0 ? (
                      <Badge variant="warning">{underCount} courses</Badge>
                    ) : (
                      <Badge variant="success" className="bg-emerald-50 text-success border border-emerald-100 font-bold">✓ Complete</Badge>
                    )}
                  </td>
                  <td className="py-3.5 text-right">
                    {underCount === 0 ? (
                      <span className="text-success text-[12.5px] font-bold">On Track</span>
                    ) : (
                      <span className="text-warning text-[12.5px] font-bold">Needs Attention</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AvgEmptyChart({ avgEmpty }: { avgEmpty: AvgEmptyRoomHours[] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Clock className="w-[18px] h-[18px] text-[#7c3aed]" />
          <h3 className="text-[16px] font-extrabold text-ink">Avg Empty Room-Hours by Day</h3>
        </div>
        <div className="space-y-3">
          {(avgEmpty || [])
            .sort((a, b) => Number(b.avg_empty_hours_per_room) - Number(a.avg_empty_hours_per_room))
            .map((item) => {
              const hours = Number(item.avg_empty_hours_per_room);
              const pct = (hours / 8.25) * 100;
              return (
                <div key={item.day_of_week} className="flex items-center gap-3">
                  <span className="text-[13px] font-bold text-muted w-10">{DAYS_SHORT[item.day_of_week]}</span>
                  <div className="flex-1 h-7 bg-[#f3e8ff]/50 rounded-[8px] overflow-hidden relative">
                    <div
                      className="h-full rounded-[8px] transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(105deg, #7c3aed 0%, #a78bfa 100%)' }}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-soft">{hours.toFixed(1)}h</span>
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}

import React from 'react';

export default function DashboardPage() {
  const { toast, showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Common DB metrics
  const [utilization, setUtilization] = useState<RoomUtilization[]>([]);
  const [emptyProb, setEmptyProb] = useState<EmptyRoomProbability[]>([]);
  const [underRunning, setUnderRunning] = useState<UnderRunningCourse[]>([]);
  const [avgEmpty, setAvgEmpty] = useState<AvgEmptyRoomHours[]>([]);
  const [totalRooms, setTotalRooms] = useState(0);
  const [totalCourses, setTotalCourses] = useState(0);
  const [totalFaculty, setTotalFaculty] = useState(0);
  const [totalDepts, setTotalDepts] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Professor DB records
  const [tasks, setTasks] = useState<{ id: string; text: string; completed: boolean }[]>([]);
  const [duty, setDuty] = useState<{ id: string; room?: { room_number: string }; time_description: string; acknowledged: boolean } | null>(null);
  const [meetings, setMeetings] = useState<{ id: string; title: string; time_description: string; url: string | null }[]>([]);
  const [reminders, setReminders] = useState<{ id: string; text: string; time: string }[]>([]);
  const [myEntries, setMyEntries] = useState<Array<TimetableEntry & { course?: Course; room?: Room }>>([]);

  // Modals (Professor)
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');

  // Coordinator DB records
  const [facultyRequests, setFacultyRequests] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [targetRoomForConflict, setTargetRoomForConflict] = useState('');

  // Gap Filler
  const [selectedCourseForGap, setSelectedCourseForGap] = useState('');
  const [selectedRoomForGap, setSelectedRoomForGap] = useState('');
  const [selectedDayForGap, setSelectedDayForGap] = useState('1');
  const [selectedPeriodForGap, setSelectedPeriodForGap] = useState('1');

  // HOD DB records
  const [deptProfiles, setDeptProfiles] = useState<Profile[]>([]);
  const [deptEntries, setDeptEntries] = useState<TimetableEntry[]>([]);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [showScheduleMeetingModal, setShowScheduleMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');

  // Professor swap requests
  const [showSwapRequestModal, setShowSwapRequestModal] = useState(false);
  const [swapDetails, setSwapDetails] = useState('');

  // Coordinator assign duty & follow-ups
  const [showAssignDutyModal, setShowAssignDutyModal] = useState(false);
  const [dutyFacultyId, setDutyFacultyId] = useState('');
  const [dutyRoomId, setDutyRoomId] = useState('');
  const [dutyTime, setDutyTime] = useState('');

  const [showCreateFollowupModal, setShowCreateFollowupModal] = useState(false);
  const [followupFacultyId, setFollowupFacultyId] = useState('');
  const [followupDetail, setFollowupDetail] = useState('');

  // Scoped list of professors for dropdowns
  const [allFaculty, setAllFaculty] = useState<any[]>([]);

  // HOD Stats
  const [classCoverage, setClassCoverage] = useState('100');

  // Admin DB Ingestion status
  const [latestIngestion, setLatestIngestion] = useState<any>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const prof = profileData as Profile | null;
    setProfile(prof);

    if (!prof) { setLoading(false); return; }

    const role = prof.role as Role;

    // Base queries
    const [utilRes, probRes, underRes, avgRes, deptsRes] = await Promise.all([
      supabase.from('v_room_utilization').select('*'),
      supabase.from('v_empty_room_probability').select('*'),
      supabase.from('v_under_running_courses').select('*'),
      supabase.from('v_avg_empty_room_hours').select('*'),
      supabase.from('departments').select('*').is('deleted_at', null).order('name'),
    ]);

    let roomsQuery = supabase.from('rooms').select('*').is('deleted_at', null).order('room_number');
    let coursesQuery = supabase.from('courses').select('*').is('deleted_at', null).order('code');
    let facultyQuery = supabase.from('profiles').select('*').is('deleted_at', null);

    if (prof.department_id && (role === 'hod' || role === 'coordinator')) {
      roomsQuery = roomsQuery.eq('department_id', prof.department_id);
      coursesQuery = coursesQuery.eq('department_id', prof.department_id);
      facultyQuery = facultyQuery.eq('department_id', prof.department_id);
    }

    const [roomsRes, coursesRes, facultyRes] = await Promise.all([
      roomsQuery,
      coursesQuery,
      facultyQuery,
    ]);

    setUtilization((utilRes.data || []) as RoomUtilization[]);
    setEmptyProb((probRes.data || []) as EmptyRoomProbability[]);
    setUnderRunning((underRes.data || []) as UnderRunningCourse[]);
    setAvgEmpty((avgRes.data || []) as AvgEmptyRoomHours[]);
    setTotalRooms(roomsRes.data?.length || 0);
    setTotalCourses(coursesRes.data?.length || 0);
    setTotalFaculty(facultyRes.data?.length || 0);
    setTotalDepts(deptsRes.data?.length || 0);
    setDepartments((deptsRes.data || []) as Department[]);
    setRooms((roomsRes.data || []) as Room[]);
    setCourses((coursesRes.data || []) as Course[]);

    // Role specific fetches
    if (role === 'professor') {
      const [ttData, tasksRes, remindersRes, dutyRes, meetingsRes] = await Promise.all([
        supabase.from('timetable_entries').select('*, course:courses(*), room:rooms(*)').eq('faculty_id', user.id),
        supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('reminders').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('invigilator_duties').select('*, room:rooms(*)').eq('faculty_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('meetings').select('*').order('created_at', { ascending: true }),
      ]);
      setMyEntries((ttData.data || []) as any);
      setTasks((tasksRes.data || []) as any);
      setReminders((remindersRes.data || []) as any);
      setDuty(dutyRes.data as any);
      setMeetings((meetingsRes.data || []) as any);
    }

    if (role === 'coordinator') {
      const [confRes, followRes] = await Promise.all([
        supabase.from('timetable_conflicts').select('*, room:rooms(*)').is('resolved', false).order('created_at', { ascending: false }),
        supabase.from('faculty_followups').select('*, faculty:profiles(*)').order('created_at', { ascending: true }),
      ]);
      setConflicts(confRes.data || []);
      setFacultyRequests(followRes.data || []);
    }

    // Fetch all faculty members (who are professors) for dropdowns
    const { data: facData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'professor')
      .is('deleted_at', null)
      .order('full_name');
    setAllFaculty(facData || []);

    if (role === 'hod') {
      const [swapRes, entRes] = await Promise.all([
        supabase.from('swap_requests').select('*, faculty:profiles(*)').order('created_at', { ascending: false }),
        supabase.from('timetable_entries').select('*'),
      ]);
      setDeptProfiles((facultyRes.data || []) as Profile[]);
      setDeptEntries((entRes.data || []) as TimetableEntry[]);

      const swaps = swapRes.data || [];
      const deptFacultyIds = new Set((facultyRes.data || []).map(f => f.id));
      setSwapRequests(swaps.filter((s: any) => s.faculty_id && deptFacultyIds.has(s.faculty_id)));

      // Compute coverage dynamically
      const deptCourseIds = new Set((coursesRes.data || []).map(c => c.id));
      const scheduledCoursesInDept = new Set(
        (entRes.data || [])
          .filter((entry: any) => deptCourseIds.has(entry.course_id))
          .map((entry: any) => entry.course_id)
      );
      const totalDeptCoursesCount = coursesRes.data?.length || 0;
      const coveragePct = totalDeptCoursesCount > 0
        ? (scheduledCoursesInDept.size / totalDeptCoursesCount * 100).toFixed(1)
        : '100';
      setClassCoverage(coveragePct);
    }

    if (role === 'admin') {
      const { data: ingData } = await supabase
        .from('pdf_ingestions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestIngestion(ingData);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const supabase = createClient();
    const channel = supabase
      .channel('dashboard-all-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Tasks actions
  const handleToggleTask = async (id: string) => {
    const supabase = createClient();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const { error } = await supabase.from('tasks').update({ completed: !task.completed }).eq('id', id);
    if (!error) {
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
      showToast('Task status updated!');
    } else {
      showToast('Error updating task: ' + error.message, 'error');
    }
  };

  const handleAddTask = async (text: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('tasks').insert({ user_id: user.id, text, completed: false }).select().single();
    if (!error && data) {
      setTasks([...tasks, data as any]);
      showToast('New task added!');
    } else {
      showToast('Error adding task: ' + (error?.message || 'Unknown error'), 'error');
    }
  };

  const handleRemoveTask = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (!error) {
      setTasks(tasks.filter(t => t.id !== id));
      showToast('Task removed.');
    } else {
      showToast('Error removing task: ' + error.message, 'error');
    }
  };

  // Reminder actions
  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newReminderText.trim()) {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('reminders').insert({
        user_id: user.id,
        text: newReminderText.trim(),
        time: newReminderTime || 'Today',
      }).select().single();

      if (!error && data) {
        setReminders([...reminders, data as any]);
        setNewReminderText('');
        setNewReminderTime('');
        showToast('Reminder added successfully!');
      } else {
        showToast('Error adding reminder: ' + (error?.message || 'Unknown error'), 'error');
      }
    }
  };

  // Coordinator actions
  const handleNudgeFaculty = async (name: string, id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('faculty_followups').update({ status: 'Nudged' }).eq('id', id);
    if (!error) {
      setFacultyRequests(
        facultyRequests.map((f) => (f.id === id ? { ...f, status: 'Nudged' } : f))
      );
      showToast(`Nudge notification sent to ${name}!`);
    } else {
      showToast('Error sending nudge: ' + error.message, 'error');
    }
  };

  const handleResolveConflict = async () => {
    if (!targetRoomForConflict) return;
    const supabase = createClient();
    const activeConflict = conflicts[0];
    if (!activeConflict) return;

    try {
      // 1. Find the room record for the target alternative room
      const { data: targetRoomData, error: roomError } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_number', targetRoomForConflict)
        .is('deleted_at', null)
        .single();

      if (roomError || !targetRoomData) {
        showToast('Error finding target room: ' + (roomError?.message || 'Not found'), 'error');
        return;
      }

      // 2. Find the clashing timetable entries in the conflict\'s room, day, and period
      const { data: clashingEntries, error: entryError } = await supabase
        .from('timetable_entries')
        .select('id')
        .eq('room_id', activeConflict.room_id)
        .eq('day_of_week', activeConflict.day_of_week)
        .eq('period', activeConflict.period);

      if (entryError) {
        showToast('Error searching timetable entries: ' + entryError.message, 'error');
        return;
      }

      // 3. Update one of the clashing entries to the new room
      if (clashingEntries && clashingEntries.length > 0) {
        const entryToUpdate = clashingEntries[0];
        const { error: updateEntryError } = await supabase
          .from('timetable_entries')
          .update({ room_id: targetRoomData.id })
          .eq('id', entryToUpdate.id);

        if (updateEntryError) {
          showToast('Failed to reschedule timetable slot: ' + updateEntryError.message, 'error');
          return;
        }
      }

      // 4. Resolve in conflict table
      const { error: confError } = await supabase
        .from('timetable_conflicts')
        .update({ resolved: true, resolution_details: `Room changed to ${targetRoomForConflict}` })
        .eq('id', activeConflict.id);

      if (!confError) {
        setConflicts(
          conflicts.map((c) => (c.id === activeConflict.id ? { ...c, resolved: true, details: `Resolved (Room changed to ${targetRoomForConflict})` } : c))
        );
        setShowResolveDialog(false);
        showToast('Timetable conflict resolved successfully!');
        fetchData();
      } else {
        showToast('Error resolving conflict: ' + confError.message, 'error');
      }
    } catch (err: any) {
      showToast('Resolution failed: ' + err.message, 'error');
    }
  };

  const handleGapFillerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseForGap || !selectedRoomForGap) {
      showToast('Please select both a course and a room', 'error');
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // 1. Fetch course details to get department_id, branch, and semester
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('department_id, branch, semester')
        .eq('id', selectedCourseForGap)
        .single();

      if (courseError || !courseData) {
        showToast('Error fetching course details: ' + (courseError?.message || 'Not found'), 'error');
        return;
      }

      // 2. Find or create a section record for this department, branch, and semester
      let { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .select('id')
        .eq('department_id', courseData.department_id)
        .eq('branch', courseData.branch)
        .eq('semester', courseData.semester)
        .eq('section_label', 'A')
        .maybeSingle();

      if (sectionError) {
        showToast('Error checking section: ' + sectionError.message, 'error');
        return;
      }

      let sectionId = sectionData?.id;

      if (!sectionId) {
        // Create a default section label 'A'
        const { data: newSection, error: createSecError } = await supabase
          .from('sections')
          .insert({
            department_id: courseData.department_id,
            branch: courseData.branch,
            semester: courseData.semester,
            section_label: 'A'
          })
          .select('id')
          .single();

        if (createSecError || !newSection) {
          showToast('Failed to create default section: ' + (createSecError?.message || 'Unknown error'), 'error');
          return;
        }
        sectionId = newSection.id;
      }

      // 3. Insert timetable entry
      const { error } = await supabase.from('timetable_entries').insert({
        course_id: selectedCourseForGap,
        room_id: selectedRoomForGap,
        day_of_week: Number(selectedDayForGap),
        period: Number(selectedPeriodForGap),
        faculty_id: user.id,
        section_id: sectionId,
      });

      if (error) {
        showToast(`Scheduling failed: ${error.message}`, 'error');
      } else {
        showToast('Successfully scheduled slot & resolved gap!');
        setSelectedCourseForGap('');
        setSelectedRoomForGap('');
        fetchData();
      }
    } catch (err: any) {
      showToast(`Scheduling failed: ${err.message}`, 'error');
    }
  };

  // HOD actions
  const handleApproveSwap = async (id: string, approve: boolean) => {
    const supabase = createClient();
    const status = approve ? 'Approved' : 'Rejected';
    const { error } = await supabase.from('swap_requests').update({ status }).eq('id', id);
    if (!error) {
      setSwapRequests(
        swapRequests.map((s) => (s.id === id ? { ...s, status } : s))
      );
      showToast(approve ? 'Swap request approved!' : 'Swap request rejected.', approve ? 'success' : 'error');
    } else {
      showToast('Error updating swap request: ' + error.message, 'error');
    }
  };

  const handleScheduleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingTitle.trim() || !meetingTime.trim()) {
      showToast('Please specify a title and time', 'error');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('meetings').insert({
      title: meetingTitle.trim(),
      time_description: meetingTime.trim(),
      url: meetingUrl.trim() || null,
      department_id: profile?.department_id || null,
    });

    if (!error) {
      showToast('Meeting scheduled successfully!');
      setShowScheduleMeetingModal(false);
      setMeetingTitle('');
      setMeetingTime('');
      setMeetingUrl('');
      fetchData();
    } else {
      showToast('Failed to schedule meeting: ' + error.message, 'error');
    }
  };

  const handleSwapRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapDetails.trim()) {
      showToast('Please specify details for the swap request', 'error');
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('swap_requests').insert({
      faculty_id: user.id,
      details: swapDetails.trim(),
      status: 'Pending Approval',
    });

    if (!error) {
      showToast('Swap request submitted successfully!');
      setShowSwapRequestModal(false);
      setSwapDetails('');
      fetchData();
    } else {
      showToast('Failed to submit swap request: ' + error.message, 'error');
    }
  };

  const handleAssignDutySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dutyFacultyId || !dutyRoomId || !dutyTime.trim()) {
      showToast('Please select a faculty, a room, and enter the time slot', 'error');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('invigilator_duties').insert({
      faculty_id: dutyFacultyId,
      room_id: dutyRoomId,
      time_description: dutyTime.trim(),
      acknowledged: false,
    });

    if (!error) {
      showToast('Invigilator duty assigned successfully!');
      setShowAssignDutyModal(false);
      setDutyFacultyId('');
      setDutyRoomId('');
      setDutyTime('');
      fetchData();
    } else {
      showToast('Failed to assign duty: ' + error.message, 'error');
    }
  };

  const handleCreateFollowupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followupFacultyId || !followupDetail.trim()) {
      showToast('Please select a faculty member and enter follow-up details', 'error');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('faculty_followups').insert({
      faculty_id: followupFacultyId,
      detail: followupDetail.trim(),
      status: 'Pending Response',
    });

    if (!error) {
      showToast('Faculty follow-up created successfully!');
      setShowCreateFollowupModal(false);
      setFollowupFacultyId('');
      setFollowupDetail('');
      fetchData();
    } else {
      showToast('Failed to create follow-up: ' + error.message, 'error');
    }
  };

  const handleWelcomeActionClick = (label: string) => {
    if (label === 'Manage Tasks') {
      setShowTasksModal(true);
    } else if (label === 'Set Reminders') {
      setShowRemindersModal(true);
    } else if (label === 'Schedule Meeting') {
      setShowScheduleMeetingModal(true);
    } else if (label === 'Request Class Swap') {
      setShowSwapRequestModal(true);
    } else if (label === 'Assign Invigilator Duty') {
      setShowAssignDutyModal(true);
    } else if (label === 'Create Follow-up') {
      setShowCreateFollowupModal(true);
    } else if (label === 'Fill Schedule Gaps') {
      showToast('Gap filler widget is ready below!');
    } else if (label === 'Track Requests') {
      showToast('Scroll down to check Pending Faculty Requests!');
    } else if (label === 'System Status') {
      showToast('System health panel is live!');
    } else {
      showToast(`Action triggered: ${label}`, 'info');
    }
  };

  const avgUtilization = utilization.length
    ? (utilization.reduce((s, r) => s + Number(r.utilization_pct), 0) / utilization.length).toFixed(1)
    : '0';
  const avgEmptyProb = emptyProb.length
    ? (emptyProb.reduce((s, r) => s + Number(r.probability), 0) / emptyProb.length * 100).toFixed(1)
    : '0';
  const underRunningCount = underRunning.length;
  const avgEmptyHours = avgEmpty.length
    ? (avgEmpty.reduce((s, r) => s + Number(r.avg_empty_hours_per_room), 0) / avgEmpty.length).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[180px] rounded-[20px]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[140px] rounded-card" />)}
        </div>
        <Skeleton className="h-[300px] rounded-card" />
      </div>
    );
  }

  const role = profile?.role as Role || 'professor';

  return (
    <>
      {toast && <ToastNotification message={toast.message} type={toast.type} />}

      {/* ─── PROFESSOR DASHBOARD ────────────────────────────────────── */}
      {role === 'professor' && (
        <div className="space-y-6 animate-fade-in">
          <WelcomeBanner role={role} onActionClick={handleWelcomeActionClick} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <TodaysFocus
              tasks={tasks}
              onToggleTask={handleToggleTask}
              onAddTask={handleAddTask}
            />
            <InvigilatorDuty
              duty={duty}
              onAcknowledge={async () => {
                if (!duty) return;
                const supabase = createClient();
                const { error } = await supabase.from('invigilator_duties').update({ acknowledged: true }).eq('id', duty.id);
                if (!error) {
                  setDuty({ ...duty, acknowledged: true });
                  showToast('Duty Confirmed & Logged!');
                } else {
                  showToast('Error confirming duty: ' + error.message, 'error');
                }
              }}
            />
            <Meetings
              meetings={meetings}
              onJoin={(meet) => {
                showToast(`Opening online meeting room for "${meet.title}"...`);
                if (meet.url) window.open(meet.url, '_blank');
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <MiniTimetable entries={myEntries} />
            </div>
            <div className="space-y-5">
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-[10px] bg-[#e0efff] flex items-center justify-center">
                    <CalendarDays className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <p className="text-[28px] font-extrabold text-ink leading-none">{myEntries.length}</p>
                    <p className="text-[12px] font-bold text-muted mt-0.5">Weekly Assigned Slots</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <Clock className="w-4 h-4 text-brand-blue" />
                    <h3 className="text-[14px] font-extrabold text-ink">Today&apos;s Classes</h3>
                  </div>
                  <div className="space-y-2">
                    {myEntries
                      .filter((e) => e.day_of_week === (new Date().getDay() || 7))
                      .sort((a, b) => a.period - b.period)
                      .map((entry) => (
                        <div key={entry.id} className="flex justify-between items-center text-[12.5px] border-b border-line/40 pb-2 last:border-0 last:pb-0">
                          <div>
                            <span className="font-bold text-ink">{entry.course?.code}</span>
                            <span className="text-muted ml-2">Period {entry.period} ({PERIOD_TIMES[entry.period]})</span>
                          </div>
                          <Badge variant="success">Room {entry.room?.room_number}</Badge>
                        </div>
                      ))}
                    {myEntries.filter((e) => e.day_of_week === (new Date().getDay() || 7)).length === 0 && (
                      <p className="text-[12.5px] text-muted py-2 text-center font-medium">No classes scheduled today.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ─── COORDINATOR DASHBOARD ──────────────────────────────────── */}
      {role === 'coordinator' && (
        <div className="space-y-6 animate-fade-in">
          <WelcomeBanner role={role} onActionClick={handleWelcomeActionClick} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <StatCard title="Rooms" value={totalRooms.toString()} icon={DoorOpen} color="#256199" bg="#e0efff" delta="Active rooms" />
            <StatCard title="Under-Running" value={underRunningCount.toString()} icon={BookX} color="#f5a524" bg="#fef9ee"
              delta={underRunningCount > 0 ? 'Needs attention' : 'All good'} />
            <StatCard title="Avg Room Utilization" value={`${avgUtilization}%`} icon={BarChart3} color="#27ae8a" bg="#e9f7f1" delta="Institute average" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Timetable Conflicts */}
            <Card className="lg:col-span-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <AlertTriangle className="w-[18px] h-[18px] text-error" />
                  <h3 className="text-[16px] font-extrabold text-ink">Timetable Conflicts</h3>
                  <Badge variant="error" className="ml-auto">
                    {conflicts.filter((c) => !c.resolved).length} Conflict
                  </Badge>
                </div>
                <div className="space-y-3">
                  {conflicts.map((c) => (
                    <div key={c.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-card border ${
                      c.resolved ? 'bg-emerald-50/20 border-emerald-100/50' : 'bg-rose-50/10 border-rose-100'
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.resolved ? 'success' : 'error'}>
                            {c.resolved ? 'Resolved' : 'Clash Detected'}
                          </Badge>
                          <span className="font-bold text-[14px] text-ink">
                            Room {c.room?.room_number || 'TBD'} · Period {c.period} ({DAYS_SHORT[c.day_of_week]})
                          </span>
                        </div>
                        <p className="text-[12.5px] text-muted font-semibold mt-1">{c.details}</p>
                      </div>
                      {!c.resolved && (
                        <button
                          onClick={() => {
                            setTargetRoomForConflict('');
                            setShowResolveDialog(true);
                          }}
                          className="bg-brand-deep text-white text-[12.5px] font-bold px-3.5 py-1.5 rounded-[8px] hover:bg-brand-mid transition-all mt-2.5 sm:mt-0"
                        >
                          Resolve Clash
                        </button>
                      )}
                    </div>
                  ))}
                  {conflicts.length === 0 && (
                    <p className="text-center text-muted py-6 font-medium">No unresolved conflicts detected! 🎉</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pending Faculty Requests */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <ClipboardList className="w-[18px] h-[18px] text-[#7c3aed]" />
                  <h3 className="text-[16px] font-extrabold text-ink">Faculty Follow-ups</h3>
                </div>
                <div className="space-y-3.5">
                  {facultyRequests.map((req) => (
                    <div key={req.id} className="flex justify-between items-start border-b border-line/40 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-bold text-[13px] text-ink">{req.faculty?.full_name || 'Faculty'}</p>
                        <p className="text-[11.5px] text-muted font-medium mt-0.5 leading-tight">{req.detail}</p>
                      </div>
                      <div>
                        {req.status === 'Confirmed' ? (
                          <Badge variant="success">Confirmed</Badge>
                        ) : req.status === 'Nudged' ? (
                          <Badge className="bg-[#f1f5f9] text-muted border-transparent">Nudged ✓</Badge>
                        ) : (
                          <button
                            onClick={() => handleNudgeFaculty(req.faculty?.full_name || 'Faculty', req.id)}
                            className="bg-white border border-line-2 text-brand-deep font-bold text-[11px] px-2 py-1 rounded-[6px] hover:bg-slate-50 transition-all"
                          >
                            Nudge
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {facultyRequests.length === 0 && (
                    <p className="text-center text-muted py-4">No follow-ups pending.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Gap Filler */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <CalendarPlus className="w-[18px] h-[18px] text-brand-blue" />
                  <h3 className="text-[16px] font-extrabold text-ink">Fill Schedule Gaps</h3>
                </div>
                <form onSubmit={handleGapFillerSubmit} className="space-y-4">
                  <div>
                    <Label className="text-[12.5px] font-bold">Select Under-Running Course</Label>
                    <Select value={selectedCourseForGap} onValueChange={setSelectedCourseForGap}>
                      <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                        <SelectValue placeholder="Choose course..." />
                      </SelectTrigger>
                      <SelectContent>
                        {underRunning.map((c) => (
                          <SelectItem key={c.course_id} value={c.course_id}>
                            {c.code} — {c.name} (Gap: {c.gap})
                          </SelectItem>
                        ))}
                        {underRunning.length === 0 && (
                          <SelectItem value="none" disabled>All courses scheduled!</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[12.5px] font-bold">Allocate Room</Label>
                    <Select value={selectedRoomForGap} onValueChange={setSelectedRoomForGap}>
                      <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                        <SelectValue placeholder="Choose room..." />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            Room {r.room_number} ({r.room_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[12.5px] font-bold">Day</Label>
                      <Select value={selectedDayForGap} onValueChange={setSelectedDayForGap}>
                        <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6].map((day) => (
                            <SelectItem key={day} value={day.toString()}>{DAYS_SHORT[day]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[12.5px] font-bold">Period</Label>
                      <Select value={selectedPeriodForGap} onValueChange={setSelectedPeriodForGap}>
                        <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERIODS.map((p) => (
                            <SelectItem key={p} value={p.toString()}>P{p} ({PERIOD_TIMES[p]})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#0b0b0d] text-white hover:bg-[#1c1c22] font-bold py-2.5 rounded-[12px] text-[13.5px] transition-all"
                  >
                    Schedule Slot
                  </button>
                </form>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-5">
              <UnderRunningTable courses={underRunning} />
              <UtilizationByDay utilization={utilization} />
            </div>
          </div>
        </div>
      )}

      {/* ─── HOD DASHBOARD ──────────────────────────────────────────── */}
      {role === 'hod' && (
        <div className="space-y-6 animate-fade-in">
          <WelcomeBanner role={role} onActionClick={handleWelcomeActionClick} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard title="Dept Faculty" value={deptProfiles.length.toString()} icon={Users} color="#7c3aed" bg="#f3e8ff" delta="CSE Department" />
            <StatCard title="Total Courses" value={totalCourses.toString()} icon={BookOpen} color="#256199" bg="#e0efff" delta="All Semesters" />
            <StatCard title="Class Coverage" value={`${classCoverage}%`} icon={Percent} color="#27ae8a" bg="#e9f7f1" delta="Computed from DB" />
            <StatCard title="Under-Running" value={underRunningCount.toString()} icon={BookX} color="#f5a524" bg="#fef9ee"
              delta={underRunningCount > 0 ? 'Needs attention' : 'All good'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Pending Swap Requests */}
            <Card className="lg:col-span-2">
              <CardContent className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <AlertTriangle className="w-[18px] h-[18px] text-[#256199]" />
                  <h3 className="text-[16px] font-extrabold text-ink">Swap Approval Requests</h3>
                </div>
                <div className="space-y-4">
                  {swapRequests.map((req) => (
                    <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#f8fafb] border border-line rounded-card">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[14px] text-ink">{req.faculty?.full_name || 'Faculty'}</span>
                          <Badge variant={req.status === 'Pending Approval' ? 'warning' : req.status === 'Approved' ? 'success' : 'error'}>
                            {req.status}
                          </Badge>
                        </div>
                        <p className="text-[12.5px] font-semibold text-muted mt-1">{req.details}</p>
                      </div>
                      {req.status === 'Pending Approval' ? (
                        <div className="flex gap-2 mt-3 sm:mt-0">
                          <button
                            onClick={() => handleApproveSwap(req.id, true)}
                            className="bg-success text-white font-bold text-[12.5px] px-3.5 py-1.5 rounded-[8px] hover:opacity-90 transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveSwap(req.id, false)}
                            className="bg-white border border-line-2 text-error font-bold text-[12.5px] px-3.5 py-1.5 rounded-[8px] hover:bg-slate-50 transition-all"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className={`text-[13px] font-bold ${req.status === 'Approved' ? 'text-success' : 'text-error'} mt-2 sm:mt-0`}>
                          Processed: {req.status}
                        </span>
                      )}
                    </div>
                  ))}
                  {swapRequests.length === 0 && (
                    <p className="text-center text-muted font-medium py-4">No swap requests pending.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <FacultyWorkload entries={deptEntries} profiles={deptProfiles} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <UnderRunningTable courses={underRunning} />
            <UtilizationByDay utilization={utilization} />
          </div>
        </div>
      )}

      {/* ─── DEAN DASHBOARD ─────────────────────────────────────────── */}
      {role === 'dean' && (
        <div className="space-y-6 animate-fade-in">
          <WelcomeBanner role={role} onActionClick={handleWelcomeActionClick} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard title="Departments" value={totalDepts.toString()} icon={Building2} color="#4f46e5" bg="#eef2ff" delta="Active" />
            <StatCard title="Avg Utilization" value={`${avgUtilization}%`} icon={BarChart3} color="#256199" bg="#e0efff" delta="Institute-wide" />
            <StatCard title="Under-Running" value={underRunningCount.toString()} icon={BookX} color="#f5a524" bg="#fef9ee"
              delta={underRunningCount > 0 ? 'Needs intervention' : 'All on track'} />
            <StatCard title="Total Faculty" value={totalFaculty.toString()} icon={Users} color="#64748b" bg="#f1f5f9" delta="Across all depts" />
          </div>

          <DeptComparison departments={departments} utilization={utilization} underRunning={underRunning} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <UtilizationByDay utilization={utilization} />
            <EmptyRoomHeatmap emptyProb={emptyProb} />
          </div>
        </div>
      )}

      {/* ─── ADMIN DASHBOARD ────────────────────────────────────────── */}
      {role === 'admin' && (
        <div className="space-y-6 animate-fade-in">
          <WelcomeBanner role={role} onActionClick={handleWelcomeActionClick} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard title="Room Utilization" value={`${avgUtilization}%`} icon={BarChart3} color="#256199" bg="#e0efff" delta="Peak utilization slots" />
            <StatCard title="Empty Room Prob." value={`${avgEmptyProb}%`} icon={Percent} color="#27ae8a" bg="#e9f7f1" delta="Across 9 periods" />
            <StatCard title="Under-Running" value={underRunningCount.toString()} icon={BookX} color="#f5a524" bg="#fef9ee"
              delta={underRunningCount > 0 ? 'Needs attention' : 'All good'} />
            <StatCard title="Avg Empty Room-Hours" value={`${avgEmptyHours}h`} icon={Clock} color="#7c3aed" bg="#f3e8ff" delta="Per room daily" />
          </div>

          {/* Timetable Ingestion Status */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
                <div className="flex items-center gap-2.5">
                  <Database className="w-[18px] h-[18px] text-brand-blue" />
                  <div>
                    <h3 className="text-[16px] font-extrabold text-ink">Timetable Ingestion Pipeline</h3>
                    <p className="text-[12px] font-bold text-muted">Upload and parse new schedule constraints PDF</p>
                  </div>
                </div>
                <Link href="/pdf-ingestion">
                  <button
                    className="bg-brand-deep text-white hover:bg-brand-mid font-bold text-[13px] px-5 py-2.5 rounded-[12px] transition-all flex items-center gap-1.5 shadow-md shadow-brand-blue/15"
                  >
                    <Plus className="w-4 h-4" /> Manage PDF Ingestions
                  </button>
                </Link>
              </div>

              {latestIngestion ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-muted mb-1">
                      <span className="capitalize">Latest Ingestion File: {latestIngestion.file_path.split('/').pop()}</span>
                      <span className="uppercase font-extrabold">{latestIngestion.status}</span>
                    </div>
                    <div className="h-2 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-brand transition-all duration-300 ${
                          latestIngestion.status === 'done' ? 'w-full' :
                          latestIngestion.status === 'failed' ? 'w-full bg-rose-500' :
                          latestIngestion.status === 'integrating' ? 'w-4/5' :
                          latestIngestion.status === 'parsing' ? 'w-1/2' : 'w-1/12'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="bg-[#0b0b0d] text-[#22c55e] p-4 rounded-[12px] font-mono text-[12px] space-y-1.5 max-h-[160px] overflow-y-auto">
                    <div className="flex items-center gap-2 text-white/50 border-b border-white/10 pb-1.5 mb-2 font-sans font-bold">
                      <Terminal className="w-4 h-4" />
                      Ingestion Details (Database Connected)
                    </div>
                    <p>Status: {latestIngestion.status}</p>
                    <p>Total Rows: {latestIngestion.rows_total || 0}</p>
                    <p>Created: {latestIngestion.rows_created || 0}</p>
                    <p>Matched: {latestIngestion.rows_matched || 0}</p>
                    <p>Failed: {latestIngestion.rows_failed || 0}</p>
                    {latestIngestion.error_log && latestIngestion.error_log.length > 0 && (
                      <div className="mt-2 text-rose-400">
                        <p className="font-sans font-bold">Errors found:</p>
                        {latestIngestion.error_log.map((log: any, i: number) => (
                          <p key={i}>Row {log.row}: {log.message}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted">
                  No timetable ingestion records found.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <UtilizationByDay utilization={utilization} />
            <EmptyRoomHeatmap emptyProb={emptyProb} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <UnderRunningTable courses={underRunning} />
            <AvgEmptyChart avgEmpty={avgEmpty} />
          </div>
        </div>
      )}

      {/* ─── PROFESSOR DIALOGS & DRAWERS ───────────────────────────── */}
      <Dialog open={showTasksModal} onOpenChange={setShowTasksModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">My Personal Task Checklist</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">Manage your daily operational chores.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 border border-line rounded-[12px]">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task.id)}
                    className="w-4.5 h-4.5 rounded border-line text-brand-deep focus:ring-brand-blue"
                  />
                  <span className={`text-[13px] font-semibold text-ink ${task.completed ? 'line-through text-muted' : ''}`}>{task.text}</span>
                </div>
                <button
                  onClick={() => handleRemoveTask(task.id)}
                  className="text-muted hover:text-error p-1 rounded hover:bg-slate-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="text-center text-muted font-medium py-6 text-[13px]">No tasks. Click Add to create one!</p>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 justify-end pt-3 border-t border-line">
            <button
              onClick={() => {
                const title = prompt('Enter task description:');
                if (title) handleAddTask(title);
              }}
              className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
            >
              Add New Task
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRemindersModal} onOpenChange={setShowRemindersModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">My Daily Reminders</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">Set timely alerts to organize meetings and invigilation confirmation.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-2.5 max-h-[200px] overflow-y-auto">
              {reminders.map((rem) => (
                <div key={rem.id} className="flex items-start gap-3 p-3 bg-[#f7f5fc] border border-[#f3e8ff] rounded-[12px]">
                  <Bell className="w-4.5 h-4.5 text-[#7c3aed] mt-0.5" />
                  <div>
                    <p className="text-[13px] font-extrabold text-ink leading-tight">{rem.text}</p>
                    <p className="text-[11px] font-semibold text-muted mt-1">{rem.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddReminder} className="border-t border-line pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11.5px] font-bold">Reminder Content</Label>
                  <Input
                    placeholder="Syllabus upload..."
                    value={newReminderText}
                    onChange={(e) => setNewReminderText(e.target.value)}
                    className="mt-1 text-[13px] h-9"
                  />
                </div>
                <div>
                  <Label className="text-[11.5px] font-bold">Time / Deadline</Label>
                  <Input
                    placeholder="e.g. 3:00 PM"
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                    className="mt-1 text-[13px] h-9"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-[#0b0b0d] text-white font-bold text-[13px] py-2 rounded-[12px] hover:bg-[#1c1c22]"
              >
                Create Reminder
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── COORDINATOR RESOLUTION DIALOG ─────────────────────────── */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">Resolve Room Conflict</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">Choose an alternative room slot to eliminate double booking.</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <div className="bg-rose-50/10 border border-rose-100 p-3 rounded-[12px]">
              <p className="text-[12px] font-extrabold text-error">Current Clash</p>
              <p className="text-[13px] font-semibold text-ink-soft mt-1">
                Room {conflicts[0]?.room?.room_number || 'TBD'} on {DAYS_SHORT[conflicts[0]?.day_of_week]} Period {conflicts[0]?.period} is double booked: {conflicts[0]?.details}.
              </p>
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Select Available Alternative Room</Label>
              <Select value={targetRoomForConflict} onValueChange={setTargetRoomForConflict}>
                <SelectTrigger className="mt-1.5 h-10 rounded-[10px]">
                  <SelectValue placeholder="Choose a free room..." />
                </SelectTrigger>
                <SelectContent>
                  {rooms
                    .filter((r) => r.id !== conflicts[0]?.room_id)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.room_number}>
                        Room {r.room_number} ({r.room_type})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 justify-end border-t border-line pt-3">
            <button
              onClick={() => setShowResolveDialog(false)}
              className="bg-white border border-line-2 text-ink-soft font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleResolveConflict}
              className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
            >
              Apply Resolution
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HOD Schedule Meeting Dialog */}
      <Dialog open={showScheduleMeetingModal} onOpenChange={setShowScheduleMeetingModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">Schedule Department Meeting</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">
              Create a new meeting. All department faculty members will see it on their dashboard in real-time.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScheduleMeetingSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-[12.5px] font-bold">Meeting Title</Label>
              <Input
                placeholder="e.g. Weekly Progress Review"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                className="mt-1 text-[13px] h-9"
                required
              />
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Time Description</Label>
              <Input
                placeholder="e.g. Today at 3:00 PM, or Friday at 11:00 AM"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="mt-1 text-[13px] h-9"
                required
              />
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Video Meeting URL (Optional)</Label>
              <Input
                placeholder="e.g. https://meet.google.com/abc-def-ghi"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="mt-1 text-[13px] h-9"
              />
            </div>
            <DialogFooter className="flex-row gap-2 justify-end border-t border-line pt-3 mt-4">
              <button
                type="button"
                onClick={() => setShowScheduleMeetingModal(false)}
                className="bg-white border border-line-2 text-ink-soft font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
              >
                Schedule Meeting
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Professor Request Swap Modal */}
      <Dialog open={showSwapRequestModal} onOpenChange={setShowSwapRequestModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">Request Class Swap</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">
              Submit a rescheduling swap request to the department HOD for approval.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSwapRequestSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-[12.5px] font-bold">Swap Details</Label>
              <textarea
                placeholder="e.g. Monday Period 2 → Tuesday Period 4 (Course CS302)"
                value={swapDetails}
                onChange={(e) => setSwapDetails(e.target.value)}
                className="mt-1 text-[13px] w-full min-h-[80px] p-3 border border-line rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-blue"
                required
              />
            </div>
            <DialogFooter className="flex-row gap-2 justify-end border-t border-line pt-3 mt-2">
              <button
                type="button"
                onClick={() => setShowSwapRequestModal(false)}
                className="bg-white border border-line-2 text-ink-soft font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
              >
                Submit Request
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Coordinator Assign Invigilator Duty Modal */}
      <Dialog open={showAssignDutyModal} onOpenChange={setShowAssignDutyModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">Assign Invigilator Duty</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">
              Assign exam invigilation duty to a faculty member.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignDutySubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-[12.5px] font-bold">Select Faculty Member</Label>
              <Select value={dutyFacultyId} onValueChange={setDutyFacultyId}>
                <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                  <SelectValue placeholder="Choose professor..." />
                </SelectTrigger>
                <SelectContent>
                  {allFaculty.map((fac) => (
                    <SelectItem key={fac.id} value={fac.id}>{fac.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Select Room Location</Label>
              <Select value={dutyRoomId} onValueChange={setDutyRoomId}>
                <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                  <SelectValue placeholder="Choose room..." />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((rm) => (
                    <SelectItem key={rm.id} value={rm.id}>Room {rm.room_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Time slot</Label>
              <Input
                placeholder="e.g. 10:00 am - 12:00 pm"
                value={dutyTime}
                onChange={(e) => setDutyTime(e.target.value)}
                className="mt-1 text-[13px] h-9"
                required
              />
            </div>
            <DialogFooter className="flex-row gap-2 justify-end border-t border-line pt-3 mt-4">
              <button
                type="button"
                onClick={() => setShowAssignDutyModal(false)}
                className="bg-white border border-line-2 text-ink-soft font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
              >
                Assign Duty
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Coordinator Create Faculty Follow-up Modal */}
      <Dialog open={showCreateFollowupModal} onOpenChange={setShowCreateFollowupModal}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-ink text-[18px]">Create Faculty Follow-up</DialogTitle>
            <DialogDescription className="text-[13px] text-muted">
              Create a follow-up or schedule request for a faculty member.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFollowupSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-[12.5px] font-bold">Select Faculty Member</Label>
              <Select value={followupFacultyId} onValueChange={setFollowupFacultyId}>
                <SelectTrigger className="mt-1 h-10 rounded-[10px]">
                  <SelectValue placeholder="Choose professor..." />
                </SelectTrigger>
                <SelectContent>
                  {allFaculty.map((fac) => (
                    <SelectItem key={fac.id} value={fac.id}>{fac.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12.5px] font-bold">Details</Label>
              <textarea
                placeholder="e.g. Missing Wednesday period 3 schedule"
                value={followupDetail}
                onChange={(e) => setFollowupDetail(e.target.value)}
                className="mt-1 text-[13px] w-full min-h-[80px] p-3 border border-line rounded-[10px] focus:outline-none focus:ring-2 focus:ring-brand-blue"
                required
              />
            </div>
            <DialogFooter className="flex-row gap-2 justify-end border-t border-line pt-3 mt-2">
              <button
                type="button"
                onClick={() => setShowCreateFollowupModal(false)}
                className="bg-white border border-line-2 text-ink-soft font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-brand-deep text-white font-bold text-[13px] px-4 py-2.5 rounded-[12px] hover:bg-brand-mid transition-all"
              >
                Create Follow-up
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
