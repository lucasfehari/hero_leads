import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, Image, Video, AlertCircle, CheckCircle } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000/api/ig';

const STATUS_COLORS = {
    scheduled: 'bg-blue-500/80 border-blue-400/60',
    draft: 'bg-slate-600/80 border-slate-400/60',
    publishing: 'bg-yellow-500/80 border-yellow-400/60',
    published: 'bg-emerald-500/80 border-emerald-400/60',
    error: 'bg-red-500/80 border-red-400/60',
};

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay(); // 0=Sun
}
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ── Draggable Post Chip ────────────────────────────────────────────────────
function PostChip({ post, onEdit, onDragStart }) {
    const colorClass = STATUS_COLORS[post.status] || STATUS_COLORS.draft;
    const time = post.scheduled_at ? new Date(post.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('postId', String(post.id)); onDragStart && onDragStart(post); }}
            onClick={() => onEdit(post)}
            title={`${post.account_name || ''} — ${post.caption?.slice(0, 60) || '(sem legenda)'}`}
            className={`cursor-pointer select-none rounded-md px-2 py-0.5 text-white text-xs font-medium border ${colorClass} flex items-center gap-1 truncate hover:brightness-125 transition-all`}
        >
            {post.media_type === 'video' ? <Video className="w-3 h-3 shrink-0" /> : <Image className="w-3 h-3 shrink-0" />}
            <span className="truncate">{time && <span className="opacity-75 mr-1">{time}</span>}{post.account_name || 'Post'}</span>
        </div>
    );
}

