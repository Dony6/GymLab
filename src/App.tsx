/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Play, Edit2, Save, Timer, Dumbbell, Search,
  X, FlaskConical, ChevronLeft, LayoutGrid, Image as ImageIcon,
  Trophy, Clock, Flame, History, Target, CheckCircle2,
  ChevronRight, Zap, BarChart3, StopCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Exercise {
  id: string;
  name: string;
  sets: number;
  kg: number;
  reps: string;
  restTime: number;
  notes: string;
  completedSets: boolean[];
  imageUrl?: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
  exercises: Exercise[];
  lastTrainedAt?: string;
  totalSessions: number;
}

interface SessionRecord {
  id: string;
  workoutId: string;
  workoutName: string;
  date: string;
  durationMs: number;
  setsCompleted: number;
  totalSets: number;
  exercisesCompleted: number;
  totalExercises: number;
}

type Mode = 'library' | 'editor' | 'training' | 'history' | 'complete';

function sanitizeImageUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const v = rawUrl.trim();
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/')) return v;
  return '';
}

function normalizeExercise(ex: any): Exercise {
  const sets = Number.isFinite(ex?.sets) ? Number(ex.sets) : 0;
  let completedSets: boolean[];
  if (Array.isArray(ex?.completedSets)) {
    completedSets = ex.completedSets.map(Boolean);
    while (completedSets.length < sets) completedSets.push(false);
    completedSets = completedSets.slice(0, sets);
  } else {
    completedSets = Array(sets).fill(Boolean(ex?.completed));
  }
  return {
    id: String(ex?.id ?? Math.random().toString(36).slice(2, 11)),
    name: String(ex?.name ?? ''),
    sets,
    kg: Number.isFinite(ex?.kg) ? Number(ex.kg) : 0,
    reps: String(ex?.reps ?? ''),
    restTime: Number.isFinite(ex?.restTime) ? Number(ex.restTime) : 60,
    notes: String(ex?.notes ?? ''),
    completedSets,
    imageUrl: sanitizeImageUrl(ex?.imageUrl),
  };
}

function normalizeWorkouts(input: unknown): WorkoutPlan[] {
  if (!Array.isArray(input)) return [];
  return input.map((w: any) => ({
    id: String(w?.id ?? Math.random().toString(36).slice(2, 11)),
    name: String(w?.name ?? 'Scheda'),
    exercises: Array.isArray(w?.exercises) ? w.exercises.map(normalizeExercise) : [],
    lastTrainedAt: w?.lastTrainedAt ?? undefined,
    totalSessions: Number.isFinite(w?.totalSessions) ? Number(w.totalSessions) : 0,
  }));
}

function normalizeSessions(input: unknown): SessionRecord[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s: any) => s?.id && s?.date);
}

