import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Compass, Sparkles, Heart, MessageSquare, X, Star, MapPin, Search, Loader2, Share2, User as UserIcon, Settings, LogOut, CheckCircle2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Ensure first connection works
async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// --- DATA ---
const vibeData = [
  { id: 1, name: "Deep Ellum Jazz Night", desc: "Live sax + craft cocktails downtown", tags: ["Music", "Nightlife", "Jazz"], img: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=400", lat: 32.7841, lng: -96.7847 },
  { id: 2, name: "Klyde Warren Food Trucks", desc: "Taco + boba crawl in the park", tags: ["Food", "Outdoors", "Casual"], img: "https://images.unsplash.com/photo-1565123409695-60bc288bc85b?w=400", lat: 32.7894, lng: -96.8019 },
  { id: 3, name: "Bishop Arts Rooftop", desc: "Sunset views + small plates", tags: ["Views", "Date", "Upscale"], img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400", lat: 32.7443, lng: -96.8287 },
  { id: 4, name: "White Rock Lake Kayak", desc: "Morning paddle + coffee", tags: ["Active", "Nature", "Morning"], img: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400", lat: 32.8334, lng: -96.7148 },
];

// Custom map icon
const customIcon = new L.DivIcon({
  html: `<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #e879f9, #a855f7); border-radius: 50%; border: 3px solid #0d0a1e; box-shadow: 0 0 10px rgba(232, 121, 249, 0.6);"></div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const DEFAULT_CENTER: [number, number] = [32.7767, -96.7970];
const DEFAULT_ZOOM = 11;

// Map Fly Control
function MapFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 13, { animate: true });
    }
  }, [target, map]);
  return null;
}

// Map Controls Component
function MapControls() {
  const map = useMap();
  const [showRecenter, setShowRecenter] = useState(false);

  useMapEvents({
    movestart: () => {
      setShowRecenter(false);
    },
    moveend: () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const dist = center.distanceTo(L.latLng(DEFAULT_CENTER));
      
      if (dist > 500 || zoom !== DEFAULT_ZOOM) {
        setShowRecenter(true);
      } else {
        setShowRecenter(false);
      }
    }
  });

  return (
    <AnimatePresence>
      {showRecenter && (
        <motion.div 
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          className="absolute bottom-6 left-1/2 z-[1000]"
        >
          <button 
            onClick={(e) => {
              e.stopPropagation();
              map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
              setShowRecenter(false);
            }}
            className="bg-card-bg/95 backdrop-blur-md border border-primary/40 text-white px-5 py-2.5 rounded-full shadow-[0_0_20px_rgba(232,121,249,0.3)] text-sm font-bold flex items-center gap-2 hover:bg-card-bg hover:scale-105 transition-all text-nowrap"
          >
            <MapPin className="w-4 h-4 text-primary" />
            Recenter Map
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const [view, setView] = useState('discover');
  const [currentCard, setCurrentCard] = useState(0);
  const [matches, setMatches] = useState<typeof vibeData>([]);
  const [showMatchModal, setShowMatchModal] = useState<typeof vibeData[0] | null>(null);
  const [chatTheme, setChatTheme] = useState<typeof vibeData[0] | null>(null);
  
  // Firebase Auth State
  const [user, setUser] = useState<User | null>(null);
  const [savedVibes, setSavedVibes] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user doc exists
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', u.uid), {
              email: u.email,
              createdAt: serverTimestamp(),
              theme: 'dark'
            });
          }
          // Fetch saved vibes
          const q = query(collection(db, 'savedVibes'), where('userId', '==', u.uid), orderBy('savedAt', 'desc'));
          const snapshot = await getDocs(q);
          const vibes = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
          setSavedVibes(vibes);
          // Set matches from saved vibes where possible, or just append
          // for local state we'll merge
          const existingMatchesIds = new Set(vibes.map(v => v.vibeId));
          setMatches(vibeData.filter(v => existingMatchesIds.has(v.id)));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'users/savedVibes');
        }
      } else {
        setSavedVibes([]);
        setMatches([]);
      }
    });
    return unsub;
  }, []);

  // Map Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);

  const activeVibe = vibeData[currentCard];

  const saveVibe = async (vibe: typeof vibeData[0]) => {
    setMatches(prev => {
      if (prev.find(m => m.id === vibe.id)) return prev;
      return [...prev, vibe];
    });

    if (user) {
      try {
        const savedVibeRef = doc(collection(db, 'savedVibes'));
        await setDoc(savedVibeRef, {
          vibeId: vibe.id,
          name: vibe.name,
          img: vibe.img,
          desc: vibe.desc,
          lat: vibe.lat,
          lng: vibe.lng,
          userId: user.uid,
          savedAt: serverTimestamp()
        });
        setSavedVibes(prev => [{
          id: savedVibeRef.id,
          vibeId: vibe.id,
          name: vibe.name,
          img: vibe.img,
          desc: vibe.desc,
          lat: vibe.lat,
          lng: vibe.lng,
          userId: user.uid,
          savedAt: new Date() // Fake for local
        }, ...prev]);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'savedVibes');
      }
    }
  };

  const handleSwipe = (direction: 'left' | 'right' | 'up') => {
    if (!activeVibe) return;
    
    if (direction === 'right' || direction === 'up') {
      saveVibe(activeVibe);
      if (direction === 'up') {
        setShowMatchModal(activeVibe);
      }
    }
    
    setCurrentCard(prev => prev + 1);
  };

  const openChat = (vibe: typeof vibeData[0]) => {
    setChatTheme(vibe);
    setView('chat');
  };

  const handleMapSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check local vibes first
    const vibeMatch = vibeData.find(v => 
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    if (vibeMatch) {
      setMapTarget([vibeMatch.lat, vibeMatch.lng]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setMapTarget([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-[430px] mx-auto bg-gradient-to-b from-bg to-card-bg relative shadow-2xl overflow-hidden">
      
      {/* Header */}
      <header className="px-5 py-3 flex justify-between items-center bg-bg/80 backdrop-blur-md border-b border-primary/20 z-50 shrink-0">
        <div className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Vicinity Vibe 
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button onClick={() => setView('profile')} className="flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-full hover:bg-primary/30 transition-colors">
            {user ? (
              <><UserIcon className="w-4 h-4" /> <span className="max-w-[80px] truncate">{user.displayName || user.email?.split('@')[0]}</span></>
            ) : (
              'Sign In'
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          
          {/* DISCOVER VIEW */}
          {view === 'discover' && (
            <motion.div 
              key="discover" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 1.05 }} 
              className="absolute inset-0 flex flex-col items-center justify-center p-5"
            >
              {activeVibe ? (
                <SwipeCard vibe={activeVibe} onSwipe={handleSwipe} />
              ) : (
                <div className="text-center text-text-muted flex flex-col items-center gap-4">
                  <Compass className="w-16 h-16 opacity-50" />
                  <p>No more vibes nearby. Check back later!</p>
                </div>
              )}
            </motion.div>
          )}

          {/* MAP VIEW */}
          {view === 'map' && (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
              <div className="absolute top-4 inset-x-4 z-[1000] flex flex-col gap-2">
                <div className="bg-bg/90 backdrop-blur-md p-3 rounded-xl border border-primary/20 shadow-lg flex justify-between items-center">
                  <div>
                    <div className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Vibes Near You</div>
                    <div className="text-xs text-text-muted mt-1">Tap pins to see details</div>
                  </div>
                </div>
                
                <form 
                  onSubmit={handleMapSearch} 
                  className="bg-bg/90 backdrop-blur-md flex items-center gap-2 p-1.5 rounded-full border border-primary/20 shadow-lg"
                >
                  <input
                    type="text"
                    placeholder="Search locations or vibes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-sm px-3 py-1.5 outline-none placeholder:text-text-muted"
                  />
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </form>
              </div>

              <MapContainer 
                center={DEFAULT_CENTER} 
                zoom={DEFAULT_ZOOM} 
                className="w-full h-full z-0"
                zoomControl={false}
              >
                <MapControls />
                <MapFlyTo target={mapTarget} />
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {vibeData.map(vibe => (
                  <Marker key={vibe.id} position={[vibe.lat, vibe.lng]} icon={customIcon}>
                    <Popup className="custom-popup">
                      <div className="font-bold text-gray-900">{vibe.name}</div>
                      <div className="text-sm text-gray-700">{vibe.desc}</div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </motion.div>
          )}

          {/* MATCHES VIEW */}
          {view === 'matches' && (
            <motion.div key="matches" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 p-5 overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Your Matches</h2>
              {matches.length === 0 ? (
                <p className="text-text-muted">No matches yet. Keep swiping!</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {matches.map((m, i) => (
                    <div key={i} onClick={() => openChat(m)} className="bg-card-bg p-3 rounded-2xl border border-primary/10 flex gap-4 items-center cursor-pointer hover:border-primary/50 transition-colors">
                      <img src={m.img} alt={m.name} className="w-16 h-16 rounded-xl object-cover" />
                      <div>
                        <div className="font-bold">{m.name}</div>
                        <div className="text-xs text-text-muted mt-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Tap to chat with AI</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* CHAT VIEW */}
          {view === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute inset-0 flex flex-col bg-bg">
              <div className="p-4 border-b border-primary/20 flex justify-between items-center bg-card-bg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">AI Concierge</h3>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">{chatTheme?.name || 'General Info'}</p>
                  </div>
                </div>
                <button onClick={() => setView('matches')} className="p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5"/></button>
              </div>
              <ChatInterface themeName={chatTheme?.name || 'this location'} />
            </motion.div>
          )}

          {/* PROFILE VIEW */}
          {view === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="absolute inset-0 overflow-y-auto p-5 pb-24">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2"><UserIcon className="text-primary"/> Profile</h2>
                <button onClick={() => setView('discover')} className="p-2 bg-card-bg rounded-full border border-primary/20"><X className="w-5 h-5"/></button>
              </div>

              {user ? (
                <div className="space-y-6">
                  <div className="bg-card-bg rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-lg border border-primary/10">
                    <div className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-xl mb-4">
                      {user.email?.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-bold text-lg">{user.displayName || 'Vibe Explorer'}</div>
                    <div className="text-sm text-text-muted mb-4">{user.email}</div>
                    {user.emailVerified && <div className="text-xs bg-success/20 text-success px-2 py-1 rounded-full flex items-center gap-1 mb-4"><CheckCircle2 className="w-3 h-3"/> Verified</div>}
                    <button 
                      onClick={async () => {
                        await signOut(auth);
                        setView('discover');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-error/20 text-error rounded-xl transition-colors font-medium text-sm"
                    >
                      <LogOut className="w-4 h-4"/> Sign Out
                    </button>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2 border-b border-white/10 pb-2"><Settings className="w-5 h-5 text-secondary"/> Settings & Activity</h3>
                    <div className="bg-card-bg rounded-2xl border border-primary/10 overflow-hidden divide-y divide-white/5">
                      <div className="p-4 flex justify-between items-center">
                        <span className="font-medium text-sm">Theme</span>
                        <span className="text-sm text-text-muted">Dark</span>
                      </div>
                      <div className="p-4 flex justify-between items-center">
                        <span className="font-medium text-sm">Total Saved Vibes</span>
                        <span className="text-primary font-bold">{savedVibes.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card-bg rounded-3xl p-8 text-center flex flex-col items-center shadow-lg border border-primary/20">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <Compass className="w-12 h-12 text-primary opacity-50" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Join Vicinity Vibe</h3>
                  <p className="text-text-muted text-sm mb-8">Save your matches, chat with AI, and access your vibes on any device.</p>
                  
                  <button 
                    onClick={async () => {
                      const provider = new GoogleAuthProvider();
                      try {
                        await signInWithPopup(auth, provider);
                      } catch (error: any) {
                        console.error('Sign-in failed', error);
                        alert(`Sign-in failed: ${error.message}`);
                      }
                    }}
                    className="w-full py-4 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-[0_0_20px_rgba(232,121,249,0.3)] hover:opacity-90 transition-all flex justify-center items-center gap-3"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Sign in with Google
                  </button>
                  <p className="text-[10px] text-text-muted mt-4 max-w-[200px] leading-tight">By signing in, you agree to our Terms of Service and Privacy Policy.</p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="h-16 flex justify-around items-center bg-bg/95 backdrop-blur-md border-t border-primary/20 shrink-0 z-50">
        <NavButton icon={Compass} label="Discover" active={view === 'discover'} onClick={() => setView('discover')} />
        <NavButton icon={Search} label="Map" active={view === 'map'} onClick={() => setView('map')} />
        <NavButton icon={Heart} label="Matches" active={view === 'matches'} onClick={() => setView('matches')} />
        <NavButton icon={UserIcon} label="Profile" active={view === 'profile'} onClick={() => setView('profile')} />
      </nav>

      {/* Match Modal */}
      <AnimatePresence>
        {showMatchModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowMatchModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }}
              className="bg-card-bg border border-primary/30 p-8 rounded-3xl w-full text-center shadow-[0_0_50px_rgba(232,121,249,0.3)] relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
              <Sparkles className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
              <h2 className="text-3xl font-extrabold text-white mb-2 font-sans tracking-tight">It's a Vibe!</h2>
              <p className="text-text-muted mb-8">You super-liked <span className="text-primary font-medium">{showMatchModal.name}</span>.</p>
              
              <button 
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                onClick={() => {
                  setShowMatchModal(null);
                  openChat(showMatchModal);
                }}
              >
                Plan your visit <MessageSquare className="w-5 h-5" />
              </button>
              <button 
                className="mt-4 text-text-muted text-sm font-medium hover:text-white"
                onClick={() => setShowMatchModal(null)}
              >
                Keep Vibing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// --- SUBCOMPONENTS ---

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-primary' : 'text-text-muted hover:text-white'}`}>
      <Icon className={`w-6 h-6 ${active ? 'fill-primary/20' : ''}`} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function SwipeCard({ vibe, onSwipe }: { vibe: typeof vibeData[0], onSwipe: (dir: 'left' | 'right' | 'up') => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 100) onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
    else if (info.offset.y < -100) onSwipe('up');
  };

  return (
    <div className="relative w-full h-[500px] flex items-center justify-center">
      <motion.div
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        style={{ x, y, rotate, opacity }}
        className="absolute w-full max-w-[360px] h-[480px] bg-card-bg rounded-3xl shadow-2xl border border-primary/20 overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <img src={vibe.img} alt={vibe.name} className="w-full h-3/5 object-cover pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-3/5 bg-gradient-to-b from-black/40 via-transparent to-black border-none pointer-events-none" />
        
        <button 
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (navigator.share) {
              navigator.share({
                title: vibe.name,
                text: vibe.desc,
                url: window.location.href,
              }).catch(console.error);
            } else {
              navigator.clipboard.writeText(`${vibe.name} - ${window.location.href}`);
              alert(`Link to ${vibe.name} copied to clipboard!`);
            }
          }}
          className="absolute top-4 right-4 z-20 w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white hover:bg-black/50 transition-colors cursor-pointer cursor-default"
        >
          <Share2 className="w-5 h-5 pointer-events-none" />
        </button>

        <div className="p-5 pb-6 bg-card-bg h-2/5 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 leading-tight">{vibe.name}</h2>
            <p className="text-sm text-text-muted mb-4">{vibe.desc}</p>
            <div className="flex flex-wrap gap-2">
              {vibe.tags.map(tag => (
                <span key={tag} className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Action Buttons below card */}
      <div className="absolute -bottom-4 inset-x-0 flex justify-center gap-6 z-10">
        <button onClick={() => onSwipe('left')} className="w-14 h-14 bg-card-bg border-2 border-error/50 rounded-full flex items-center justify-center text-error hover:bg-error/10 hover:scale-110 transition-all shadow-lg"><X className="w-6 h-6" /></button>
        <button onClick={() => onSwipe('up')} className="w-12 h-12 bg-card-bg border-2 border-primary/50 text-primary rounded-full flex items-center justify-center hover:bg-primary/10 hover:scale-110 transition-all shadow-lg translate-y-2"><Star className="w-5 h-5 fill-primary/30" /></button>
        <button onClick={() => onSwipe('right')} className="w-14 h-14 bg-card-bg border-2 border-success/50 rounded-full flex items-center justify-center text-success hover:bg-success/10 hover:scale-110 transition-all shadow-lg"><Heart className="w-6 h-6 fill-success/30" /></button>
      </div>
    </div>
  );
}

function ChatInterface({ themeName }: { themeName: string }) {
  const [messages, setMessages] = useState([{ role: 'model', text: `Hey! I can help you plan your visit to ${themeName}. What do you want to know?` }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeName,
          message: userMessage,
          history: messages.slice(-12),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'AI request failed.');
      }

      setMessages(prev => [...prev, {
        role: 'model',
        text: payload.text || 'Sorry, I blanked out! Try again.',
      }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        role: 'model',
        text: 'The AI concierge is temporarily unavailable. Please try again in a moment.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${m.role === 'user' ? 'bg-gradient-to-r from-primary to-secondary text-white rounded-tr-sm' : 'bg-white/10 text-text-main rounded-tl-sm'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl p-3 text-sm bg-white/10 text-white/50 rounded-tl-sm flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
              <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 bg-card-bg border-t border-primary/20 shrink-0">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Ask AI about this vibe..." 
            className="flex-1 bg-white/5 border border-primary/20 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-sm"
          />
          <button 
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-primary text-white rounded-xl px-5 font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