// ── Monthly Calendar ───────────────────────────────────────────────────────
function MonthlyView({ year, month, posts, onEdit, onReschedule }) {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const [draggingOver, setDraggingOver] = useState(null);

    const postsByDay = {};
    posts.forEach(p => {
        if (!p.scheduled_at) return;
        const d = new Date(p.scheduled_at);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const day = d.getDate();
            if (!postsByDay[day]) postsByDay[day] = [];
            postsByDay[day].push(p);
        }
    });

    const handleDrop = useCallback((e, day) => {
        e.preventDefault();
        const postId = Number(e.dataTransfer.getData('postId'));
        const post = posts.find(p => p.id === postId);
        if (!post || !postId) return;

        const existingTime = post.scheduled_at ? new Date(post.scheduled_at) : new Date();
        const newDate = new Date(year, month, day, existingTime.getHours(), existingTime.getMinutes());
        onReschedule(postId, newDate.toISOString().slice(0, 19).replace('T', ' '));
        setDraggingOver(null);
    }, [posts, year, month, onReschedule]);

    const today = new Date();

    return (
        <div className="overflow-x-auto">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
                {WEEKDAYS.map(d => (
                    <div key={d} className="text-center text-slate-500 text-xs font-bold py-2">{d}</div>
                ))}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-7 gap-1">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[90px] rounded-lg bg-slate-900/20" />
                ))}
                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                    const dayPosts = postsByDay[day] || [];
                    const isOver = draggingOver === day;

                    return (
                        <div
                            key={day}
                            onDragOver={e => { e.preventDefault(); setDraggingOver(day); }}
                            onDragLeave={() => setDraggingOver(null)}
                            onDrop={e => handleDrop(e, day)}
                            className={`min-h-[90px] rounded-lg p-1.5 flex flex-col gap-1 transition-all border ${isOver
                                    ? 'border-purple-500/60 bg-purple-500/10'
                                    : isToday
                                        ? 'border-purple-500/30 bg-purple-950/30'
                                        : 'border-white/5 bg-slate-900/30 hover:bg-slate-900/50'
                                }`}
                        >
                            <span className={`text-xs font-bold self-end px-1.5 py-0.5 rounded-full ${isToday ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                                {day}
                            </span>
                            {dayPosts.slice(0, 3).map(post => (
                                <PostChip key={post.id} post={post} onEdit={onEdit} />
                            ))}
                            {dayPosts.length > 3 && (
                                <span className="text-xs text-slate-500 px-1">+{dayPosts.length - 3} mais</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Weekly Calendar ────────────────────────────────────────────────────────
function WeeklyView({ weekStart, posts, onEdit, onReschedule }) {
    const [draggingOverSlot, setDraggingOverSlot] = useState(null);
    const HOURS = Array.from({ length: 24 }, (_, i) => i);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    });

    const today = new Date();

    const postsBySlot = {};
    posts.forEach(p => {
        if (!p.scheduled_at) return;
        const d = new Date(p.scheduled_at);
        days.forEach((day, di) => {
            if (d.toDateString() === day.toDateString()) {
                const key = `${di}-${d.getHours()}`;
                if (!postsBySlot[key]) postsBySlot[key] = [];
                postsBySlot[key].push(p);
            }
        });
    });

    const handleDrop = useCallback((e, day, hour) => {
        e.preventDefault();
        const postId = Number(e.dataTransfer.getData('postId'));
        if (!postId) return;
        const newDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0);
        onReschedule(postId, newDate.toISOString().slice(0, 19).replace('T', ' '));
        setDraggingOverSlot(null);
    }, [onReschedule]);

    return (
        <div className="overflow-auto" style={{ maxHeight: '600px' }}>
            <div className="min-w-[700px]">
                {/* Day headers */}
                <div className="grid sticky top-0 z-10 bg-slate-950/90 backdrop-blur-sm" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                    <div />
                    {days.map((day, i) => {
                        const isToday = day.toDateString() === today.toDateString();
                        return (
                            <div key={i} className={`text-center py-2 px-1 text-xs font-bold border-b border-white/5 ${isToday ? 'text-purple-400' : 'text-slate-400'}`}>
                                <div>{WEEKDAYS[day.getDay()]}</div>
                                <div className={`text-lg font-bold ${isToday ? 'text-purple-300' : 'text-white'}`}>{day.getDate()}</div>
                            </div>
                        );
                    })}
                </div>
                {/* Hour rows */}
                {HOURS.map(hour => (
                    <div key={hour} className="grid border-b border-white/5" style={{ gridTemplateColumns: '48px repeat(7, 1fr)', minHeight: '56px' }}>
                        <div className="text-xs text-slate-600 text-right pr-2 pt-1 select-none">{String(hour).padStart(2, '0')}:00</div>
                        {days.map((day, di) => {
                            const key = `${di}-${hour}`;
                            const slotPosts = postsBySlot[key] || [];
                            const isOver = draggingOverSlot === key;
                            return (
                                <div
                                    key={di}
                                    onDragOver={e => { e.preventDefault(); setDraggingOverSlot(key); }}
                                    onDragLeave={() => setDraggingOverSlot(null)}
                                    onDrop={e => handleDrop(e, day, hour)}
                                    className={`border-l border-white/5 p-0.5 flex flex-col gap-0.5 transition-all ${isOver ? 'bg-purple-500/10' : 'hover:bg-white/2'}`}
                                >
                                    {slotPosts.map(post => (
                                        <PostChip key={post.id} post={post} onEdit={onEdit} />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main Calendar Component ────────────────────────────────────────────────
export default function InstagramCalendar({ posts, accounts, onEdit, onReschedule }) {
    const today = new Date();
    const [view, setView] = useState('month'); // 'month' | 'week'
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date(today);
        d.setDate(d.getDate() - d.getDay()); // Start on Sunday
        return d;
    });

    const goMonthPrev = () => {
        if (month === 0) { setYear(y => y - 1); setMonth(11); }
        else setMonth(m => m - 1);
    };
    const goMonthNext = () => {
        if (month === 11) { setYear(y => y + 1); setMonth(0); }
        else setMonth(m => m + 1);
    };
    const goWeekPrev = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
    const goWeekNext = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
    const goToday = () => {
        setYear(today.getFullYear());
        setMonth(today.getMonth());
        const d = new Date(today);
        d.setDate(d.getDate() - d.getDay());
        setWeekStart(d);
    };

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Legend
    const legend = [
        { label: 'Agendado', color: 'bg-blue-500' },
        { label: 'Rascunho', color: 'bg-slate-500' },
        { label: 'Publicando', color: 'bg-yellow-500' },
        { label: 'Publicado', color: 'bg-emerald-500' },
        { label: 'Erro', color: 'bg-red-500' },
    ];

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                {/* View toggle */}
                <div className="flex gap-1 bg-slate-900/60 p-1 rounded-xl">
                    <button onClick={() => setView('month')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'month' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Mês</button>
                    <button onClick={() => setView('week')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'week' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Semana</button>
                </div>

                {/* Navigation */}
                <button onClick={view === 'month' ? goMonthPrev : goWeekPrev} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-white font-semibold min-w-[160px] text-center">
                    {view === 'month'
                        ? `${MONTHS[month]} ${year}`
                        : `${weekStart.getDate()}/${weekStart.getMonth() + 1} – ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}/${weekEnd.getFullYear()}`
                    }
                </span>
                <button onClick={view === 'month' ? goMonthNext : goWeekNext} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                    <ChevronRight className="w-5 h-5" />
                </button>
                <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-all">Hoje</button>

                {/* Legend */}
                <div className="flex-1" />
                <div className="flex items-center gap-3 flex-wrap">
                    {legend.map(l => (
                        <span key={l.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                            <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />{l.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Hint */}
            <p className="text-slate-600 text-xs">💡 Arraste e solte os posts entre os dias/horários para reagendar.</p>

            {/* Calendar grid */}
            {view === 'month' ? (
                <MonthlyView
                    year={year}
                    month={month}
                    posts={posts}
                    onEdit={onEdit}
                    onReschedule={onReschedule}
                />
            ) : (
                <WeeklyView
                    weekStart={weekStart}
                    posts={posts}
                    onEdit={onEdit}
                    onReschedule={onReschedule}
                />
            )}
        </div>
    );
}
