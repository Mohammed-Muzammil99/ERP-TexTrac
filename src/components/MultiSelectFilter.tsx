import React, { useState, useRef, useEffect } from 'react';
import { Filter, Check, Search, X, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface MultiSelectFilterProps {
  title: string;
  options: { value: string; count?: number }[] | string[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  icon?: React.ComponentType<{ className?: string }>;
  placeholder?: string;
  accentColor?: string; // e.g., 'po', 'cut', 'stitch', 'pass', 'amber'
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  title,
  options,
  selectedValues,
  onChange,
  icon: Icon = Filter,
  placeholder = `Search ${title}...`,
  accentColor = 'po'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options into { value: string, count?: number }
  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { value: opt } : opt
  );

  // Filter options based on local search term
  const filteredOptions = normalizedOptions.filter(opt =>
    opt.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    const allValues = Array.from(new Set([...selectedValues, ...filteredOptions.map(o => o.value)]));
    onChange(allValues);
  };

  const handleClearAll = () => {
    const remaining = selectedValues.filter(v => !filteredOptions.some(o => o.value === v));
    onChange(remaining);
  };

  const isAllFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => selectedValues.includes(o.value));

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer select-none",
          selectedValues.length > 0
            ? "bg-po/10 border-po/30 text-po shadow-sm"
            : "bg-bg2 hover:bg-bg3 border-bg4 text-text2 hover:text-text"
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{title}</span>
        {selectedValues.length > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full bg-po text-white text-[10px] font-mono font-black animate-in fade-in">
            {selectedValues.length}
          </span>
        ) : (
          <span className="text-[10px] text-text3 font-normal uppercase">All</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-72 bg-bg2 border border-bg4 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Popover Header with Search */}
            <div className="p-3 bg-bg3/50 border-b border-bg4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-text3 flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-po" />
                  Select {title}
                </span>
                {selectedValues.length > 0 && (
                  <button
                    onClick={() => onChange([])}
                    className="text-[10px] font-bold text-red-500 hover:underline uppercase cursor-pointer"
                  >
                    Reset ({selectedValues.length})
                  </button>
                )}
              </div>

              {/* Search Box inside dropdown */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-bg border border-bg4 rounded-xl py-1.5 pl-8 pr-3 text-xs font-bold text-text outline-none focus:border-po/50"
                  autoFocus
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 hover:text-text"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center justify-between text-[10px] font-bold text-text3 pt-1 border-t border-bg4/30">
                <button
                  type="button"
                  onClick={isAllFilteredSelected ? handleClearAll : handleSelectAll}
                  className="hover:text-po transition-colors cursor-pointer flex items-center gap-1"
                >
                  {isAllFilteredSelected ? (
                    <>
                      <Square className="w-3 h-3" /> Unselect Filtered
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3 h-3 text-po" /> Select All Filtered
                    </>
                  )}
                </button>
                <span>{filteredOptions.length} available</span>
              </div>
            </div>

            {/* Checkers List */}
            <div className="max-h-60 overflow-y-auto p-2 space-y-1 divide-y divide-bg4/20">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-text3 text-xs font-bold uppercase tracking-wider">
                  No matching {title.toLowerCase()}s
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = selectedValues.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors select-none",
                        isChecked ? "bg-po/10 text-po font-black" : "hover:bg-bg3 text-text font-bold"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOption(opt.value)}
                          className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po shrink-0"
                        />
                        <span className="truncate uppercase font-mono">{opt.value}</span>
                      </div>
                      {opt.count !== undefined && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-mono shrink-0",
                          isChecked ? "bg-po/20 text-po font-black" : "bg-bg3 text-text3 font-medium"
                        )}>
                          {opt.count}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ActiveFiltersProps {
  selectedStyles: string[];
  selectedColors: string[];
  onRemoveStyle: (style: string) => void;
  onRemoveColor: (color: string) => void;
  onClearAll: () => void;
  totalSum?: number | string;
  customStats?: React.ReactNode;
}

export const ActiveFiltersBar: React.FC<ActiveFiltersProps> = ({
  selectedStyles,
  selectedColors,
  onRemoveStyle,
  onRemoveColor,
  onClearAll,
  totalSum,
  customStats
}) => {
  const hasFilters = selectedStyles.length > 0 || selectedColors.length > 0;
  if (!hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 bg-bg3/40 border border-bg4/60 rounded-2xl animate-in fade-in">
      <span className="text-[10px] font-black uppercase tracking-widest text-text3 font-mono mr-1">
        Active Filters:
      </span>

      {selectedStyles.map(st => (
        <span
          key={`style-${st}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-po/15 text-po border border-po/20 text-[10px] font-black uppercase font-mono shadow-sm"
        >
          <span>Style: {st}</span>
          <button
            onClick={() => onRemoveStyle(st)}
            className="hover:bg-po/30 rounded-md p-0.5 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {selectedColors.map(cl => (
        <span
          key={`color-${cl}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase font-mono shadow-sm"
        >
          <span>Color: {cl}</span>
          <button
            onClick={() => onRemoveColor(cl)}
            className="hover:bg-indigo-500/30 rounded-md p-0.5 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div className="ml-auto flex items-center gap-2">
        {customStats ? (
          customStats
        ) : totalSum !== undefined ? (
          <span className="px-3 py-1 rounded-xl bg-po/20 text-po border border-po/30 text-[11px] font-black font-mono shadow-sm flex items-center gap-1.5">
            <span>Filtered Sum:</span>
            <span className="text-po font-extrabold">{typeof totalSum === 'number' ? totalSum.toLocaleString() : totalSum} pcs</span>
          </span>
        ) : null}

        <button
          onClick={onClearAll}
          className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-400 hover:underline px-2 py-1 cursor-pointer"
        >
          Clear All Filters
        </button>
      </div>
    </div>
  );
};

export const ActiveFilterBar = ActiveFiltersBar;

