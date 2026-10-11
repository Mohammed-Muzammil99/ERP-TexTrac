import React, { useState, useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkCalendarProps {
  records: any[];
  title: string;
  dailyTotalPcs?: Record<string, number>; // date string -> total pcs for that day
  unit?: string;
}

export const WorkCalendar: React.FC<WorkCalendarProps> = ({ records, title, dailyTotalPcs, unit = 'PCS' }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const dailyStats = useMemo(() => {
    const stats: Record<string, { count: number; totalQty: number; netKg?: number }> = {};
    records.forEach(rec => {
      const dateKey = format(new Date(rec.created_at), 'yyyy-MM-dd');
      if (!stats[dateKey]) {
        stats[dateKey] = { count: 0, totalQty: 0, netKg: 0 };
      }
      stats[dateKey].count += 1;
      
      // Handle both generic quantity and fabric-specific quantity_kg
      if (rec.record_type === 'issue') {
        stats[dateKey].netKg = (stats[dateKey].netKg || 0) + (rec.quantity_kg || 0);
        stats[dateKey].totalQty += rec.quantity_kg || 0;
      } else if (rec.record_type === 'return') {
        stats[dateKey].netKg = (stats[dateKey].netKg || 0) - (rec.quantity_kg || 0);
        stats[dateKey].totalQty -= rec.quantity_kg || 0;
      } else if (rec.record_type === 'inhouse') {
        stats[dateKey].totalQty += rec.quantity_kg || 0;
      } else if (rec.record_type === 'consumption') {
        stats[dateKey].totalQty += rec.quantity_kg || 0;
      } else {
        stats[dateKey].totalQty += (rec.quantity || 0);
      }
    });
    return stats;
  }, [records]);

  const selectedRecords = useMemo(() => {
    if (!selectedDate) return [];
    return records.filter(rec => isSameDay(new Date(rec.created_at), selectedDate));
  }, [records, selectedDate]);

  const selectedDayEfficiency = useMemo(() => {
    if (!selectedDate || !dailyTotalPcs) return null;
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const netKg = dailyStats[dateKey]?.netKg || 0;
    const pcs = dailyTotalPcs[dateKey] || 0;
    if (pcs === 0) return null;
    return (netKg / pcs).toFixed(4);
  }, [selectedDate, dailyTotalPcs, dailyStats]);

  return (
    <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-lg flex flex-col h-full min-h-[500px]">
      <div className="p-6 border-b border-bg4 bg-bg3/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-po" />
          <h3 className="text-sm font-bold uppercase tracking-tight">{title} Calendar</h3>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1 hover:bg-bg4 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-mono font-bold uppercase tracking-widest min-w-[120px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1 hover:bg-bg4 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-7 divide-y lg:divide-y-0 lg:divide-x divide-bg4">
        {/* Calendar Grid */}
        <div className="lg:col-span-5 p-4 bg-bg3/10">
          <div className="grid grid-cols-7 gap-px mb-2 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-[10px] font-mono text-text3 uppercase py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const stats = dailyStats[dateKey];
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();

              // Calculate efficiency for the tiny tag
              const pcs = dailyTotalPcs?.[dateKey] || 0;
              const efficiency = (pcs > 0 && stats?.netKg) ? (stats.netKg / pcs).toFixed(3) : null;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "relative aspect-square p-2 rounded-xl border transition-all flex flex-col items-center justify-center gap-1",
                    !isCurrentMonth ? "opacity-20 pointer-events-none" : "hover:scale-105",
                    isSelected 
                      ? "bg-po border-po text-bg" 
                      : isToday(day)
                        ? "bg-bg3 border-po/50 text-po"
                        : "bg-bg3/50 border-bg4 text-text2 hover:border-text3"
                  )}
                >
                  <span className={cn(
                    "text-xs font-black",
                    isSelected ? "text-bg" : ""
                  )}>
                    {format(day, 'd')}
                  </span>
                  {stats && (
                    <div className={cn(
                      "flex flex-col items-center",
                      isSelected ? "text-bg/80" : "text-po"
                    )}>
                      <div className="w-1 h-1 rounded-full bg-current" />
                      <span className="text-[8px] font-mono font-bold leading-none">
                        {unit === 'KG' ? (stats.netKg || 0).toFixed(1) : stats.totalQty}
                      </span>
                      {efficiency && (
                        <span className="text-[7px] opacity-70 font-bold tracking-tighter">
                          {efficiency} e
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details */}
        <div className="lg:col-span-2 flex flex-col bg-bg2">
          <div className="p-4 border-b border-bg4 bg-bg3/20 flex flex-col gap-2">
            <h4 className="text-xs font-bold uppercase text-text3 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {selectedDate ? format(selectedDate, 'PPP') : 'Select a date'}
            </h4>
            
            {selectedDayEfficiency && (
              <div className="bg-po/10 p-2 rounded-lg border border-po/20">
                <p className="text-[9px] font-mono text-po uppercase font-black">Daily Avg Weight</p>
                <p className="text-lg font-black text-po">{selectedDayEfficiency} <span className="text-xs">KG/PC</span></p>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[400px] divide-y divide-bg4">
            {selectedRecords.length > 0 ? (
              selectedRecords.map((rec, i) => (
                <div key={i} className="p-4 hover:bg-bg3/20 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-mono font-bold text-po">{rec.po_number}</span>
                    <span className={cn(
                      "text-sm font-black",
                      rec.record_type === 'return' ? "text-reject" : ""
                    )}>
                      {rec.record_type === 'return' ? '-' : '+'}{rec.quantity_kg || rec.quantity}{unit === 'KG' ? ' KG' : ''}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-text mb-1">{rec.style_num || 'Fabric Record'}</p>
                  <p className="text-[10px] font-mono text-text3 uppercase">
                    {rec.color} {rec.size ? `• ${rec.size}` : ''}
                  </p>
                  {rec.line_number && (
                    <p className="text-[8px] font-mono font-bold text-stitch uppercase mt-1">Line {rec.line_number}</p>
                  )}
                </div>
              ))
            ) : (
              <div className="p-12 text-center">
                <p className="text-[10px] font-mono text-text3 uppercase">No activities for this day</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
