import React, { useState } from 'react';
import { LocalPlayerProfile } from '../types/profile';
import { UserRound, Plus, Check, RefreshCw, Unplug } from 'lucide-react';

interface ProfileSetupModalProps {
  profiles: LocalPlayerProfile[];
  isOpen: boolean;
  onCreate: (name: string) => void;
  onSelect: (profile: LocalPlayerProfile) => void;
  onSync: (profile: LocalPlayerProfile) => void;
  onDisconnect: (profile: LocalPlayerProfile) => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ profiles, isOpen, onCreate, onSelect, onSync, onDisconnect }) => {
  const [name, setName] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/60 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-600 flex items-center justify-center text-white"><UserRound /></div>
          <div>
            <h2 className="text-xl font-bold font-fantasy text-amber-400">Choose Player Profile</h2>
            <p className="text-xs text-slate-400">Campaign progress and earned cards belong to a profile.</p>
          </div>
        </div>

        {profiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-400">Existing Profiles</div>
            {profiles.map((profile) => (
              <div key={profile.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <button onClick={() => onSelect(profile)} className="w-full text-left flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-200">{profile.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {profile.linkedUsername ? `Synced with ${profile.linkedUsername}` : 'No account synced'}
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-amber-400" />
                </button>
                {profile.linkedUsername && (
                  <button onClick={() => onDisconnect(profile)} className="w-full px-3 py-1.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
                    <Unplug className="w-3.5 h-3.5" /> Disconnect
                  </button>
                )}
                {!profile.linkedUsername && (
                  <button onClick={() => onSync(profile)} className="w-full px-3 py-1.5 bg-amber-950/70 hover:bg-amber-900 border border-amber-600/60 text-amber-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Sync Account to This Profile
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Create New Profile</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Forestwalker" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500" />
          <button onClick={() => onCreate(name)} disabled={!name.trim()} className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Create Profile</button>
        </div>
      </div>
    </div>
  );
};
