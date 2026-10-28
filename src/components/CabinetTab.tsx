import React, { useState } from 'react';
import { CabinetEntry } from '../types.js';
import {
  FolderArchive,
  PlusCircle,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Lock,
  Eye,
  Info,
} from 'lucide-react';

interface Props {
  entries: CabinetEntry[];
  userId: string;
  onOpenAddGoal: () => void;
  onOpenAccessLog: () => void;
  onUpdateEntry: (id: string, updates: Partial<CabinetEntry>) => Promise<string | undefined>;
  onDeleteEntry: (id: string) => Promise<string | undefined>;
  onUndo: (undoToken: string) => void;
}

export const CabinetTab: React.FC<Props> = ({
  entries,
  userId,
  onOpenAddGoal,
  onOpenAccessLog,
  onUpdateEntry,
  onDeleteEntry,
  onUndo,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'goal' | 'preference' | 'observation' | 'fact' | 'life_event'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDetail, setEditDetail] = useState('');
  const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
  const [lastUndoMessage, setLastUndoMessage] = useState<string | null>(null);

  const filteredEntries = entries.filter((e) => {
    if (activeFilter === 'all') return true;
    return e.type === activeFilter;
  });

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'nordea':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FBE7DE] text-[#B0461F] dark:bg-[#3A2017] dark:text-[#F09A76]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B0461F]" />
            Nordea noticed
          </span>
        );
      case 'document':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E7EBEF] text-[#5F6B77] dark:bg-[#222D38] dark:text-[#A3AFBB]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5F6B77]" />
            Extracted from document
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DCF0EB] text-[#0E7A69] dark:bg-[#11332D] dark:text-[#4CC4AF]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0E7A69]" />
            You told us
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'stale':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FBEFD0] text-[#8A5D00] dark:bg-[#382B0F] dark:text-[#F0C25A]">
            Out of Date
          </span>
        );
      case 'disputed':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FBE7DE] text-[#A9261F] dark:bg-[#3A2017] dark:text-[#F2867F]">
            Disputed by You
          </span>
        );
      case 'archived':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ECEEF6] text-[#6B7090] dark:bg-[#1E2242] dark:text-[#8A8FB3]">
            Archived
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DCEFE1] text-[#1C7439] dark:bg-[#163221] dark:text-[#6FCF8D]">
            Active
          </span>
        );
    }
  };

  const handleToggleReadable = async (entry: CabinetEntry, target: 'abel' | 'offers') => {
    const current = entry.readableBy?.[target] ?? false;
    const undo = await onUpdateEntry(entry.id, {
      readableBy: {
        ...entry.readableBy,
        [target]: !current,
      },
    });
    if (undo) {
      setLastUndoToken(undo);
      setLastUndoMessage(`Permission for ${target === 'abel' ? 'Abel' : 'Nordea offers'} updated.`);
    }
  };

  const handleDispute = async (entry: CabinetEntry) => {
    const undo = await onUpdateEntry(entry.id, {
      status: 'disputed',
      why: 'Customer indicated this observation is incorrect or no longer represents their reality.',
    });
    if (undo) {
      setLastUndoToken(undo);
      setLastUndoMessage(`Marked "${entry.title}" as disputed.`);
    }
  };

  const handleDelete = async (entry: CabinetEntry) => {
    const undo = await onDeleteEntry(entry.id);
    if (undo) {
      setLastUndoToken(undo);
      setLastUndoMessage(`Archived "${entry.title}".`);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const undo = await onUpdateEntry(id, { detail: editDetail });
    if (undo) {
      setLastUndoToken(undo);
      setLastUndoMessage('Updated entry detail.');
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-20">
      {/* Header Band */}
      <div className="bg-[#0000A0] text-white px-5 pt-3 pb-6 rounded-b-[24px] shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderArchive className="w-5 h-5 text-white/90" />
            <h1 className="text-xl font-bold">Context Cabinet</h1>
          </div>
          <button
            onClick={onOpenAccessLog}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Access Log
          </button>
        </div>
        <p className="text-xs text-white/80 mt-1.5 leading-relaxed">
          The verified memory Abel uses to personalize your banking. You have full transparency over every single fact: where it came from, who can read it, and one-tap undo.
        </p>
      </div>

      {/* Floating Undo Banner if recent action */}
      {lastUndoToken && (
        <div className="mx-3.5 -mt-3 bg-[#10132B] text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <span>📌 {lastUndoMessage}</span>
          <button
            onClick={() => {
              onUndo(lastUndoToken);
              setLastUndoToken(null);
              setLastUndoMessage(null);
            }}
            className="font-bold underline text-[#F0C25A] flex items-center gap-1 hover:opacity-90 ml-3"
          >
            <RotateCcw className="w-3 h-3" />
            Undo
          </button>
        </div>
      )}

      {/* Filter Tabs & Add Goal */}
      <div className="px-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'goal', label: 'Goals' },
              { id: 'preference', label: 'Preferences' },
              { id: 'observation', label: 'Observations' },
              { id: 'life_event', label: 'Life Events' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  activeFilter === f.id
                    ? 'bg-[#0000A0] text-white'
                    : 'bg-white dark:bg-[#161935] border border-[#D9DCE9] dark:border-[#2D3256] text-[#434866] dark:text-[#B6BAD9]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenAddGoal}
            className="flex-none p-1.5 bg-[#0000A0] text-white rounded-full hover:bg-[#000080]"
            title="Add a new entry"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Entries list */}
        <div className="flex flex-col gap-2.5">
          {filteredEntries.length === 0 ? (
            <div className="bg-white dark:bg-[#161935] p-8 rounded-2xl border border-[#D9DCE9] dark:border-[#2D3256] text-center text-xs text-[#6B7090]">
              No entries found for this category.
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isEditing = editingId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="bg-white dark:bg-[#161935] rounded-2xl p-4 border border-[#D9DCE9] dark:border-[#2D3256] shadow-xs flex flex-col gap-2.5 transition-all text-xs"
                >
                  {/* Top Bar: Provenance & Status */}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-2">
                      {getSourceBadge(entry.source)}
                      {entry.private && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#ECEEF6] dark:bg-[#2D3256] text-[#6B7090] dark:text-[#8A8FB3]">
                          <Lock className="w-2.5 h-2.5" /> Private
                        </span>
                      )}
                    </div>
                    <div>{getStatusBadge(entry.status)}</div>
                  </div>

                  {/* Title & Detail */}
                  <div>
                    <h3 className="font-bold text-sm text-[#10132B] dark:text-[#E8EAFA]">
                      {entry.title}
                    </h3>

                    {isEditing ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <textarea
                          value={editDetail}
                          onChange={(e) => setEditDetail(e.target.value)}
                          className="w-full p-2 border border-[#0000A0] rounded-lg bg-[#F5F6FA] dark:bg-[#0D0F24] text-xs"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#D9DCE9]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(entry.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#0000A0] text-white"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[#434866] dark:text-[#B6BAD9] mt-0.5 leading-relaxed">
                        {entry.detail}
                      </p>
                    )}

                    {/* Explanatory rationale if from Nordea detection */}
                    {entry.why && (
                      <div className="mt-2 p-2 bg-[#F5F6FA] dark:bg-[#1E2242] rounded-lg text-[11px] text-[#6B7090] dark:text-[#8A8FB3] flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 mt-0.5 flex-none" />
                        <span>{entry.why}</span>
                      </div>
                    )}
                  </div>

                  {/* Who can read this? Controls */}
                  <div className="pt-2 border-t border-[#D9DCE9]/50 dark:border-[#2D3256] flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#6B7090]">Readable by:</span>

                      {/* Abel permission */}
                      <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={entry.readableBy?.abel ?? true}
                          onChange={() => handleToggleReadable(entry, 'abel')}
                          className="accent-[#0000A0] rounded-xs"
                        />
                        <span className="font-medium text-[#10132B] dark:text-[#E8EAFA]">Abel</span>
                      </label>

                      {/* Nordea Offers permission */}
                      <label
                        className={`flex items-center gap-1 select-none ${
                          entry.private ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        title={
                          entry.private
                            ? 'Private sensitive records are strictly barred from offers'
                            : 'Toggle permission for Nordea marketing/offers'
                        }
                      >
                        <input
                          type="checkbox"
                          disabled={entry.private}
                          checked={!entry.private && (entry.readableBy?.offers ?? false)}
                          onChange={() => handleToggleReadable(entry, 'offers')}
                          className="accent-[#0000A0] rounded-xs"
                        />
                        <span className="font-medium text-[#10132B] dark:text-[#E8EAFA]">Offers</span>
                      </label>
                    </div>

                    {/* Actions: Edit, Dispute, Archive */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditDetail(entry.detail);
                        }}
                        className="p-1.5 text-[#6B7090] hover:text-[#0000A0] rounded-md hover:bg-[#ECEEF6] dark:hover:bg-[#1E2242]"
                        title="Edit detail"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {entry.source === 'nordea' && entry.status !== 'disputed' && (
                        <button
                          onClick={() => handleDispute(entry)}
                          className="p-1.5 text-[#8A5D00] hover:text-[#A9261F] rounded-md hover:bg-[#FBEFD0]"
                          title="Dispute this (tell Abel it's wrong)"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(entry)}
                        className="p-1.5 text-[#6B7090] hover:text-[#A9261F] rounded-md hover:bg-[#FBE7DE]"
                        title="Remove from active cabinet"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
