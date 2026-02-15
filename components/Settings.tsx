
import React, { useState } from 'react';
import { Settings as SettingsIcon, Info, Wifi, Plus, Save, Cloud, ShieldCheck } from 'lucide-react';
import { Dustbin } from '../types';

interface SettingsProps {
  onAddBin: (bin: Partial<Dustbin>) => void;
}

const Settings: React.FC<SettingsProps> = ({ onAddBin }) => {
  const [newBin, setNewBin] = useState({ name: '', lat: -1.2921, lng: 36.8219 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddBin({
      name: newBin.name,
      location: { lat: newBin.lat, lng: newBin.lng },
      level: 0,
      smell: 0,
      isIotDevice: false
    });
    setNewBin({ name: '', lat: -1.2921, lng: 36.8219 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="text-blue-400" size={24} />
          <h4 className="font-bold text-lg">HiveMQ Cloud Configuration</h4>
        </div>
        <div className="space-y-3 font-mono text-[11px]">
          <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
            <p className="text-slate-500 mb-1">BROKER ADDRESS</p>
            <p className="text-blue-300 select-all">cbd03b95e67a4445b1cdc5d33d27fc5d.s1.eu.hivemq.cloud</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <p className="text-slate-500 mb-1">HARDWARE PORT</p>
              <p className="text-white">8883 (SSL)</p>
            </div>
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <p className="text-slate-500 mb-1">WEB PORT</p>
              <p className="text-white">8884 (WSS)</p>
            </div>
          </div>
          <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-800/50 flex items-start gap-3">
             <ShieldCheck className="text-blue-400 shrink-0 mt-0.5" size={16} />
             <div>
               <p className="text-blue-200 font-bold mb-1">ACCESS CREDENTIALS</p>
               <p className="text-blue-100/70">User: <span className="text-white">ecoroute_admin</span></p>
               <p className="text-blue-100/70">Pass: <span className="text-white">EcoPass123!</span></p>
             </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800">
           <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-widest font-bold">TOPIC: ecoroute/updates</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Plus size={18} className="text-blue-500" />
          <h4 className="text-sm font-semibold text-slate-800">Add Manual Station</h4>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Station Name</label>
            <input 
              required
              type="text" 
              value={newBin.name}
              onChange={(e) => setNewBin({ ...newBin, name: e.target.value })}
              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              placeholder="e.g. Nairobi Central 1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Latitude</label>
              <input 
                required
                type="number" 
                step="any"
                value={newBin.lat}
                onChange={(e) => setNewBin({ ...newBin, lat: parseFloat(e.target.value) })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Longitude</label>
              <input 
                required
                type="number" 
                step="any"
                value={newBin.lng}
                onChange={(e) => setNewBin({ ...newBin, lng: parseFloat(e.target.value) })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} /> Save Location
          </button>
        </form>
      </div>

      <div className="flex items-center gap-3 p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
        <Wifi className="text-slate-400" size={20} />
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase">MQTT Bridge</p>
          <p className="text-[10px] text-slate-400 font-mono">Status: Awaiting NodeMCU Payload</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
