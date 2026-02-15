
import React from 'react';
import { Dustbin, CollectionStatus } from '../types';
import { Trash2, Wind, MapPin, Cpu, Clock } from 'lucide-react';

interface DustbinCardProps {
  bin: Dustbin;
  onEdit: (bin: Dustbin) => void;
  isSelected?: boolean;
}

const DustbinCard: React.FC<DustbinCardProps> = ({ bin, onEdit, isSelected }) => {
  // LOGIC MATCHING NODEMCU CODE:
  const isFull = bin.level >= 90;
  const isSmelly = bin.smell >= 200 && bin.level >= 60;
  const needsCollection = isFull || isSmelly;

  let statusText = CollectionStatus.OK;
  let statusColor = 'bg-green-100 text-green-700';
  let badgeLabel = "SKIP";

  if (isFull) {
    statusText = CollectionStatus.FULL;
    statusColor = 'bg-red-100 text-red-700';
    badgeLabel = "COLLECT";
  } else if (isSmelly) {
    statusText = CollectionStatus.SMELLY;
    statusColor = 'bg-amber-100 text-amber-700';
    badgeLabel = "COLLECT";
  }

  return (
    <div 
      className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
        isSelected ? 'border-blue-500 bg-blue-50/30 shadow-md ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
      onClick={() => onEdit(bin)}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${needsCollection ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
            <Trash2 size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm leading-tight">{bin.name}</h3>
            <div className="flex gap-1.5 mt-1">
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${statusColor}`}>
                {statusText}
              </span>
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${needsCollection ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {badgeLabel}
              </span>
            </div>
          </div>
        </div>
        {bin.isIotDevice && <div className="text-blue-500 animate-pulse"><Cpu size={14} /></div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fill Percentage</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-700 ${bin.level >= 90 ? 'bg-red-500' : bin.level >= 60 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${bin.level}%` }}
              />
            </div>
            <span className="text-xs font-black">{bin.level}%</span>
          </div>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">MQ2 Sensor</p>
          <div className="flex items-center gap-2">
            <Wind size={14} className={bin.smell >= 200 ? 'text-amber-500' : 'text-slate-300'} />
            <span className="text-xs font-black">{bin.smell} <span className="text-[8px] font-normal text-slate-400">ppm</span></span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-widest">
        <div className="flex items-center gap-1"><MapPin size={10} /> {bin.location.lat.toFixed(4)}, {bin.location.lng.toFixed(4)}</div>
        <div className="flex items-center gap-1"><Clock size={10} /> {bin.lastUpdated}</div>
      </div>
    </div>
  );
};

export default DustbinCard;