function calculateStreak(sessions: SessionRecord[]): number {
  if (!sessions.length) return 0;
  const dates = [...new Set(sessions.map(s => s.date.slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function formatRelativeDate(iso?: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  if (diff < 7) return `${diff} giorni fa`;
  if (diff < 30) return `${Math.floor(diff / 7)} sett. fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return '< 1 min';
  return `${min} min`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('library');
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTimer, setActiveTimer] = useState<{ id: string; timeLeft: number } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [workoutToDelete, setWorkoutToDelete] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [completedSession, setCompletedSession] = useState<SessionRecord | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeWorkout = workouts.find(w => w.id === activeWorkoutId);
  const exercises = activeWorkout?.exercises ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem('gymlab-workouts');
      const oldSaved = localStorage.getItem('iron-track-workout');
      if (saved) {
        setWorkouts(normalizeWorkouts(JSON.parse(saved)));
      } else if (oldSaved) {
        const oldEx = JSON.parse(oldSaved);
        const migrated: WorkoutPlan = {
          id: 'migrated-1', name: 'Scheda Importata',
          exercises: Array.isArray(oldEx) ? oldEx.map(normalizeExercise) : [],
          totalSessions: 0,
        };
        setWorkouts([migrated]);
        localStorage.setItem('gymlab-workouts', JSON.stringify([migrated]));
      }
    } catch {
      toast.error('Dati locali corrotti: reset effettuato.');
      setWorkouts([]);
    }
    try {
      const s = localStorage.getItem('gymlab-sessions');
      if (s) setSessions(normalizeSessions(JSON.parse(s)));
    } catch { setSessions([]); }
  }, []);

  useEffect(() => { localStorage.setItem('gymlab-workouts', JSON.stringify(workouts)); }, [workouts]);
  useEffect(() => { localStorage.setItem('gymlab-sessions', JSON.stringify(sessions)); }, [sessions]);

  useEffect(() => {
    if (mode === 'training' && sessionStartTime) {
      elapsedRef.current = setInterval(() => setSessionElapsed(Date.now() - sessionStartTime), 1000);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [mode, sessionStartTime]);

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTimer && activeTimer.timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setActiveTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
      }, 1000);
    } else if (activeTimer && activeTimer.timeLeft === 0) {
      playBeep();
      toast.success('💪 Recupero finito! Avanti con la prossima serie.', { duration: 4000, position: 'top-center' });
      setActiveTimer(null);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeTimer, playBeep]);

  const createWorkout = () => {
    if (!newWorkoutName.trim()) return;
    const w: WorkoutPlan = {
      id: Math.random().toString(36).substr(2, 9),
      name: newWorkoutName, exercises: [], totalSessions: 0,
    };
    setWorkouts(prev => [...prev, w]);
    setActiveWorkoutId(w.id);
    setNewWorkoutName('');
    setIsCreateModalOpen(false);
    setMode('editor');
  };

  const confirmDeleteWorkout = () => {
    if (!workoutToDelete) return;
    setWorkouts(prev => prev.filter(w => w.id !== workoutToDelete));
    if (activeWorkoutId === workoutToDelete) { setActiveWorkoutId(null); setMode('library'); }
    setWorkoutToDelete(null);
    toast.success('Scheda eliminata');
  };

  const addExercise = () => {
    if (!activeWorkoutId) return;
    const ex: Exercise = {
      id: Math.random().toString(36).substr(2, 9),
      name: '', sets: 3, kg: 0, reps: '10', restTime: 60,
      notes: '', completedSets: [false, false, false],
    };
    setWorkouts(prev => prev.map(w => w.id === activeWorkoutId ? { ...w, exercises: [...w.exercises, ex] } : w));
  };

  const updateExercise = (id: string, updates: Partial<Exercise>) => {
    if (!activeWorkoutId) return;
    setWorkouts(prev => prev.map(w => {
      if (w.id !== activeWorkoutId) return w;
      return {
        ...w, exercises: w.exercises.map(ex => {
          if (ex.id !== id) return ex;
          const updated = { ...ex, ...updates };
          if ('sets' in updates && updates.sets !== ex.sets) {
            const n = updates.sets ?? ex.sets;
            const cs = [...ex.completedSets];
            while (cs.length < n) cs.push(false);
            updated.completedSets = cs.slice(0, n);
          }
          return updated;
        })
      };
    }));
  };

  const removeExercise = (id: string) => {
    if (!activeWorkoutId) return;
    setWorkouts(prev => prev.map(w =>
      w.id === activeWorkoutId ? { ...w, exercises: w.exercises.filter(ex => ex.id !== id) } : w
    ));
  };

  const toggleSet = (exerciseId: string, setIndex: number) => {
    if (!activeWorkoutId) return;
    const targetExercise = exercises.find(ex => ex.id === exerciseId);
    if (!targetExercise) return;
    const wasCompleted = Boolean(targetExercise.completedSets[setIndex]);
    const isCompletingNow = !wasCompleted;
    const restTime = targetExercise.restTime;

    setWorkouts(prev => prev.map(w => {
      if (w.id !== activeWorkoutId) return w;
      return {
        ...w, exercises: w.exercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          const cs = [...ex.completedSets];
          cs[setIndex] = !cs[setIndex];
          return { ...ex, completedSets: cs };
        })
      };
    }));

    if (isCompletingNow && restTime > 0) {
      setActiveTimer({ id: exerciseId, timeLeft: restTime });
    }
  };

  const startTraining = (workoutId: string) => {
    setWorkouts(prev => prev.map(w =>
      w.id === workoutId
        ? { ...w, exercises: w.exercises.map(ex => ({ ...ex, completedSets: Array(ex.sets).fill(false) })) }
        : w
    ));
    setActiveWorkoutId(workoutId);
    setSessionStartTime(Date.now());
    setSessionElapsed(0);
    setActiveTimer(null);
    setMode('training');
  };

  const finishSession = () => {
    if (!activeWorkout) return;
    const durationMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
    const totalSets = exercises.reduce((a, ex) => a + ex.sets, 0);
    const setsCompleted = exercises.reduce((a, ex) => a + ex.completedSets.filter(Boolean).length, 0);
    const exercisesCompleted = exercises.filter(ex => ex.completedSets.every(Boolean)).length;

    const record: SessionRecord = {
      id: Math.random().toString(36).substr(2, 9),
      workoutId: activeWorkout.id,
      workoutName: activeWorkout.name,
      date: new Date().toISOString(),
      durationMs,
      setsCompleted,
      totalSets,
      exercisesCompleted,
      totalExercises: exercises.length,
    };

    setSessions(prev => [record, ...prev]);
    setWorkouts(prev => prev.map(w =>
      w.id === activeWorkout.id
        ? { ...w, lastTrainedAt: new Date().toISOString(), totalSessions: (w.totalSessions || 0) + 1 }
        : w
    ));
    setCompletedSession(record);
    setActiveTimer(null);
    setSessionStartTime(null);
    setMode('complete');
  };

  const returnToLibrary = () => {
    setCompletedSession(null);
    setActiveWorkoutId(null);
    setMode('library');
  };

  const filteredExercises = exercises.filter(ex =>
    ex.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalSets = exercises.reduce((a, ex) => a + ex.sets, 0);
  const completedSetsCount = exercises.reduce((a, ex) => a + ex.completedSets.filter(Boolean).length, 0);
  const progressPct = totalSets > 0 ? (completedSetsCount / totalSets) * 100 : 0;
  const allDone = totalSets > 0 && completedSetsCount === totalSets;
  const streak = calculateStreak(sessions);

  return (
    <div className="min-h-screen text-white font-sans selection:bg-green-500/30 safe-bottom">
      <Toaster theme="dark" position="top-center" />

      {mode !== 'complete' && (
        <header className="sticky top-0 z-50 bg-[#070b0a]/80 backdrop-blur-xl border-b border-white/10 px-5 sm:px-7 pt-5 sm:pt-6 pb-3 sm:pb-3.5 flex items-center justify-between gap-3 safe-top">
          <div className="mt-1 sm:mt-1.5 flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none" onClick={() => { setActiveWorkoutId(null); setMode('library'); }}>
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-[#0b1310] ring-1 ring-white/10 p-1 flex items-center justify-center overflow-hidden shadow-[0_0_0_1px_rgba(34,197,94,0.12)]">
              <img src="/logo.png" alt="GymLab" className="h-full w-full object-contain"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            </div>
            <h1 className="text-[1.05rem] sm:text-[1.15rem] leading-none font-extrabold tracking-[0.02em] uppercase text-white">GYM<span className="text-green-500">LAB</span></h1>
          </div>

          <div className="flex items-center gap-2">
            {activeWorkoutId && mode !== 'history' && (
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/15">
                <button onClick={() => setMode('training')} className={cn('px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all touch-target', mode === 'training' ? 'bg-white/12 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}>
                  Allenamento
                </button>
                <button onClick={() => setMode('editor')} className={cn('px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all touch-target', mode === 'editor' ? 'bg-white/12 text-white shadow-sm' : 'text-white/50 hover:text-white/80')}>
                  Modifica
                </button>
              </div>
            )}
            {mode !== 'history' && (
              <button onClick={() => setMode('history')} className="p-2 soft-button rounded-xl touch-target" title="Storico sessioni">
                <History className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>
      )}

      <main className={cn('max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-32', mode === 'complete' && 'pt-0 pb-0')}>
        <AnimatePresence mode="wait">

          {/* LIBRARY */}
          {mode === 'library' && (
            <motion.div key="library" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              {sessions.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Flame, value: streak, label: 'Streak', color: streak > 0 ? 'text-orange-400' : 'text-white/20' },
                    { icon: BarChart3, value: sessions.length, label: 'Sessioni', color: 'text-green-500' },
                    { icon: Target, value: sessions.reduce((a, s) => a + s.setsCompleted, 0), label: 'Serie tot.', color: 'text-blue-400' },
                  ].map(({ icon: Icon, value, label, color }) => (
                    <div key={label} className="glass-card rounded-2xl p-3 flex flex-col items-center justify-center gap-1">
                      <Icon className={cn('w-5 h-5', color)} />
                      <span className="text-lg font-black">{value}</span>
                      <span className="text-[10px] uppercase tracking-widest muted-text">{label}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none">Le mie schede</h2>
                <button onClick={() => setIsCreateModalOpen(true)} className="primary-button h-11 w-11 sm:h-12 sm:w-12 rounded-xl touch-target flex items-center justify-center">
                  <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="grid gap-4">
                {workouts.length === 0 ? (
                  <div className="text-center py-20 glass-card rounded-3xl space-y-4">
                    <LayoutGrid className="w-12 h-12 text-white/10 mx-auto" />
                    <p className="muted-text">Nessuna scheda creata. Inizia ora!</p>
                    <button onClick={() => setIsCreateModalOpen(true)} className="primary-button px-6 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Crea scheda
                    </button>
                  </div>
                ) : (
                  workouts.map(workout => {
                    const wSessions = sessions.filter(s => s.workoutId === workout.id);
                    return (
                      <div key={workout.id} className="group glass-card p-4 sm:p-5 rounded-3xl transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors flex-shrink-0">
                            <Dumbbell className="w-6 h-6 text-green-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-lg font-bold truncate">{workout.name}</h3>
                              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-green-500 transition-colors flex-shrink-0" />
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className="text-sm muted-text">{workout.exercises.length} esercizi</span>
                              {workout.totalSessions > 0 && <span className="text-[11px] muted-text">· {workout.totalSessions} sessioni</span>}
                              {workout.lastTrainedAt && <span className="text-[11px] text-green-500/70">· {formatRelativeDate(workout.lastTrainedAt)}</span>}
                            </div>
                          </div>
                        </div>

                        {wSessions.length > 0 && (() => {
                          const last = wSessions[0];
                          const pct = last.totalSets > 0 ? (last.setsCompleted / last.totalSets) * 100 : 0;
                          return (
                            <div className="mt-3 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500/40 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] muted-text">{last.setsCompleted}/{last.totalSets} serie</span>
                            </div>
                          );
                        })()}

                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          <button onClick={() => startTraining(workout.id)} className="flex-1 py-2 primary-button rounded-xl font-bold text-sm flex items-center justify-center gap-1.5">
                            <Play className="w-4 h-4 fill-current" /> Allenati
                          </button>
                          <button onClick={() => { setActiveWorkoutId(workout.id); setMode('editor'); }} className="p-2 soft-button rounded-xl touch-target">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setWorkoutToDelete(workout.id)} className="p-2 soft-button rounded-xl touch-target text-white/30 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* EDITOR */}
          {mode === 'editor' && (
            <motion.div key="editor" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setMode('library')} className="p-2 soft-button rounded-xl touch-target">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {activeWorkout?.name}
                    <span className="text-white/30 text-xs sm:text-sm font-normal ml-2">Modifica</span>
                  </h2>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input type="text" placeholder="Cerca esercizi..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-11 pr-11 py-3 text-sm focus:border-green-500/60 outline-none transition-all" />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {filteredExercises.map(ex => {
                  const originalIndex = exercises.findIndex(e => e.id === ex.id);
                  return (
                    <div key={ex.id} className="glass-card p-4 sm:p-5 rounded-2xl space-y-4 relative group">
                      <button onClick={() => removeExercise(ex.id)} className="absolute top-4 right-4 text-white/20 hover:text-red-500 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-green-500 font-mono text-sm">#{originalIndex + 1}</span>
                        <input type="text" placeholder="Nome esercizio (es. Panca Piana)" value={ex.name}
                          onChange={e => updateExercise(ex.id, { name: e.target.value })}
                          className="bg-transparent border-none text-lg font-bold focus:ring-0 p-0 w-full placeholder:text-white/20" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        {([
                          { label: 'Serie', key: 'sets', type: 'number' },
                          { label: 'Kg', key: 'kg', type: 'number' },
                          { label: 'Ripetizioni', key: 'reps', type: 'text' },
                          { label: 'Recupero (s)', key: 'restTime', type: 'number' },
                        ] as const).map(({ label, key, type }) => (
                          <div key={key} className="space-y-1">
                            <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{label}</label>
                            <input type={type} value={ex[key as keyof Exercise] as any}
                              onChange={e => updateExercise(ex.id, {
                                [key]: type === 'number' ? (key === 'kg' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0) : e.target.value
                              })}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-green-500/50 outline-none transition-colors" />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Note</label>
                        <textarea placeholder="Note (opzionale)" value={ex.notes} onChange={e => updateExercise(ex.id, { notes: e.target.value })}
                          rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-green-500/50 outline-none transition-all resize-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Immagine Esercizio</label>
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input type="text" placeholder="URL immagine (opzionale)" value={ex.imageUrl || ''}
                            onChange={e => {
                              const sanitized = sanitizeImageUrl(e.target.value);
                              if (e.target.value && !sanitized) { toast.error('URL non valido.'); return; }
                              updateExercise(ex.id, { imageUrl: sanitized });
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-green-500/50 outline-none transition-all" />
                        </div>
                        {ex.imageUrl && (
                          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 mt-2 group/img">
                            <img src={ex.imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button onClick={() => updateExercise(ex.id, { imageUrl: '' })} className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={addExercise} className="w-full py-4 border-2 border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-white/60 hover:text-white hover:border-green-500/40 transition-all">
                <Plus className="w-5 h-5" /> Aggiungi Esercizio
              </button>
              <button onClick={() => { setMode('training'); toast.success('Scheda salvata!'); }}
                className="w-full py-4 primary-button rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2">
                <Save className="w-5 h-5" /> Salva Scheda
              </button>
            </motion.div>
          )}

          {/* TRAINING */}
          {mode === 'training' && (
            <motion.div key="training" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                  <button onClick={() => setMode('library')} className="p-2 soft-button rounded-xl touch-target">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{activeWorkout?.name}</h2>
                    <p className="muted-text text-sm">{completedSetsCount}/{totalSets} serie · {formatMs(sessionElapsed)}</p>
                  </div>
                </div>
                <button onClick={() => setMode('editor')} className="p-2 soft-button rounded-xl touch-target">
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>

              {totalSets > 0 && (
                <div className="space-y-1.5">
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full"
                      initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] muted-text">{Math.round(progressPct)}% completato</span>
                    {allDone && <span className="text-[10px] text-green-400 font-bold">🎉 Tutto completato!</span>}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {activeTimer && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="glass-card rounded-2xl p-4 flex items-center justify-between border border-green-500/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                          <Timer className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-xs muted-text uppercase tracking-widest font-bold">Recupero in corso</p>
                          <motion.p key={activeTimer.timeLeft} initial={{ scale: 1.15 }} animate={{ scale: 1 }}
                            className="text-2xl font-black tabular-nums text-green-400">{activeTimer.timeLeft}s</motion.p>
                        </div>
                      </div>
                      <button onClick={() => setActiveTimer(null)} className="p-2 soft-button rounded-xl text-white/40 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {exercises.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Dumbbell className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-white/40">Nessun esercizio. Vai in Modifica per iniziare.</p>
                  <button onClick={() => setMode('editor')} className="text-green-500 font-bold hover:underline">Apri Modifica</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {exercises.map(ex => {
                    const exDone = ex.completedSets.every(Boolean) && ex.sets > 0;
                    return (
                      <motion.div key={ex.id} layout className={cn('glass-card rounded-2xl overflow-hidden transition-all duration-300', exDone && 'opacity-60')}>
                        <div className="flex">
                          <div className="w-20 sm:w-24 flex-shrink-0 bg-white/5 relative cursor-zoom-in group/thumb self-stretch"
                            onClick={() => ex.imageUrl && setPreviewImage({ url: ex.imageUrl, name: ex.name })}>
                            {ex.imageUrl ? (
                              <img src={ex.imageUrl} alt={ex.name} className="w-full h-full object-cover transition-transform group-hover/thumb:scale-110 absolute inset-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-white/5 min-h-[5.5rem]">
                                <Dumbbell className="w-8 h-8 text-white/10" />
                              </div>
                            )}
                            {activeTimer?.id === ex.id && (
                              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-green-600/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                <motion.span key={activeTimer.timeLeft} initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                  className="text-3xl font-black text-white tabular-nums">{activeTimer.timeLeft}</motion.span>
                                <span className="text-[8px] uppercase font-bold tracking-tighter text-white/80">Rest</span>
                              </motion.div>
                            )}
                            {exDone && (
                              <div className="absolute inset-0 bg-green-900/60 flex items-center justify-center z-10">
                                <CheckCircle2 className="w-8 h-8 text-green-400" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 p-3 sm:p-4 flex flex-col gap-2.5">
                            <div>
                              <h3 className="font-bold leading-tight">{ex.name || 'Esercizio senza nome'}</h3>
                              <p className="text-[10px] muted-text font-bold uppercase tracking-widest mt-0.5">
                                {ex.reps} rip{ex.kg > 0 ? ` · ${ex.kg} kg` : ''}{ex.restTime > 0 ? ` · ${ex.restTime}s rec.` : ''}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {Array.from({ length: ex.sets }).map((_, i) => (
                                <button key={i} onClick={() => toggleSet(ex.id, i)}
                                  className={cn(
                                    'w-9 h-9 rounded-xl font-bold text-sm transition-all active:scale-90 touch-target flex items-center justify-center',
                                    ex.completedSets[i]
                                      ? 'bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                                      : 'bg-white/5 border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
                                  )}>
                                  {ex.completedSets[i] ? <CheckCircle2 className="w-4 h-4" /> : <span>{i + 1}</span>}
                                </button>
                              ))}
                              <span className="text-[10px] muted-text ml-1">
                                {ex.completedSets.filter(Boolean).length}/{ex.sets}
                              </span>
                            </div>

                            {ex.notes && <p className="text-[11px] text-white/30 italic leading-relaxed">{ex.notes}</p>}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* HISTORY */}
          {mode === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div className="flex items-center gap-4">
                <button onClick={() => setMode('library')} className="p-2 soft-button rounded-xl touch-target">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Storico</h2>
                  <p className="text-sm muted-text">{sessions.length} sessioni totali</p>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-3xl space-y-3">
                  <History className="w-12 h-12 text-white/10 mx-auto" />
                  <p className="muted-text">Nessuna sessione registrata.</p>
                  <p className="text-sm text-white/20">Completa il tuo primo allenamento!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s, i) => {
                    const pct = s.totalSets > 0 ? (s.setsCompleted / s.totalSets) * 100 : 0;
                    return (
                      <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold">{s.workoutName}</h3>
                            <p className="text-[11px] muted-text mt-0.5">
                              {new Date(s.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest font-bold text-green-500/70 bg-green-500/10 px-2 py-1 rounded-lg flex-shrink-0">
                            {formatRelativeDate(s.date)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { icon: Clock, value: formatDuration(s.durationMs), label: 'Durata' },
                            { icon: Target, value: `${s.setsCompleted}/${s.totalSets}`, label: 'Serie' },
                            { icon: Dumbbell, value: `${s.exercisesCompleted}/${s.totalExercises}`, label: 'Esercizi' },
                          ].map(({ icon: Icon, value, label }) => (
                            <div key={label} className="bg-white/5 rounded-xl p-2.5 text-center">
                              <Icon className="w-3.5 h-3.5 text-white/30 mx-auto mb-1" />
                              <p className="text-sm font-bold">{value}</p>
                              <p className="text-[9px] muted-text uppercase tracking-wider">{label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* COMPLETE */}
          {mode === 'complete' && completedSession && (
            <motion.div key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 bg-[#070b0a]"
              style={{ background: 'radial-gradient(circle at 50% 35%, rgba(34,197,94,0.12), transparent 55%), #070b0a' }}>

              <motion.div initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(34,197,94,0.35)]">
                <Trophy className="w-12 h-12 text-white" />
              </motion.div>

              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="text-4xl sm:text-5xl font-black text-center mb-2">Ottimo lavoro!</motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                className="muted-text text-center mb-8">
                {completedSession.workoutName} · {new Date(completedSession.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="grid grid-cols-2 gap-4 w-full max-w-xs mb-10">
                {[
                  { icon: Clock, label: 'Durata', value: formatDuration(completedSession.durationMs), color: 'text-blue-400' },
                  { icon: Target, label: 'Serie', value: `${completedSession.setsCompleted}/${completedSession.totalSets}`, color: 'text-green-400' },
                  { icon: Dumbbell, label: 'Esercizi', value: `${completedSession.exercisesCompleted}/${completedSession.totalExercises}`, color: 'text-purple-400' },
                  { icon: Zap, label: 'Sessione n°', value: String(workouts.find(w => w.id === completedSession.workoutId)?.totalSessions ?? 1), color: 'text-orange-400' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="glass-card rounded-2xl p-4 flex flex-col items-center gap-2">
                    <Icon className={cn('w-5 h-5', color)} />
                    <span className="text-xl font-black">{value}</span>
                    <span className="text-[10px] uppercase tracking-widest muted-text">{label}</span>
                  </div>
                ))}
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="w-full max-w-xs space-y-3">
                <button onClick={returnToLibrary} className="w-full py-4 primary-button rounded-2xl font-bold text-lg flex items-center justify-center gap-2">
                  <LayoutGrid className="w-5 h-5" /> Le mie schede
                </button>
                <button onClick={() => setMode('history')} className="w-full py-3 soft-button rounded-2xl font-semibold text-sm flex items-center justify-center gap-2">
                  <History className="w-4 h-4" /> Vedi storico
                </button>
              </motion.div>

              {streak > 1 && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}
                  className="mt-6 flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 rounded-full px-4 py-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-bold text-orange-300">{streak} giorni di fila! 🔥</span>
                </motion.div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FAB - Termina Sessione */}
      {mode === 'training' && exercises.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            {completedSetsCount > 0 ? (
              <button onClick={finishSession} className="w-full py-3.5 sm:py-4 primary-button rounded-2xl font-bold text-base sm:text-lg transition-all flex items-center justify-center gap-2 touch-target">
                <StopCircle className="w-5 h-5" />
                {allDone ? '🎉 Termina sessione' : `Termina (${completedSetsCount}/${totalSets} serie)`}
              </button>
            ) : (
              <div className="w-full py-3.5 sm:py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-base text-white/30 flex items-center justify-center gap-2">
                <Play className="w-5 h-5" /> Tocca una serie per iniziare
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl compact-landscape">
              <h3 className="text-xl font-bold">Nuova Scheda</h3>
              <input autoFocus type="text" placeholder="Nome della scheda..." value={newWorkoutName}
                onChange={e => setNewWorkoutName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createWorkout()}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 outline-none focus:border-green-500/60 transition-all" />
              <div className="flex gap-3">
                <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 soft-button rounded-xl font-bold transition-all touch-target">Annulla</button>
                <button onClick={createWorkout} className="flex-1 py-3 primary-button rounded-xl font-bold transition-all touch-target">Crea</button>
              </div>
            </motion.div>
          </div>
        )}

        {workoutToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl compact-landscape">
              <h3 className="text-xl font-bold">Elimina Scheda</h3>
              <p className="muted-text">Sei sicuro? Questa azione non può essere annullata.</p>
              <div className="flex gap-3">
                <button onClick={() => setWorkoutToDelete(null)} className="flex-1 py-3 soft-button rounded-xl font-bold transition-all touch-target">Annulla</button>
                <button onClick={confirmDeleteWorkout} className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-all">Elimina</button>
              </div>
            </motion.div>
          </div>
        )}

        {previewImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl cursor-zoom-out" onClick={() => setPreviewImage(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-lg w-full aspect-square rounded-3xl overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
              <img src={previewImage.url} alt={previewImage.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-2xl font-bold text-white">{previewImage.name}</h3>
              </div>
              <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
