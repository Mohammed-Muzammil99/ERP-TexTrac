import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  X, 
  ArrowRight, 
  Check, 
  Split, 
  Calendar, 
  User, 
  Tag, 
  Hash, 
  AlertCircle,
  Layers,
  ChevronRight
} from 'lucide-react';
import { statusService } from '../services/erpService';

export interface HourlySlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  rowId: string;
  rowLabel: string;
  slotLabel: string;
  slotIndex: number;
  onSuccess?: () => void;
}

const AVAILABLE_SLOTS = [
  { start: '09', label: '9:00 am - 10:00 am' },
  { start: '10', label: '10:00 am - 11:00 am' },
  { start: '11', label: '11:00 am - 12:00 pm' },
  { start: '12', label: '12:00 pm - 1:00 pm' },
  { start: '14', label: '2:00 pm - 3:00 pm' },
  { start: '15', label: '3:00 pm - 4:00 pm' },
  { start: '16', label: '4:00 pm - 5:00 pm' },
  { start: '17', label: '5:00 pm - 6:00 pm' }
];

export const HourlySlotModal: React.FC<HourlySlotModalProps> = ({
  isOpen,
  onClose,
  date,
  rowId,
  rowLabel,
  slotLabel,
  slotIndex,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active item being moved/split
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null);
  const [targetHour, setTargetHour] = useState<string>('15');
  const [moveQty, setMoveQty] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map slot index to hourPart ('09', '10', '11', '12', '14', '15', '16', '17')
  const currentSlotObj = AVAILABLE_SLOTS[slotIndex] || AVAILABLE_SLOTS[0];
  const hourPart = currentSlotObj.start;

  const fetchRecords = async () => {
    if (!isOpen || !rowId || !date) return;
    setLoading(true);
    setError(null);
    try {
      const res = await statusService.getHourlySlotBreakdown({
        date,
        rowId,
        hourPart
      });
      setRecords(res.records || []);
    } catch (err: any) {
      console.error('Failed to load slot records:', err);
      setError(err.message || 'Failed to fetch slot records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveRecordId(null);
      setSuccessMessage(null);
      // Default next slot if available, else first slot
      const nextSlot = AVAILABLE_SLOTS[(slotIndex + 1) % AVAILABLE_SLOTS.length];
      setTargetHour(nextSlot.start);
      fetchRecords();
    }
  }, [isOpen, date, rowId, slotIndex]);

  const handleStartMove = (rec: any) => {
    setActiveRecordId(rec.id);
    setMoveQty(rec.quantity);
    const nextSlot = AVAILABLE_SLOTS[(slotIndex + 1) % AVAILABLE_SLOTS.length];
    setTargetHour(nextSlot.start);
  };

  const handleCancelMove = () => {
    setActiveRecordId(null);
  };

  const handleConfirmMove = async (rec: any) => {
    if (!rec || !targetHour) return;
    if (moveQty <= 0) {
      setError('Please enter a valid quantity greater than 0');
      return;
    }
    if (moveQty > rec.quantity) {
      setError(`Quantity cannot exceed current batch of ${rec.quantity} pcs`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await statusService.moveHourlySlotRecord({
        table: rec.record_table,
        recordId: rec.id,
        targetDate: date,
        targetHour: targetHour,
        moveQty: moveQty
      });

      setSuccessMessage(res.message || `Successfully moved ${moveQty} pcs to target slot!`);
      setActiveRecordId(null);
      await fetchRecords();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Failed to move record:', err);
      setError(err.message || 'Failed to move record to target slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalSlotQty = records.reduce((sum, r) => sum + (r.quantity || 0), 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="bg-bg2 border border-bg4 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-bg4 pb-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-po/10 text-po border border-po/20 rounded-2xl shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-md bg-bg3 text-text3 border border-bg4">
                    Hourly Slot Manager
                  </span>
                  <span className="text-[10px] font-mono font-bold text-text3 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-po" /> {date}
                  </span>
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-text mt-1">
                  {rowLabel}
                </h3>
                <p className="text-xs font-mono text-po font-bold flex items-center gap-1.5 mt-0.5">
                  <span>Slot: {slotLabel}</span>
                  <span className="text-text3">•</span>
                  <span className="text-emerald-500">{totalSlotQty} pcs recorded</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-text3 hover:text-text p-2 rounded-xl hover:bg-bg3 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold rounded-2xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Records List Container */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loading ? (
              <div className="py-12 text-center text-text3 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-po/30 border-t-po rounded-full animate-spin" />
                <span className="text-xs font-mono font-bold">Loading batch records...</span>
              </div>
            ) : records.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-bg4 rounded-2xl p-8">
                <Layers className="w-10 h-10 text-text3/40 mx-auto mb-2" />
                <p className="text-sm font-bold text-text">No records logged in this slot</p>
                <p className="text-xs text-text3 mt-1">
                  There are no individual accepted production entries stamped between {slotLabel}.
                </p>
              </div>
            ) : (
              records.map((rec) => {
                const isMoving = activeRecordId === rec.id;
                const formattedTime = rec.created_at ? new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                const isPartial = moveQty < rec.quantity && moveQty > 0;

                return (
                  <div
                    key={rec.id}
                    className={`border rounded-2xl p-4 transition-all ${
                      isMoving 
                        ? 'border-po bg-po/5 shadow-md ring-1 ring-po/30' 
                        : 'border-bg4 bg-bg3/50 hover:bg-bg3 hover:border-bg4'
                    }`}
                  >
                    {/* Item Summary Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase text-text bg-bg2 border border-bg4 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <Tag className="w-3 h-3 text-amber-500" />
                            {rec.style_num || 'Style N/A'}
                          </span>
                          <span className="text-xs font-mono font-bold text-text3 flex items-center gap-1">
                            <Hash className="w-3 h-3 text-po" />
                            {rec.po_number || 'No PO'}
                          </span>
                          {rec.color && (
                            <span className="text-[11px] font-bold text-text3 bg-bg2 px-2 py-0.5 rounded-md border border-bg4">
                              {rec.color} {rec.size ? `/ ${rec.size}` : ''}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-text3">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-text3" />
                            Logged: <b className="text-text">{formattedTime}</b>
                          </span>
                          {rec.created_by_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-text3" />
                              {rec.created_by_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Quantity & Move Action */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right">
                          <div className="text-base font-black text-text">
                            {rec.quantity} <span className="text-xs font-normal text-text3">pcs</span>
                          </div>
                          {rec.cartons && (
                            <div className="text-[10px] font-mono text-text3">{rec.cartons} ctns</div>
                          )}
                        </div>

                        {!isMoving ? (
                          <button
                            onClick={() => handleStartMove(rec)}
                            className="bg-bg2 hover:bg-po hover:text-white border border-bg4 text-text font-black text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <span>Move Slot</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Move / Split Editor Form */}
                    {isMoving && (
                      <div className="mt-4 pt-4 border-t border-po/20 space-y-4 bg-bg2/80 p-4 rounded-xl border border-bg4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase text-po tracking-wide">
                          <Split className="w-4 h-4" /> Move or Split Production Slot
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Target Slot Selection */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono font-black text-text3 uppercase tracking-wider">
                              Target Hourly Slot:
                            </label>
                            <select
                              value={targetHour}
                              onChange={(e) => setTargetHour(e.target.value)}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-xs font-black outline-none focus:ring-1 focus:ring-po"
                            >
                              {AVAILABLE_SLOTS.map((s) => (
                                <option 
                                  key={s.start} 
                                  value={s.start}
                                  disabled={s.start === hourPart}
                                >
                                  {s.label} {s.start === hourPart ? '(Current Slot)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Move Quantity */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-mono font-black text-text3 uppercase tracking-wider">
                                Quantity to Move (Pcs):
                              </label>
                              <button
                                type="button"
                                onClick={() => setMoveQty(rec.quantity)}
                                className="text-[10px] font-bold text-po hover:underline"
                              >
                                Move All ({rec.quantity})
                              </button>
                            </div>
                            <input
                              type="number"
                              min={1}
                              max={rec.quantity}
                              value={moveQty || ''}
                              onChange={(e) => setMoveQty(parseInt(e.target.value) || 0)}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-xs font-black outline-none focus:ring-1 focus:ring-po font-mono"
                            />
                          </div>
                        </div>

                        {/* Summary Helper Banner */}
                        <div className="bg-bg3/60 rounded-xl p-3 text-xs text-text3 flex items-start gap-2">
                          <ChevronRight className="w-4 h-4 text-po shrink-0 mt-0.5" />
                          <div>
                            {!isPartial ? (
                              <span>
                                <b>Full Move:</b> Entire <b>{rec.quantity} pcs</b> will be moved from <i>{slotLabel}</i> into <b>{AVAILABLE_SLOTS.find(s => s.start === targetHour)?.label}</b>.
                              </span>
                            ) : (
                              <span>
                                <b>Split & Move:</b> <b>{moveQty} pcs</b> will move to <b>{AVAILABLE_SLOTS.find(s => s.start === targetHour)?.label}</b>, and the remaining <b>{rec.quantity - moveQty} pcs</b> will stay in <i>{slotLabel}</i>.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleCancelMove}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-bg3 hover:bg-bg4 text-text font-bold text-xs rounded-xl transition-all border border-bg4"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmMove(rec)}
                            disabled={isSubmitting || moveQty <= 0 || moveQty > rec.quantity}
                            className="px-5 py-2 bg-po hover:bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-po/20 flex items-center gap-2 disabled:opacity-50"
                          >
                            {isSubmitting ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Confirm Move</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-bg4">
            <span className="text-[11px] text-text3 font-mono">
              Tip: Click on any batch to shift or split into 3-4 PM, 4-5 PM, etc.
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-bg3 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-bg4"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
