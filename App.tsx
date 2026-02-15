
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { 
  Navigation, 
  Trash2, 
  Settings as SettingsIcon, 
  RefreshCw, 
  ChevronRight, 
  Activity,
  Maximize2,
  Wifi,
  WifiOff,
  Truck,
  Locate,
  Map as MapIcon,
  XCircle
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

const INITIAL_BINS: Dustbin[] = [];

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

const App: React.FC = () => {
  const [bins, setBins] = useState<Dustbin[]>(INITIAL_BINS);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-1.1145, 36.6620]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [route, setRoute] = useState<RouteOptimizationResult | null>(null);
  const [roadPath, setRoadPath] = useState<[number, number][]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  
  const mqttClientRef = useRef<any>(null);

  // Fetch User Geolocation
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(loc);
          setMapCenter([loc.lat, loc.lng]);
        },
        (error) => console.error("Location error", error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // HiveMQ MQTT Logic - Optimized for real-time reactivity
  useEffect(() => {
    const Paho = (window as any).Paho;
    if (!Paho) return;

    const broker = "cbd03b95e67a4445b1cdc5d33d27fc5d.s1.eu.hivemq.cloud";
    const port = 8884;
    const topic = "ecoroute/updates";
    const clientId = "ecoroute_web_" + Math.random().toString(16).substr(2, 8);

    const client = new Paho.MQTT.Client(broker, port, clientId);
    mqttClientRef.current = client;

    client.onConnectionLost = () => setMqttStatus('disconnected');
    client.onMessageArrived = (message: any) => {
      try {
        const payload = JSON.parse(message.payloadString);
        const { id, name, lat, lon, fill_level, gas } = payload;
        if (!id) return;
        
        // Use functional update to ensure no messages are lost
        setBins(prevBins => {
          const existsIndex = prevBins.findIndex(b => b.id === id);
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          if (existsIndex !== -1) {
            const updatedBins = [...prevBins];
            updatedBins[existsIndex] = {
              ...updatedBins[existsIndex],
              name: name || updatedBins[existsIndex].name,
              level: fill_level !== undefined ? Number(fill_level) : updatedBins[existsIndex].level,
              smell: gas !== undefined ? Number(gas) : updatedBins[existsIndex].smell,
              location: { 
                lat: lat !== undefined ? Number(lat) : updatedBins[existsIndex].location.lat, 
                lng: lon !== undefined ? Number(lon) : updatedBins[existsIndex].location.lng 
              },
              lastUpdated: now,
              isIotDevice: true
            };
            return updatedBins;
          } else {
            return [...prevBins, {
              id: String(id),
              name: name || `Node: ${id}`,
              location: { lat: Number(lat) || -1.1145, lng: Number(lon) || 36.6620 },
              level: Number(fill_level) || 0,
              smell: Number(gas) || 0,
              lastUpdated: now,
              isIotDevice: true
            }];
          }
        });
      } catch (e) { console.error("MQTT Payload Processing Error", e); }
    };

    const options = {
      useSSL: true,
      userName: "ecoroute_admin",
      password: "EcoPass123!",
      onSuccess: () => { 
        setMqttStatus('connected'); 
        client.subscribe(topic); 
      },
      onFailure: (err: any) => {
        console.error("MQTT Connection Failed", err);
        setMqttStatus('disconnected');
      }
    };
    client.connect(options);
    return () => { if (client.isConnected()) client.disconnect(); };
  }, []);

  // Fetch real road path using OSRM
  const getRealRoadPath = async (coords: [number, number][]) => {
    if (coords.length < 2) return [];
    try {
      const coordString = coords.map(c => `${c[1]},${c[0]}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        return data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
      }
    } catch (error) {
      console.error("Routing API error", error);
    }
    return coords; 
  };

  const handleOptimizeRoute = async () => {
    if (binsToCollect.length === 0) return;
    setIsOptimizing(true);
    setRoadPath([]);
    try {
      const result = await optimizeCollectionRoute(bins, userLocation || undefined);
      setRoute(result);
      
      const sequence: [number, number][] = [];
      if (userLocation) sequence.push([userLocation.lat, userLocation.lng]);
      
      result.optimizedOrder.forEach(id => {
        const b = bins.find(bin => bin.id === id);
        if (b) sequence.push([b.location.lat, b.location.lng]);
      });

      const actualRoad = await getRealRoadPath(sequence);
      setRoadPath(actualRoad);
    } catch (error) {
      console.error(error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const binsToCollect = bins.filter(b => (b.level >= 90) || (b.smell >= 200 && b.level >= 60));

  return (
    <div className="flex flex-col md:flex-row h-screen w-full text-slate-900 overflow-hidden bg-slate-50">
      <aside className="w-full md:w-20 bg-white border-r border-slate-200 flex flex-row md:flex-col items-center py-4 px-6 md:px-0 gap-8 z-10 shadow-sm">
        <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-200">
          <Navigation className="text-white" size={24} />
        </div>
        <nav className="flex flex-row md:flex-col gap-6 items-center flex-1 justify-center md:justify-start">
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}><Activity size={24} /></button>
          <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}><SettingsIcon size={24} /></button>
        </nav>
        <div className="hidden md:flex flex-col items-center gap-4 pb-4">
           <div className={`w-2 h-2 rounded-full ${mqttStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
              <MapIcon size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">EcoRoute Navigation</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {userLocation ? 'GPS Location Active' : 'Acquiring GPS Signal...'}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${mqttStatus === 'connected' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {mqttStatus === 'connected' ? 'IoT Cloud Linked' : 'Reconnecting...'}
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-4 md:gap-6 overflow-hidden">
          <section className="w-full md:w-96 flex flex-col gap-4 md:gap-6 overflow-y-auto pr-1">
            {activeTab === 'dashboard' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Sensors</p>
                    <p className="text-2xl font-black text-slate-800">{bins.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-red-400 uppercase mb-1">Pickups Required</p>
                    <p className="text-2xl font-black text-red-600">{binsToCollect.length}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={handleOptimizeRoute}
                    disabled={isOptimizing || binsToCollect.length === 0}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-xl shadow-blue-100 uppercase tracking-widest"
                  >
                    {isOptimizing ? <RefreshCw className="animate-spin" size={18} /> : <Navigation size={18} />}
                    <span>{isOptimizing ? 'Finding Road...' : 'Show Shortest Road'}</span>
                  </button>
                  {roadPath.length > 0 && (
                    <button onClick={() => { setRoadPath([]); setRoute(null); }} className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600">
                      <XCircle size={14} /> Clear Active Route
                    </button>
                  )}
                </div>

                {route && (
                  <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Truck size={20} className="text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-widest">Roadway Computed</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium mb-3 italic">
                      "{route.explanation}"
                    </p>
                    <div className="space-y-2">
                       {route.optimizedOrder.map((id, idx) => {
                         const b = bins.find(bin => bin.id === id);
                         return (
                           <div key={id} className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                             <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-black">{idx + 1}</div>
                             <span className="text-[11px] font-bold truncate">{b?.name}</span>
                           </div>
                         );
                       })}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IoT Hardware List</h3>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-[9px] font-black text-green-600 uppercase">Live Feed</span>
                    </div>
                  </div>
                  {bins.length === 0 ? (
                    <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                      <Wifi size={24} className="mx-auto text-slate-200 mb-3 animate-bounce" />
                      <p className="text-xs font-bold text-slate-400">Waiting for data from NodeMCU...</p>
                    </div>
                  ) : (
                    bins.map(bin => (
                      <DustbinCard key={bin.id} bin={bin} onEdit={(b) => { setMapCenter([b.location.lat, b.location.lng]); setSelectedBinId(b.id); }} isSelected={selectedBinId === bin.id} />
                    ))
                  )}
                </div>
              </>
            ) : (
              <Settings onAddBin={() => {}} />
            )}
          </section>

          <section className="flex-1 relative min-h-[400px] md:min-h-0">
            <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
              <MapContainer center={mapCenter} zoom={14} className="w-full h-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <ChangeView center={mapCenter} />
                
                {userLocation && (
                  <Marker position={[userLocation.lat, userLocation.lng]} icon={L.divIcon({
                    className: 'user-pos',
                    html: `<div class="bg-blue-600 p-2 rounded-full border-4 border-white shadow-2xl flex items-center justify-center text-white scale-125">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                          </div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                  })}>
                    <Popup><span className="font-black text-xs uppercase">Collection Start (You)</span></Popup>
                  </Marker>
                )}

                {bins.map(bin => {
                  const isFull = bin.level >= 90;
                  const isSmelly = bin.smell >= 200 && bin.level >= 60;
                  const color = isFull ? '#ef4444' : isSmelly ? '#f59e0b' : '#22c55e';
                  const needsCollection = isFull || isSmelly;
                  
                  // CRITICAL: Leaflet Markers need a NEW KEY when internal properties (like color) change 
                  // otherwise they don't redraw. We add level and smell to the key.
                  const markerKey = `${bin.id}-${bin.level}-${bin.smell}`;

                  const icon = L.divIcon({
                    className: 'custom-icon',
                    html: `<div style="background-color: ${color};" class="w-8 h-8 rounded-full border-4 border-white shadow-xl flex items-center justify-center transition-all duration-300 transform ${needsCollection ? 'scale-125 animate-pulse' : ''}">
                            <div class="w-2 h-2 rounded-full bg-white"></div>
                           </div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 32]
                  });

                  return (
                    <Marker 
                      key={markerKey} 
                      position={[bin.location.lat, bin.location.lng]} 
                      icon={icon}
                      zIndexOffset={needsCollection ? 1000 : 0} // Ensure priority bins are on TOP
                    >
                      <Popup>
                        <div className="p-1 min-w-[120px]">
                          <p className="font-black text-xs text-slate-800 uppercase mb-2">{bin.name}</p>
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            <div className={`p-1 rounded font-bold ${isFull ? 'bg-red-50 text-red-600' : 'bg-slate-50'}`}>Lvl: {bin.level}%</div>
                            <div className={`p-1 rounded font-bold ${isSmelly ? 'bg-amber-50 text-amber-600' : 'bg-slate-50'}`}>Gas: {bin.smell}</div>
                          </div>
                          <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase">Last: {bin.lastUpdated}</p>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* THE HIGHLIGHTED ROAD */}
                {roadPath.length > 1 && (
                  <>
                    <Polyline positions={roadPath} color="#1e3a8a" weight={10} opacity={0.3} lineCap="round" />
                    <Polyline positions={roadPath} color="#3b82f6" weight={5} opacity={1} lineCap="round" lineJoin="round" />
                  </>
                )}
              </MapContainer>
              
              <div className="absolute top-6 left-6 flex flex-col gap-2 z-[1000]">
                <button 
                  onClick={() => userLocation && setMapCenter([userLocation.lat, userLocation.lng])}
                  className="bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-slate-200 text-blue-600 hover:bg-white transition-all group"
                >
                  <Locate size={20} className="group-active:scale-75 transition-transform" />
                </button>
              </div>

              {/* Map Legend Overlay */}
              <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-slate-200 z-[1000] min-w-[160px]">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Status Map</p>
                <div className="space-y-2 text-[10px] font-bold">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div> <span>Full (Collect)</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div> <span>Smelly (Collect)</span></div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div> <span>Healthy (Skip)</span></div>
                  {roadPath.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-slate-100 flex items-center gap-2">
                      <div className="w-6 h-1 bg-blue-500 rounded-full"></div> <span>Navigating Road</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
