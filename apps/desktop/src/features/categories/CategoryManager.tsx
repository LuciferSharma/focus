import React, { useEffect, useState } from 'react';
import { X, Plus, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { TaskCategory } from '@focuswatch/shared-types';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { CATEGORY_COLORS } from '../../services/categories';

const ColorDots: React.FC<{ value: string; onPick: (color: string) => void }> = ({ value, onPick }) => (
  <div className="flex flex-wrap gap-1">
    {CATEGORY_COLORS.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onPick(c)}
        title={c}
        className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
          value.toLowerCase() === c ? 'border-white' : 'border-transparent'
        }`}
        style={{ backgroundColor: c }}
      />
    ))}
  </div>
);

/** One editable row. The name is saved when you leave the box or press Enter. */
const CategoryRow: React.FC<{ category: TaskCategory }> = ({ category }) => {
  const updateCategory = useCategoryStore((s) => s.updateCategory);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState('');

  useEffect(() => setName(category.name), [category.name]);

  const commitName = () => {
    if (name.trim() === category.name) return;
    if (!updateCategory(category.id, { name })) {
      setError(name.trim() ? 'That name is already used.' : 'A category needs a name.');
      setName(category.name);
      setTimeout(() => setError(''), 2500);
    }
  };

  return (
    <div className={`p-3 border space-y-2 ${category.archived ? 'border-slate-800 opacity-60' : 'border-slate-800 bg-slate-950'}`}>
      <div className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="flex-1 min-w-0 bg-transparent border-b border-slate-800 focus:border-cyan-500 text-xs text-white py-1 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => updateCategory(category.id, { archived: !category.archived })}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600"
          title={category.archived ? 'Show this category in pickers again' : 'Hide from pickers. Existing tasks and history keep it.'}
        >
          {category.archived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
          {category.archived ? 'Restore' : 'Archive'}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ColorDots value={category.color} onPick={(color) => updateCategory(category.id, { color })} />
        <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(category.isWaste)}
            onChange={(e) => updateCategory(category.id, { isWaste: e.target.checked || undefined })}
            className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
          />
          <Trash2 className="w-3 h-3 text-rose-400" /> Counts as wasted time
        </label>
      </div>
    </div>
  );
};

export const CategoryManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const categories = useCategoryStore((s) => s.categories);
  const addCategory = useCategoryStore((s) => s.addCategory);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[7]);
  const [newWaste, setNewWaste] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addCategory(newName, newColor, newWaste);
    if (!created) {
      setError(newName.trim() ? 'You already have a category with that name.' : 'Type a name first.');
      return;
    }
    setNewName('');
    setNewWaste(false);
    setError('');
  };

  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-xl max-h-[90vh] bg-[#050811] border border-slate-800 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Categories</h3>
            <p className="text-[10px] text-slate-500">
              The kinds of work you do. Rename, recolor or add your own at any time.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {active.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}

          <form onSubmit={handleAdd} className="p-3 border border-dashed border-cyan-500/40 bg-cyan-500/5 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">New category</div>
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError('');
                }}
                placeholder="e.g. Hiring, Finance, Learning"
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white px-2.5 py-1.5 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-[11px] font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ColorDots value={newColor} onPick={setNewColor} />
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newWaste}
                  onChange={(e) => setNewWaste(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
                />
                Counts as wasted time
              </label>
            </div>
          </form>

          {archived.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Archived</div>
              {archived.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
