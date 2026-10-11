import React, { useState, useEffect } from 'react';
import { Clock, Lock, CheckCircle2, Bell, AlertCircle, Sparkles, X, ArrowRight, RotateCcw } from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface DirectTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestDateChange?: () => void;
}

export const DirectTimeModal: React.FC<DirectTimeModalProps> = ({
  isOpen,
  onClose,
  onRequestDateChange
}) => {
  const { workingDate, setWorkingDate, setWorkingTime } = useSystem();
  const { user } = useAuth();

  const [selectedTime, setSelectedTime] = useState<string>('08:00');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isReverting, setIsReverting] = useState<boolean>(false);
  const [showRevertPrompt, setShowRevertPrompt] = useState<boolean>(false);

  // Extract date and current time from workingDate or local time
  const currentWorkingDate = workingDate || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const currentDatePart = currentWorkingDate.slice(0, 10);
  const currentTimePart = currentWorkingDate.slice(11, 16) || '08:00';

  useEffect(() => {
    if (isOpen) {
      setShowRevertPrompt(false);
      if (workingDate && workingDate.length >= 16) {
        setSelectedTime(workingDate.slice(11, 16));
      } else {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setSelectedTime(`${hh}:${mm}`);
      }
    }
  }, [isOpen, workingDate]);

  if (!isOpen) return null;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTime) {
      toast.error('Please select a valid time (HH:mm)');
      return;
    }

    setIsSubmitting(true);
    try {
      const msg = await setWorkingTime(selectedTime);
      toast.success('System Working Time Updated!', {
        description: msg || `Working time shifted to ${selectedTime}.`
      });
      onClose();
    } catch (err: any) {
      toast.error('Failed to adjust working time', {
        description: err.message || 'Permission denied or network issue.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeRevertToRealTime = async () => {
    setIsReverting(true);
    try {
      await setWorkingDate('');
      toast.success('System Clock Reverted to Real-Time!', {
        description: 'ERP transactions will now record at the live server/local date and time.'
      });
      setShowRevertPrompt(false);
      onClose();
    } catch (err: any) {
      toast.error('Failed to revert clock', {
        description: err.message || 'Permission denied or network issue.'
      });
    } finally {
      setIsReverting(false);
    }
  };

  const setPreset = (hhMm: string) => {
    setSelectedTime(hhMm);
  };

  const addMinutes = (minutes: number) => {
    const [h, m] = selectedTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h || 0, (m || 0) + minutes, 0, 0);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    setSelectedTime(`${hh}:${mm}`);
  };

  const setLiveNow = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setSelectedTime(`${hh}:${mm}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-bg4 bg-bg3/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shadow-inner">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-text uppercase tracking-tight flex items-center gap-2">
                Time & Clock Adjustment
              </h3>
              <p className="text-xs text-text3 font-medium">
                Adjust working time or revert to real-time clock
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleApply} className="p-6 space-y-5">
          {/* Production Date Lock Banner & Revert Option */}
          <div className="p-3.5 bg-bg3/60 border border-bg4 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-bg4 text-text flex items-center justify-center border border-bg3 shrink-0">
                <Lock className="w-4 h-4 text-po" />
              </div>
              <div className="truncate">
                <p className="text-[10px] font-mono uppercase tracking-wider text-text3">
                  {workingDate ? 'Custom Working Date (Active)' : 'Live Real-Time Clock'}
                </p>
                <p className="text-xs font-black text-text font-mono truncate">
                  {workingDate 
                    ? new Date(currentDatePart).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                    : 'System Running in Live Real-Time'}
                </p>
              </div>
            </div>
            {workingDate ? (
              <button
                type="button"
                onClick={() => setShowRevertPrompt(true)}
                disabled={isReverting}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                title="Revert system clock back to real-time"
              >
                <RotateCcw className={isReverting ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
                Revert to Real-Time
              </button>
            ) : (
              <span className="text-[10px] font-bold px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg shrink-0">
                ● Live Real-Time
              </span>
            )}
          </div>

          {/* Revert Confirmation Banner */}
          {showRevertPrompt && (
            <div className="p-4 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
              <div className="flex items-start gap-3 text-rose-300">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-rose-200">Confirm Revert to Real-Time Clock?</p>
                  <p className="mt-0.5 opacity-90 leading-relaxed text-[11px]">
                    This will disable all custom date and time locks. All new production entries will immediately record at the live server/local clock.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRevertPrompt(false)}
                  disabled={isReverting}
                  className="px-3.5 py-1.5 bg-bg3 hover:bg-bg4 text-text2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeRevertToRealTime}
                  disabled={isReverting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className={isReverting ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
                  {isReverting ? 'Reverting...' : 'Yes, Revert to Live Clock'}
                </button>
              </div>
            </div>
          )}

          {/* Time Picker Control */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Custom Working Time (24h)
              </span>
              <span className="text-[11px] font-mono text-text3">
                {workingDate ? `Current: ${currentTimePart}` : 'Live Device Time'}
              </span>
            </label>
            <div className="relative">
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full bg-bg3 border border-bg4 rounded-2xl px-5 py-3.5 text-2xl font-black text-text font-mono text-center tracking-widest focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                required
              />
            </div>
          </div>

          {/* Shift & Time Presets */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-text3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" /> 1-Click Shift Presets:
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={setLiveNow}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                ⚡ Live Device
              </button>
              <button
                type="button"
                onClick={() => setPreset('08:00')}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                🌅 Morning 08:00
              </button>
              <button
                type="button"
                onClick={() => setPreset('14:00')}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                ☀️ Afternoon 14:00
              </button>
              <button
                type="button"
                onClick={() => setPreset('18:00')}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                🌙 Evening 18:00
              </button>
              <button
                type="button"
                onClick={() => addMinutes(15)}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-mono font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                +15 Mins
              </button>
              <button
                type="button"
                onClick={() => addMinutes(60)}
                className="px-2.5 py-2 bg-bg3 hover:bg-bg4 text-text text-xs font-mono font-bold rounded-xl border border-bg4 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                +1 Hour
              </button>
            </div>
          </div>

          {/* Supervisor / Admin Auto-Notification Notice */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-xs text-amber-600 dark:text-amber-400">
            <Bell className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Instant Privilege & Revert Option</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                Supervisors and authorized users can adjust time directly or revert the clock to real-time. Changes apply instantly across all production logging modules.
              </p>
            </div>
          </div>

          {/* Request Date Change link if user wants to change the Date */}
          {onRequestDateChange && (
            <div className="pt-1 flex items-center justify-between text-xs text-text3 border-t border-bg4/60">
              <span>Need to change the calendar date?</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestDateChange();
                }}
                className="text-po font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Request Date Change <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-bg4">
            {workingDate ? (
              <button
                type="button"
                onClick={() => setShowRevertPrompt(true)}
                disabled={isReverting}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert to Real-Time
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-bg3 hover:bg-bg4 text-text2 hover:text-text rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isReverting}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Clock className="w-4 h-4" />
                {isSubmitting ? 'Updating Clock...' : 'Apply Working Time'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
