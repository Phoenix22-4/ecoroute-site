
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { 
  Navigation, 
  Settings as SettingsIcon, 
  RefreshCw, 
  Activity,
  Wifi,
  Truck,
  Locate,
  Map as MapIcon,
  XCircle,
  LayoutList,
  MapPinned,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Maximize,
  Radar
} from 'lucide-react';

import { Dustbin, RouteOptimizationResult, Coordinates } from './types';
import { optimizeCollectionRoute } from './services/geminiService';
import DustbinCard from './components/DustbinCard';
import Settings from './components/Settings';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const isStrictlyValid = (lat: any, lng: any): boolean => {
  const nLat = parseFloat(String(lat));
  const nLng = parseFloat(String(lng));
  return (
    !isNaN(nLat) && 
    !isNaN(nLng) && 
    isFinite(nLat) && 
    isFinite(nLng) &&
    Math.abs(nLat) <= 90 && 
    Math.abs(nLng) <= 180
  );
};

const NAIROBI_CENTER: [number, number] = [-1.2921, 36.8219];
const OFFLINE_THRESHOLD_MS = 30000; // 30 seconds of silence = Offline

function MapFlyController({ center, viewMode, fitBoundsTrigger, bins }: { center: [number, number], viewMode: string, fitBoundsTrigger: number, bins: Dustbin[] }) {
  const map = useMap();
  
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 300);
  }, [viewMode, map]);

  useEffect(() => {
    if (fitBoundsTrigger > 0 && bins.length > 0) {
      const validPoints = bins
        .filter(b => isStrictlyValid(b.location.lat, b.location.lng))
        .map(b => [b.location.lat, b.location.lng] as [number, number]);
      
      if (validPoints.length > 0) {
        const bounds = L.latLngBounds(validPoints);
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
      }
    }
  }, [fitBoundsTrigger, bins, map]);

  useEffect(() => {
    if (isStrictlyValid(center[0], center[1])) {
      const currentZoom = map.getZoom();
      const safeZoom = typeof currentZoom === 'number' && !isNaN(currentZoom) ? (currentZoom < 14 ? 16 : currentZoom) : 16;
      map.flyTo(center, safeZoom, { duration: 1.5, easeLinearity: 0.25 });
    }
  }, [center, map]);
  
  return null;
}

