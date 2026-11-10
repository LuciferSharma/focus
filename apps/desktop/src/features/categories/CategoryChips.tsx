import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Settings2, Trash2 } from 'lucide-react';
import { TaskCategory } from '@focuswatch/shared-types';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { findCategory } from '../../services/categories';

/** Small colored label for a category. Renders nothing special for "no category". */
export const CategoryBadge: React.FC<{
  category?: TaskCategory;
  className?: string;
}> = ({ category, className = '' }) => {
  if (!category) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold border ${className}`}
      style={{
        color: category.color,
        borderColor: `${category.color}66`,
        backgroundColor: `${category.color}1a`,
      }}
      title={category.isWaste ? `${category.name} (counted as wasted time)` : category.name}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
      {category.isWaste && <Trash2 className="w-2.5 h-2.5 opacity-80" />}
    </span>
  );
};

/** Row of chips to pick one category, or none. Used in forms. */
export const CategoryPicker: React.FC<{
  value?: string;
  onChange: (id: string | undefined) => void;
  onManage?: () => void;
}> = ({ value, onChange, onManage }) => {
  const categories = useCategoryStore((s) => s.categories);
  // Archived categories are hidden, unless this task already uses one: then it stays visible.
  const shown = categories.filter((c) => !c.archived || c.id === value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${
          !value
            ? 'bg-slate-700 border-slate-400 text-white'
            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
        }`}
      >
        None
      </button>
      {shown.map((c) => {
        const selected = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(selected ? undefined : c.id)}
            className="px-2.5 py-1 text-[11px] font-bold border transition-all flex items-center gap-1.5"
            style={{
              color: selected ? c.color : '#94a3b8',
              borderColor: selected ? c.color : '#1e293b',
              backgroundColor: selected ? `${c.color}26` : '#020617',
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
            {selected && <Check className="w-3 h-3" />}
          </button>
        );
      })}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="px-2 py-1 text-[10px] text-slate-500 hover:text-cyan-300 flex items-center gap-1"
          title="Add, rename, recolor or archive categories"
        >
          <Settings2 className="w-3 h-3" /> Manage
        </button>
      )}
    </div>
  );
};

/** A badge that opens a small menu to change the category in place. Used on task cards. */
export const CategoryMenu: React.FC<{
  value?: string;
  onChange: (id: string | undefined) => void;
  onManage?: () => void;
}> = ({ value, onChange, onManage }) => {
  const categories = useCategoryStore((s) => s.categories);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = findCategory(value, categories);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 hover:brightness-125 transition-all"
        title="Change category"
      >
        {current ? (
          <CategoryBadge category={current} />
        ) : (
          <span className="px-2 py-0.5 text-[10px] font-bold border border-dashed border-slate-700 text-slate-500 hover:text-slate-300">
            + Category
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-slate-600" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-52 bg-[#030712] border border-slate-700 shadow-2xl p-1 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="w-full text-left px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            No category
          </button>
          {categories
            .filter((c) => !c.archived || c.id === value)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1 text-[11px] flex items-center gap-2 hover:bg-slate-800"
                style={{ color: c.color }}
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="flex-1 truncate">{c.name}</span>
                {c.id === value && <Check className="w-3 h-3" />}
              </button>
            ))}
          {onManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="w-full text-left px-2 py-1 text-[10px] text-slate-500 hover:text-cyan-300 border-t border-slate-800 mt-1 pt-1.5 flex items-center gap-1"
            >
              <Settings2 className="w-3 h-3" /> Manage categories
            </button>
          )}
        </div>
      )}
    </div>
  );
};
