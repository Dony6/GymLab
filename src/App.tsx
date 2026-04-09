/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Play, 
  Edit2, 
  Save, 
  CheckCircle2, 
  Timer, 
  Dumbbell, 
  Search,
  X,
  FlaskConical,
  ChevronLeft,
  LayoutGrid,
  Image as ImageIcon,
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
  reps: string;
  restTime: number;
  completed: boolean;
  imageUrl?: string;
}

interface WorkoutPlan {
  id: string;
  name: string;
  exercises: Exercise[];
}

type Mode = 'library' | 'editor' | 'training';

export default function App() {
  const [mode, setMode] = useState<Mode>('library');
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTimer, setActiveTimer] = useState<{ id: string; timeLeft: number } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [workoutToDelete, setWorkoutToDelete] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeWorkout = workouts.find(w => w.id === activeWorkoutId);
  const exercises = activeWorkout?.exercises || [];

  // Load from LocalStorage and Migrate
  useEffect(() => {
    const saved = localStorage.getItem('gymlab-workouts');
    const oldSaved = localStorage.getItem('iron-track-workout');

    if (saved) {
      setWorkouts(JSON.parse(saved));
    } else if (oldSaved) {
      // Migrate old data
      const oldExercises = JSON.parse(oldSaved);
      const migratedWorkout: WorkoutPlan = {
        id: 'migrated-1',
        name: 'Scheda Importata',
        exercises: oldExercises
      };
      setWorkouts([migratedWorkout]);
      localStorage.setItem('gymlab-workouts', JSON.stringify([migratedWorkout]));
      // Don't remove old key yet just to be safe, but we could:
      // localStorage.removeItem('iron-track-workout');
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('gymlab-workouts', JSON.stringify(workouts));
  }, [workouts]);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.error('Audio alert failed', e);
    }
  };

  // Timer logic
  useEffect(() => {
    if (activeTimer && activeTimer.timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setActiveTimer(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
      }, 1000);
    } else if (activeTimer && activeTimer.timeLeft === 0) {
      playBeep();
      toast.success('Rest time over! Get back to work!', {
        duration: 5000,
        position: 'top-center',
      });
      setActiveTimer(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeTimer]);

  const createWorkout = () => {
    if (!newWorkoutName.trim()) return;
    
    const newWorkout: WorkoutPlan = {
      id: Math.random().toString(36).substr(2, 9),
      name: newWorkoutName,
      exercises: []
    };
    setWorkouts([...workouts, newWorkout]);
    setActiveWorkoutId(newWorkout.id);
    setNewWorkoutName('');
    setIsCreateModalOpen(false);
    setMode('editor');
  };

  const confirmDeleteWorkout = () => {
    if (!workoutToDelete) return;
    setWorkouts(workouts.filter(w => w.id !== workoutToDelete));
    if (activeWorkoutId === workoutToDelete) {
      setActiveWorkoutId(null);
      setMode('library');
    }
    setWorkoutToDelete(null);
    toast.success('Scheda eliminata');
  };

  const addExercise = () => {
    if (!activeWorkoutId) return;
    const newEx: Exercise = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      sets: 3,
      reps: '10',
      restTime: 60,
      completed: false
    };
    
    setWorkouts(workouts.map(w => 
      w.id === activeWorkoutId 
        ? { ...w, exercises: [...w.exercises, newEx] }
        : w
    ));
  };

  const updateExercise = (id: string, updates: Partial<Exercise>) => {
    if (!activeWorkoutId) return;
    setWorkouts(workouts.map(w => 
      w.id === activeWorkoutId 
        ? { ...w, exercises: w.exercises.map(ex => ex.id === id ? { ...ex, ...updates } : ex) }
        : w
    ));
  };

  const removeExercise = (id: string) => {
    if (!activeWorkoutId) return;
    setWorkouts(workouts.map(w => 
      w.id === activeWorkoutId 
        ? { ...w, exercises: w.exercises.filter(ex => ex.id !== id) }
        : w
    ));
  };

  const toggleComplete = (id: string) => {
    if (!activeWorkoutId) return;
    setWorkouts(workouts.map(w => 
      w.id === activeWorkoutId 
        ? { ...w, exercises: w.exercises.map(ex => ex.id === id ? { ...ex, completed: !ex.completed } : ex) }
        : w
    ));
  };

  const startRest = (id: string, time: number) => {
    setActiveTimer({ id, timeLeft: time });
  };

  const filteredExercises = exercises.filter(ex => 
    ex.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen text-white font-sans selection:bg-green-500/30 safe-bottom">
      <Toaster theme="dark" position="top-center" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#070b0a]/75 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 safe-top">
        <div 
          className="flex items-center gap-3 sm:gap-4 cursor-pointer"
          onClick={() => setMode('library')}
        >
          <img 
            src="/logo.png" 
            alt="GymLab" 
            className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl object-cover shadow-md shadow-black/25 ring-1 ring-white/20"
            onError={(e) => {
              // Fallback if image is not uploaded yet
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="hidden w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-600/20">
            <FlaskConical className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-white">GYM<span className="text-green-500">LAB</span></h1>
        </div>
        
        {activeWorkoutId && (
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/15">
            <button 
              onClick={() => setMode('training')}
              className={cn(
                "px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all touch-target",
                mode === 'training' ? "bg-white/12 text-white shadow-sm" : "text-white/50 hover:text-white/80"
              )}
            >
              Training
            </button>
            <button 
              onClick={() => setMode('editor')}
              className={cn(
                "px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all touch-target",
                mode === 'editor' ? "bg-white/12 text-white shadow-sm" : "text-white/50 hover:text-white/80"
              )}
            >
              Editor
            </button>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32">
        <AnimatePresence mode="wait">
          {mode === 'library' ? (
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Le mie schede</h2>
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="primary-button p-2 rounded-xl touch-target"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="grid gap-4">
                {workouts.length === 0 ? (
                  <div className="text-center py-20 glass-card rounded-3xl">
                    <LayoutGrid className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="muted-text">Nessuna scheda creata. Inizia ora!</p>
                  </div>
                ) : (
                  workouts.map(workout => (
                    <div 
                      key={workout.id}
                      onClick={() => {
                        setActiveWorkoutId(workout.id);
                        setMode('training');
                      }}
                      className="group glass-card p-4 sm:p-6 rounded-3xl transition-all cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                          <Dumbbell className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{workout.name}</h3>
                          <p className="text-sm muted-text">{workout.exercises.length} esercizi</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveWorkoutId(workout.id);
                            setMode('editor');
                          }}
                          className="p-2 text-white/30 hover:text-white/80 transition-colors touch-target"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkoutToDelete(workout.id);
                          }}
                          className="p-2 text-white/30 hover:text-red-400 transition-colors touch-target"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : mode === 'editor' ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setMode('library')}
                    className="p-2 soft-button rounded-xl touch-target"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{activeWorkout?.name} <span className="text-white/30 text-xs sm:text-sm font-normal ml-2">Editor</span></h2>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input 
                    type="text"
                    placeholder="Search exercises..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-11 pr-11 py-3 text-sm focus:border-green-500/60 outline-none transition-all"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {filteredExercises.map((ex) => {
                  const originalIndex = exercises.findIndex(e => e.id === ex.id);
                  return (
                    <div key={ex.id} className="glass-card p-4 sm:p-5 rounded-2xl space-y-4 relative group">
                      <button 
                        onClick={() => removeExercise(ex.id)}
                        className="absolute top-4 right-4 text-white/20 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-green-500 font-mono text-sm">#{originalIndex + 1}</span>
                        <input 
                          type="text"
                          placeholder="Exercise Name (e.g. Bench Press)"
                          value={ex.name}
                          onChange={(e) => updateExercise(ex.id, { name: e.target.value })}
                          className="bg-transparent border-none text-lg font-bold focus:ring-0 p-0 w-full placeholder:text-white/20"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Sets</label>
                          <input 
                            type="number"
                            value={ex.sets}
                            onChange={(e) => updateExercise(ex.id, { sets: parseInt(e.target.value) || 0 })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-green-500/50 outline-none transition-colors"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Reps</label>
                          <input 
                            type="text"
                            value={ex.reps}
                            onChange={(e) => updateExercise(ex.id, { reps: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-green-500/50 outline-none transition-colors"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Rest (s)</label>
                          <input 
                            type="number"
                            value={ex.restTime}
                            onChange={(e) => updateExercise(ex.id, { restTime: parseInt(e.target.value) || 0 })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-green-500/50 outline-none transition-colors"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Immagine Esercizio</label>
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                          <input 
                            type="text"
                            placeholder="URL Immagine (opzionale)"
                            value={ex.imageUrl || ''}
                            onChange={(e) => updateExercise(ex.id, { imageUrl: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-green-500/50 outline-none transition-all"
                          />
                        </div>
                        {ex.imageUrl && (
                          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 mt-2 group/img">
                            <img src={ex.imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button 
                              onClick={() => updateExercise(ex.id, { imageUrl: '' })}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={addExercise}
                className="w-full py-4 border-2 border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-white/60 hover:text-white hover:border-green-500/40 transition-all"
              >
                <Plus className="w-5 h-5" />
                Add Exercise
              </button>

              <button 
                onClick={() => {
                  setMode('training');
                  toast.success('Workout saved!');
                }}
                className="w-full py-4 primary-button rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Workout
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="training"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                  <button 
                    onClick={() => setMode('library')}
                    className="p-2 soft-button rounded-xl touch-target"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{activeWorkout?.name}</h2>
                    <p className="muted-text text-sm">{exercises.filter(e => e.completed).length} di {exercises.length} completati</p>
                  </div>
                </div>
                <button 
                  onClick={() => setMode('editor')}
                  className="p-2 soft-button rounded-xl touch-target"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>

              {exercises.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Dumbbell className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-white/40">No exercises added yet. Go to Editor to start.</p>
                  <button 
                    onClick={() => setMode('editor')}
                    className="text-green-500 font-bold hover:underline"
                  >
                    Open Editor
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {exercises.map((ex) => (
                    <motion.div
                      key={ex.id}
                      layout
                      className={cn(
                        "glass-card rounded-2xl overflow-hidden transition-all duration-300",
                        ex.completed && "opacity-70"
                      )}
                    >
                      <div className="flex">
                        <div 
                          className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-white/5 relative cursor-zoom-in group/thumb"
                          onClick={() => ex.imageUrl && setPreviewImage({ url: ex.imageUrl, name: ex.name })}
                        >
                          {ex.imageUrl ? (
                            <img 
                              src={ex.imageUrl} 
                              alt={ex.name} 
                              className="w-full h-full object-cover transition-transform group-hover/thumb:scale-110"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5">
                              <Dumbbell className="w-8 h-8 text-white/10" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                            <Search className="w-5 h-5 text-white/60" />
                          </div>
                          {activeTimer?.id === ex.id && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="absolute inset-0 bg-green-600/80 backdrop-blur-sm flex flex-col items-center justify-center z-10"
                            >
                              <motion.span 
                                key={activeTimer.timeLeft}
                                initial={{ scale: 1.2, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-3xl font-black text-white tabular-nums"
                              >
                                {activeTimer.timeLeft}
                              </motion.span>
                              <span className="text-[8px] uppercase font-bold tracking-tighter text-white/80">Resting</span>
                            </motion.div>
                          )}
                        </div>
                        
                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold leading-tight">{ex.name || 'Unnamed Exercise'}</h3>
                              <p className="text-[10px] muted-text font-bold uppercase tracking-widest mt-1">
                                {ex.sets} Sets • {ex.reps} Reps
                              </p>
                            </div>
                            {ex.completed && (
                              <span className="text-[10px] uppercase tracking-widest font-bold text-green-400 mr-2">Done</span>
                            )}
                            <button 
                              onClick={() => toggleComplete(ex.id)}
                              className={cn(
                                "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all touch-target",
                                ex.completed ? "bg-green-500 border-green-500 text-white" : "border-white/10 hover:border-white/30"
                              )}
                            >
                              {ex.completed && <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="flex items-center gap-3 mt-2">
                            <button 
                              onClick={() => startRest(ex.id, ex.restTime)}
                              disabled={activeTimer?.id === ex.id}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all touch-target",
                                activeTimer?.id === ex.id 
                                  ? "bg-green-500/20 text-green-500 border border-green-500/30" 
                                  : "bg-white/5 text-white/60 hover:bg-white/10"
                              )}
                            >
                              <Timer className="w-3 h-3" />
                              {activeTimer?.id === ex.id ? `${activeTimer.timeLeft}s` : 'Start Rest'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Quick Action Bar */}
      {mode === 'training' && exercises.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-[#0A0A0A] to-transparent pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <button 
              onClick={() => {
                const next = exercises.find(e => !e.completed);
                if (next) {
                  toast.info(`Next up: ${next.name}`);
                } else {
                  toast.success('Workout Complete! Great job!');
                }
              }}
              className="w-full py-3.5 sm:py-4 primary-button rounded-2xl font-bold text-base sm:text-lg transition-all flex items-center justify-center gap-2 touch-target"
            >
              <Play className="w-5 h-5 fill-current" />
              Continue Session
            </button>
          </div>
        </div>
      )}
      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl compact-landscape"
            >
              <h3 className="text-xl font-bold">Nuova Scheda</h3>
              <input 
                autoFocus
                type="text"
                placeholder="Nome della scheda..."
                value={newWorkoutName}
                onChange={(e) => setNewWorkoutName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createWorkout()}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 outline-none focus:border-green-500/60 transition-all"
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 soft-button rounded-xl font-bold transition-all touch-target"
                >
                  Annulla
                </button>
                <button 
                  onClick={createWorkout}
                  className="flex-1 py-3 primary-button rounded-xl font-bold transition-all touch-target"
                >
                  Crea
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {workoutToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl compact-landscape"
            >
              <h3 className="text-xl font-bold">Elimina Scheda</h3>
              <p className="muted-text">Sei sicuro di voler eliminare questa scheda? Questa azione non può essere annullata.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setWorkoutToDelete(null)}
                  className="flex-1 py-3 soft-button rounded-xl font-bold transition-all touch-target"
                >
                  Annulla
                </button>
                <button 
                  onClick={confirmDeleteWorkout}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-all"
                >
                  Elimina
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {previewImage && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl cursor-zoom-out"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-lg w-full aspect-square rounded-3xl overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={previewImage.url} 
                alt={previewImage.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-2xl font-bold text-white">{previewImage.name}</h3>
                <p className="text-white/60 text-sm uppercase tracking-widest font-bold mt-1">GymLab Exercise Preview</p>
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute top-6 right-6 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