const App: React.FC = () => {
  // Start with empty bins - devices will "appear" when they check in
  const [bins, setBins] = useState<Dustbin[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list'); 
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(NAIROBI_CENTER);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [route, setRoute] = useState<RouteOptimizationResult | null>(null);
  const [roadPath, setRoadPath] = useState<[number, number][]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  const mqttClientRef = useRef<any>(null);

  const safeSetMapCenter = useCallback((lat: any, lng: any) => {
    if (isStrictlyValid(lat, lng)) {
      setMapCenter([parseFloat(String(lat)), parseFloat(String(lng))]);
    }
  }, []);

  // Filter for Online Bins only
  const onlineBins = useMemo(() => {
    return bins.filter(bin => {
      // Manual bins are always "online"
      if (!bin.isIotDevice) return true;
      // IoT devices must have checked in recently
      return currentTime - bin.lastSeenTimestamp < OFFLINE_THRESHOLD_MS;
    });
  }, [bins, currentTime]);

  // Keep track of current time to update "Online" status
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (isStrictlyValid(lat, lng)) {
            setUserLocation({ lat, lng });
          }
        },
        (err) => console.warn("GPS unavailable", err),
        { enableHighAccuracy: true, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  useEffect(() => {
    const Paho = (window as any).Paho;
    if (!Paho) return;

    const broker = "cbd03b95e67a4445b1cdc5d33d27fc5d.s1.eu.hivemq.cloud";
    const port = 8884;
    const topic = "ecoroute/updates";
    const clientId = `ecoroute_ui_${Math.random().toString(16).slice(2, 8)}`;

    const client = new Paho.MQTT.Client(broker, port, clientId);
    mqttClientRef.current = client;

    client.onConnectionLost = () => setMqttStatus('disconnected');
    client.onMessageArrived = (message: any) => {
      try {
        const payload = JSON.parse(message.payloadString);
        const { id, name, lat, lon, fill_level, gas } = payload;
        if (!id) return;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setBins(prev => {
          const idx = prev.findIndex(b => b.id === String(id));
          const numLat = parseFloat(String(lat));
          const numLon = parseFloat(String(lon));
          const numLevel = Math.max(0, Math.min(100, parseInt(String(fill_level)) || 0));
          const numGas = parseInt(String(gas)) || 0;

          const baseLocation = idx !== -1 ? prev[idx].location : { lat: NAIROBI_CENTER[0], lng: NAIROBI_CENTER[1] };
          
          const updatedBin: Dustbin = {
            id: String(id),
            name: name || (idx !== -1 ? prev[idx].name : `Node ${id}`),
            level: numLevel,
            smell: numGas,
            lastUpdated: timestamp,
            lastSeenTimestamp: Date.now(), // HEARTBEAT
            isIotDevice: true,
            location: {
              lat: isStrictlyValid(numLat, numLon) ? numLat : baseLocation.lat,
              lng: isStrictlyValid(numLat, numLon) ? numLon : baseLocation.lng
            }
          };

          // If this is a new bin that just appeared, pinpoint it!
          if (idx === -1) {
             safeSetMapCenter(updatedBin.location.lat, updatedBin.location.lng);
          }

          if (idx !== -1) {
            const list = [...prev];
            list[idx] = updatedBin;
            return list;
          }
          return [...prev, updatedBin];
        });
      } catch (e) {
        console.error("MQTT Update Failed", e);
      }
    };

    const options = {
      useSSL: true,
      userName: "ecoroute_admin",
      password: "EcoPass123!",
      onSuccess: () => { 
        setMqttStatus('connected'); 
        client.subscribe(topic); 
      },
      onFailure: () => setMqttStatus('disconnected')
    };

    client.connect(options);
    return () => { if (client.isConnected()) client.disconnect(); };
  }, [safeSetMapCenter]);

  const criticalBins = useMemo(() => 
    onlineBins.filter(b => (b.level >= 90) || (b.smell >= 200 && b.level >= 60)), 
  [onlineBins]);

  const handleCalculateRoute = useCallback(async () => {
    if (criticalBins.length === 0) return;
    setIsOptimizing(true);
    try {
      const result = await optimizeCollectionRoute(onlineBins, userLocation || undefined);
      setRoute(result);
      
      const sequence: [number, number][] = [];
      if (userLocation && isStrictlyValid(userLocation.lat, userLocation.lng)) {
        sequence.push([userLocation.lat, userLocation.lng]);
      }
      
      result.optimizedOrder.forEach(id => {
        const b = onlineBins.find(bin => bin.id === id);
        if (b && isStrictlyValid(b.location.lat, b.location.lng)) {
          sequence.push([b.location.lat, b.location.lng]);
        }
      });

      if (sequence.length >= 2) {
        const coordQuery = sequence.map(c => `${c[1]},${c[0]}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordQuery}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.routes?.[0]) {
          const path = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRoadPath(path.filter((c: any) => isStrictlyValid(c[0], c[1])));
        } else {
          setRoadPath(sequence);
        }
      }

      if (window.innerWidth < 768) setViewMode('map');
      if (sequence.length > 0) safeSetMapCenter(sequence[0][0], sequence[0][1]);
    } catch (error) {
      console.error("Routing Optimization Error", error);
    } finally {
      setIsOptimizing(false);
    }
  }, [onlineBins, userLocation, criticalBins, safeSetMapCenter]);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <aside className="hidden md:flex w-24 bg-white border-r border-slate-200 flex-col items-center py-8 gap-10 z-30">
        <div className="bg-blue-600 p-4 rounded-[1.5rem] shadow-xl shadow-blue-200 cursor-pointer">
          <Zap className="text-white" size={28} />
        </div>
        <nav className="flex flex-col gap-8 items-center flex-1">
          <button onClick={() => setActiveTab('dashboard')} className={`p-4 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-300'}`}>
            <Activity size={24} />
          </button>
          <button onClick={() => setActiveTab('settings')} className={`p-4 rounded-2xl transition-all ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-slate-300'}`}>
            <SettingsIcon size={24} />
          </button>
        </nav>
        <div className={`w-3 h-3 rounded-full ${mqttStatus === 'connected' ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-red-500 animate-pulse'}`}></div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-6 md:px-10 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <MapIcon size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">EcoRoute <span className="text-blue-600 text-[9px] px-2 py-0.5 bg-blue-50 rounded-full font-bold">LIVE</span></h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                {onlineBins.length} Active Nodes Detected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase border ${userLocation ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>
               <Wifi size={12} /> {mqttStatus === 'connected' ? 'Cloud Connected' : 'Hardware Search...'}
             </div>
             <button onClick={() => setActiveTab(activeTab === 'dashboard' ? 'settings' : 'dashboard')} className="md:hidden p-3 bg-slate-100 rounded-xl">
               {activeTab === 'dashboard' ? <SettingsIcon size={22} /> : <Activity size={22} />}
             </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {activeTab === 'dashboard' && (
            <>
              <section className={`flex-1 md:w-[440px] md:max-w-md bg-slate-50 flex flex-col border-r border-slate-200 overflow-hidden ${viewMode === 'list' ? 'flex' : 'hidden md:flex'}`}>
                <div className="p-4 md:p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Online</p>
                      <p className="text-3xl font-black text-slate-800">{onlineBins.length}</p>
                    </div>
                    <div className={`p-6 rounded-[2.5rem] border shadow-sm transition-all ${criticalBins.length > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${criticalBins.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>Critical</p>
                      <p className={`text-3xl font-black ${criticalBins.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{criticalBins.length}</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleCalculateRoute}
                    disabled={isOptimizing || criticalBins.length === 0}
                    className="w-full py-5 bg-slate-900 text-white rounded-[2.5rem] font-black text-xs flex items-center justify-center gap-4 hover:bg-black transition-all shadow-xl disabled:opacity-40"
                  >
                    {isOptimizing ? <RefreshCw className="animate-spin" size={20} /> : <Navigation size={20} />}
                    <span>{isOptimizing ? 'Optimizing...' : 'Plan Efficient Route'}</span>
                  </button>

                  {route && (
                    <div className="bg-blue-600 text-white p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-5">
                      <div className="flex items-center justify-between mb-4">
                        <Truck size={22} className="text-blue-200" />
                        <button onClick={() => { setRoadPath([]); setRoute(null); }} className="text-blue-300"><XCircle size={22} /></button>
                      </div>
                      <p className="text-[11px] text-blue-50 leading-relaxed font-medium italic mb-4">"{route.explanation}"</p>
                      <div className="space-y-2">
                        {route.optimizedOrder.map((id, idx) => {
                          const b = onlineBins.find(bin => bin.id === id);
                          return (
                            <div key={id} onClick={() => b && safeSetMapCenter(b.location.lat, b.location.lng)} className="flex items-center gap-4 bg-white/10 p-3 rounded-2xl cursor-pointer hover:bg-white/20">
                              <div className="w-8 h-8 rounded-full bg-white text-blue-600 flex items-center justify-center text-xs font-black">{idx + 1}</div>
                              <span className="text-xs font-bold truncate">{b?.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pb-36">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Live Hardware</h3>
                      {onlineBins.length > 0 && (
                        <button onClick={() => setFitBoundsTrigger(t => t + 1)} className="text-[8px] font-black text-blue-600 uppercase border border-blue-100 px-3 py-1 rounded-full">Pinpoint All</button>
                      )}
                    </div>
                    
                    {onlineBins.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-[3.5rem] border-2 border-dashed border-slate-100">
                        <div className="relative mb-6">
                           <Radar size={48} className="text-blue-200 animate-pulse" />
                           <div className="absolute inset-0 border-4 border-blue-100 rounded-full animate-ping"></div>
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-loose">Searching for<br/>NodeMCU Signal...</p>
                        <p className="text-[9px] text-slate-300 mt-4 uppercase">Power on your IoT device to begin</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {onlineBins.map(bin => (
                          <DustbinCard 
                            key={bin.id} 
                            bin={bin} 
                            isSelected={selectedBinId === bin.id}
                            onEdit={(b) => { 
                              safeSetMapCenter(b.location.lat, b.location.lng); 
                              setSelectedBinId(b.id);
                              if (window.innerWidth < 768) setViewMode('map');
                            }} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className={`flex-1 relative h-full bg-white transition-opacity duration-300 ${viewMode === 'map' ? 'flex opacity-100' : 'hidden md:flex'}`}>
                <div className="absolute inset-0 md:m-8 bg-white rounded-none md:rounded-[3.5rem] shadow-none md:shadow-2xl overflow-hidden border-0 md:border md:border-slate-100">
                  {/* Fixed: replaced undefined initialCenter with NAIROBI_CENTER constant */}
                  <MapContainer center={NAIROBI_CENTER} zoom={15} className="w-full h-full z-0" zoomControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; EcoRoute Nairobi' />
                    <MapFlyController center={mapCenter} viewMode={viewMode} fitBoundsTrigger={fitBoundsTrigger} bins={onlineBins} />
                    
                    {userLocation && isStrictlyValid(userLocation.lat, userLocation.lng) && (
                      <Marker position={[userLocation.lat, userLocation.lng]} icon={L.divIcon({
                        className: 'user-marker',
                        html: `<div class="relative w-14 h-14 flex items-center justify-center">
                                <div class="absolute inset-0 bg-blue-600/20 rounded-full animate-ping"></div>
                                <div class="relative bg-slate-900 p-3.5 rounded-full border-4 border-white shadow-2xl text-blue-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                                </div>
                              </div>`,
                        iconSize: [56, 56], iconAnchor: [28, 28]
                      })} />
                    )}

                    {onlineBins.map(bin => {
                      const isFull = bin.level >= 90;
                      const isSmelly = bin.smell >= 200 && bin.level >= 60;
                      const statusColor = isFull ? '#ef4444' : isSmelly ? '#f59e0b' : '#22c55e';
                      const isCritical = isFull || isSmelly;
                      
                      return (
                        <Marker 
                          key={`marker_${bin.id}_${bin.level}_${bin.smell}`} 
                          position={[bin.location.lat, bin.location.lng]} 
                          icon={L.divIcon({
                            className: 'bin-marker',
                            html: `<div class="relative w-12 h-12 flex items-center justify-center">
                                    ${isCritical ? `<div class="absolute inset-0 ${isFull ? 'bg-red-500/30' : 'bg-amber-500/30'} rounded-full animate-pulse-fast"></div>` : ''}
                                    <div style="background-color: ${statusColor};" class="w-9 h-9 rounded-full border-[4px] border-white shadow-2xl flex items-center justify-center transition-all duration-500 transform ${isCritical ? 'scale-125' : 'hover:scale-110'}">
                                      <div class="w-2.5 h-2.5 rounded-full bg-white/40"></div>
                                    </div>
                                   </div>`,
                            iconSize: [48, 48], iconAnchor: [24, 24]
                          })}
                        >
                          <Popup className="custom-popup">
                            <div className="p-3 text-center">
                              <p className="font-black text-xs uppercase mb-2">{bin.name}</p>
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase">
                                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col">
                                  <span>Fill</span>
                                  <span className="text-blue-600">{bin.level}%</span>
                                </div>
                                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col">
                                  <span>Gas</span>
                                  <span className="text-amber-600">{bin.smell}</span>
                                </div>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}

                    {roadPath.length > 1 && (
                      <>
                        <Polyline positions={roadPath} color="#0f172a" weight={12} opacity={0.1} />
                        <Polyline positions={roadPath} color="#3b82f6" weight={6} />
                      </>
                    )}
                  </MapContainer>

                  <div className="absolute top-10 left-10 flex flex-col gap-4 z-[1000]">
                    <button onClick={() => setFitBoundsTrigger(t => t + 1)} className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-xl border border-slate-100 text-blue-600 hover:scale-110 active:scale-90 transition-all">
                      <Maximize size={28} />
                    </button>
                    <button onClick={() => userLocation && safeSetMapCenter(userLocation.lat, userLocation.lng)} className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-xl border border-slate-100 text-slate-600 hover:scale-110 active:scale-90 transition-all">
                      <Locate size={28} />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === 'settings' && (
            <section className="absolute inset-0 bg-slate-50 z-40 p-8 md:p-16 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl mx-auto w-full pb-24">
                <header className="flex items-center justify-between mb-16">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white rounded-[2rem] flex items-center justify-center text-slate-900 shadow-xl">
                        <SettingsIcon size={32} />
                      </div>
                      <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight">System Core</h2>
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Network Manager v5.0</p>
                      </div>
                   </div>
                   <button onClick={() => setActiveTab('dashboard')} className="p-5 bg-white rounded-[1.5rem] shadow-lg text-slate-400 hover:text-red-500 transition-all"><XCircle size={32} /></button>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                   <Settings onAddBin={(b) => {
                    const lat = b.location?.lat ?? NAIROBI_CENTER[0];
                    const lng = b.location?.lng ?? NAIROBI_CENTER[1];
                    const newBin: Dustbin = {
                      id: `node_manual_${Date.now()}`,
                      name: b.name || 'Site Marker',
                      location: { lat, lng },
                      level: 0,
                      smell: 0,
                      lastUpdated: 'Manual Entry',
                      lastSeenTimestamp: Date.now(),
                      isIotDevice: false
                    };
                    setBins(prev => [...prev, newBin]);
                    setActiveTab('dashboard');
                    safeSetMapCenter(lat, lng);
                  }} />
                </div>
              </div>
            </section>
          )}
        </div>

        {activeTab === 'dashboard' && (
          <div className="md:hidden fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center bg-white/95 backdrop-blur-3xl border border-slate-200/50 p-2.5 rounded-[3rem] shadow-2xl z-[2000]">
            <button onClick={() => setViewMode('list')} className={`flex items-center gap-3.5 px-8 py-5 rounded-full transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>
              <LayoutList size={22} />
              <span className="text-[11px] font-black uppercase">List</span>
            </button>
            <div className="w-[1.5px] h-10 bg-slate-100 mx-2"></div>
            <button onClick={() => { setViewMode('map'); setFitBoundsTrigger(t => t + 1); }} className={`flex items-center gap-3.5 px-8 py-5 rounded-full transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>
              <MapPinned size={22} />
              <span className="text-[11px] font-black uppercase">Map</span>
            </button>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 20px; }
        .custom-popup .leaflet-popup-content-wrapper { border-radius: 2.5rem; border: none; box-shadow: 0 40px 80px -15px rgba(0,0,0,0.3); }
        .leaflet-container { font-family: 'Inter', sans-serif !important; border-radius: 0 !important; }
        @media (min-width: 768px) { .leaflet-container { border-radius: 3.5rem !important; } }
        @keyframes pulse-fast { 0% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.4); opacity: 0.3; } 100% { transform: scale(1); opacity: 0.9; } }
        .animate-pulse-fast { animation: pulse-fast 1s infinite; }
      `}</style>
    </div>
  );
};

export default App;
