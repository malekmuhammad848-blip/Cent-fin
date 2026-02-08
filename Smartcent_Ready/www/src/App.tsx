import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ───
interface Track {
  id: string;
  title: string;
  artist: string;
  thumb: string;
  views?: string;
}
type Screen = 'home' | 'search' | 'library' | 'settings';
type Lang = 'en' | 'ar';

// ─── Constants ───
const API = 'AIzaSyD-V3XAwcoCDqBY3UdJS0cNKPB9PBgMu4Q';
const GOLD = '#D4AF37';
const GOLD2 = '#B8941F';

// ─── Translations ───
const TX: Record<Lang, Record<string, string>> = {
  en: {
    home: 'Home', search: 'Search', library: 'Library', settings: 'Settings',
    trending: 'Trending Now', newRel: 'New Releases', forYou: 'For You',
    favs: 'Favorites', history: 'Recent', searchPh: 'Search songs, artists...',
    noResults: 'No results found', noFav: 'No favorites yet',
    noHist: 'No listening history', tapHeart: 'Tap ♥ on any song to save it',
    lang: 'Language', quality: 'Audio Quality', notif: 'Notifications',
    about: 'About', dev: 'Developed by Malek', ver: 'Version 1.0.0',
    nowPlaying: 'NOW PLAYING', hi: 'Good Evening',
    listening: 'Listening...', quickPicks: 'Quick Picks',
    high: 'High', medium: 'Medium', low: 'Low',
    discover: 'Discover new music', bgPlay: 'Background Playback',
    bgPlayDesc: 'Keep music playing when app is minimized',
  },
  ar: {
    home: 'الرئيسية', search: 'البحث', library: 'المكتبة', settings: 'الإعدادات',
    trending: 'الرائج الآن', newRel: 'إصدارات جديدة', forYou: 'مقترح لك',
    favs: 'المفضلة', history: 'الأخيرة', searchPh: 'ابحث عن أغاني، فنانين...',
    noResults: 'لا توجد نتائج', noFav: 'لا توجد مفضلات',
    noHist: 'لا يوجد سجل استماع', tapHeart: 'اضغط ♥ لحفظ الأغنية',
    lang: 'اللغة', quality: 'جودة الصوت', notif: 'الإشعارات',
    about: 'حول التطبيق', dev: 'تطوير بواسطة Malek', ver: 'الإصدار 1.0.0',
    nowPlaying: 'يعمل الآن', hi: 'مساء الخير',
    listening: 'جاري الاستماع...', quickPicks: 'اختيارات سريعة',
    high: 'عالية', medium: 'متوسطة', low: 'منخفضة',
    discover: 'اكتشف موسيقى جديدة', bgPlay: 'التشغيل في الخلفية',
    bgPlayDesc: 'استمر بتشغيل الموسيقى عند تصغير التطبيق',
  }
};

const GENRES = [
  { name: 'Pop', emoji: '🎤', color: '#E91E63' },
  { name: 'Rock', emoji: '🎸', color: '#FF5722' },
  { name: 'Hip Hop', emoji: '🎧', color: '#9C27B0' },
  { name: 'Jazz', emoji: '🎺', color: '#2196F3' },
  { name: 'Classical', emoji: '🎻', color: '#4CAF50' },
  { name: 'R&B', emoji: '💜', color: '#673AB7' },
  { name: 'Electronic', emoji: '🎹', color: '#00BCD4' },
  { name: 'Arabic', emoji: '🪘', color: '#FF9800' },
];

// ─── Helpers ───
function decode(s: string) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function fmtViews(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── API ───
async function searchYT(q: string): Promise<Track[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(q + ' music')}&type=video&key=${API}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('API Error');
  const d = await r.json();
  if (!d.items) return [];
  return d.items.filter((i: any) => i.id?.videoId).map((i: any) => ({
    id: i.id.videoId,
    title: decode(i.snippet.title),
    artist: decode(i.snippet.channelTitle),
    thumb: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.medium?.url || '',
  }));
}

async function getTrending(): Promise<Track[]> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=10&maxResults=25&regionCode=US&key=${API}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('API Error');
  const d = await r.json();
  if (!d.items) return [];
  return d.items.map((i: any) => ({
    id: typeof i.id === 'string' ? i.id : i.id.videoId,
    title: decode(i.snippet.title),
    artist: decode(i.snippet.channelTitle),
    thumb: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.medium?.url || '',
    views: fmtViews(parseInt(i.statistics?.viewCount || '0')),
  }));
}

// ════════════════════════════════════════════════════
// ═══════ BACKGROUND AUDIO ENGINE (BULLETPROOF) ═════
// ════════════════════════════════════════════════════

class BackgroundAudioEngine {
  private silentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private wakeLock: any = null;
  private keepAliveInterval: any = null;
  // Service worker registered on init

  async init() {
    // 1. Register Service Worker for background persistence
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {}
    }

    // 2. Create silent HTML5 audio element (keeps audio session alive)
    this.silentAudio = document.createElement('audio');
    this.silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/k0RaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+M4wAAEAAH/AAAAEAAANICAAATQAAAB/+M4wBoAAAH/AAAAEAAANICAAATQAAAB';
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0.001;
    this.silentAudio.setAttribute('playsinline', '');
    this.silentAudio.setAttribute('webkit-playsinline', '');
    this.silentAudio.preload = 'auto';

    // 3. Create Web Audio API context with silent oscillator
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 0.001; // Nearly silent
      this.gainNode.connect(this.audioCtx.destination);
    } catch {}
  }

  async activate() {
    // Play silent audio to keep audio session alive
    if (this.silentAudio) {
      try { await this.silentAudio.play(); } catch {}
    }

    // Resume AudioContext
    if (this.audioCtx?.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch {}
    }

    // Start silent oscillator
    if (this.audioCtx && !this.oscillator) {
      try {
        this.oscillator = this.audioCtx.createOscillator();
        this.oscillator.frequency.value = 1; // 1Hz - inaudible
        this.oscillator.connect(this.gainNode!);
        this.oscillator.start();
      } catch {}
    }

    // Request Wake Lock
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          // Re-acquire wake lock if released
          if (this.keepAliveInterval) {
            setTimeout(() => this.requestWakeLock(), 1000);
          }
        });
      } catch {}
    }

    // Start keep-alive ping to service worker
    this.startKeepAlive();
  }

  private async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      // Ping service worker to keep it alive
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage('keepalive');
      }
      // Ensure AudioContext is running
      if (this.audioCtx?.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      // Ensure silent audio is playing
      if (this.silentAudio?.paused) {
        this.silentAudio.play().catch(() => {});
      }
    }, 5000);
  }

  deactivate() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.oscillator) {
      try { this.oscillator.stop(); } catch {}
      this.oscillator = null;
    }
    if (this.silentAudio) {
      this.silentAudio.pause();
    }
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch {}
      this.wakeLock = null;
    }
  }

  // Call this when visibility changes
  async onVisibilityChange(isHidden: boolean) {
    if (isHidden) {
      // Going to background - ensure everything stays alive
      await this.activate();
    } else {
      // Coming back to foreground - resume AudioContext
      if (this.audioCtx?.state === 'suspended') {
        try { await this.audioCtx.resume(); } catch {}
      }
    }
  }
}

// ════════════════════════════════════════
// ═══════════ MAIN APP ═══════════════════
// ════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<Track[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [listening, setListening] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [libTab, setLibTab] = useState<'fav' | 'hist'>('fav');
  const [notifOn, setNotifOn] = useState(true);
  const [audioQ, setAudioQ] = useState('high');
  const [animHeart, setAnimHeart] = useState('');
  const [favs, setFavs] = useState<Track[]>(() => {
    try { return JSON.parse(localStorage.getItem('cent_f') || '[]'); } catch { return []; }
  });
  const [hist, setHist] = useState<Track[]>(() => {
    try { return JSON.parse(localStorage.getItem('cent_h') || '[]'); } catch { return []; }
  });

  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const queueRef = useRef<Track[]>([]);
  const trackRef = useRef<Track | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPlayingRef = useRef(false);
  const bgEngineRef = useRef<BackgroundAudioEngine | null>(null);
  const savedPositionRef = useRef(0);
  const bgCheckRef = useRef<any>(null);

  const t = TX[lang];
  const rtl = lang === 'ar';

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { trackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { localStorage.setItem('cent_f', JSON.stringify(favs)); }, [favs]);
  useEffect(() => { localStorage.setItem('cent_h', JSON.stringify(hist)); }, [hist]);

  // ─── Initialize Background Audio Engine ───
  useEffect(() => {
    const engine = new BackgroundAudioEngine();
    engine.init();
    bgEngineRef.current = engine;
    return () => { engine.deactivate(); };
  }, []);

  // ─── Activate background engine when music plays ───
  useEffect(() => {
    if (isPlaying && bgEngineRef.current) {
      bgEngineRef.current.activate();
    }
  }, [isPlaying]);

  // ─── Load YT API + trending ───
  useEffect(() => {
    if (!(window as any).YT) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    getTrending()
      .then(data => { setTrending(data); setLoading(false); })
      .catch(() => setLoading(false));
    const fb = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(fb);
  }, []);

  // ─── BULLETPROOF Background Playback System ───
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // === APP WENT TO BACKGROUND ===
        // Save current position
        if (playerRef.current && isPlayingRef.current) {
          try {
            savedPositionRef.current = playerRef.current.getCurrentTime() || 0;
          } catch {}
        }

        // Activate background engine
        if (bgEngineRef.current) {
          bgEngineRef.current.onVisibilityChange(true);
        }

        // Start aggressive background check every 2 seconds
        if (bgCheckRef.current) clearInterval(bgCheckRef.current);
        bgCheckRef.current = setInterval(() => {
          if (playerRef.current && isPlayingRef.current) {
            try {
              const state = playerRef.current.getPlayerState();
              // States: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
              if (state === 2 || state === -1 || state === 5) {
                // Player stopped - force resume
                playerRef.current.playVideo();
              }
              if (state === 0) {
                // Video ended - should have been caught by onStateChange
                // but just in case, trigger next
                const q = queueRef.current;
                const ct = trackRef.current;
                if (ct && q.length > 0) {
                  const idx = q.findIndex(x => x.id === ct.id);
                  const nextIdx = (idx >= 0 && idx < q.length - 1) ? idx + 1 : 0;
                  if (q[nextIdx]) {
                    playTrackInternal(q[nextIdx]);
                  }
                }
              }
              // Update saved position
              const pos = playerRef.current.getCurrentTime();
              if (pos > 0) savedPositionRef.current = pos;
            } catch {}
          }
        }, 2000);
      } else {
        // === APP CAME BACK TO FOREGROUND ===
        if (bgCheckRef.current) {
          clearInterval(bgCheckRef.current);
          bgCheckRef.current = null;
        }

        if (bgEngineRef.current) {
          bgEngineRef.current.onVisibilityChange(false);
        }

        // Resume playback if needed
        if (playerRef.current && isPlayingRef.current) {
          try {
            const state = playerRef.current.getPlayerState();
            if (state !== 1) {
              // Player is not playing - resume from saved position
              const currentPos = playerRef.current.getCurrentTime() || 0;
              if (savedPositionRef.current > 0 && Math.abs(currentPos - savedPositionRef.current) > 3) {
                playerRef.current.seekTo(savedPositionRef.current, true);
              }
              playerRef.current.playVideo();
            }
          } catch {}
        }
      }
    };

    const handleBlur = () => {
      if (playerRef.current && isPlayingRef.current) {
        try {
          savedPositionRef.current = playerRef.current.getCurrentTime() || 0;
          playerRef.current.playVideo();
        } catch {}
      }
      if (bgEngineRef.current) bgEngineRef.current.activate();
    };

    const handleFocus = () => {
      if (bgCheckRef.current) { clearInterval(bgCheckRef.current); bgCheckRef.current = null; }
      if (playerRef.current && isPlayingRef.current) {
        try {
          const state = playerRef.current.getPlayerState();
          if (state !== 1) {
            if (savedPositionRef.current > 0) playerRef.current.seekTo(savedPositionRef.current, true);
            playerRef.current.playVideo();
          }
        } catch {}
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPlayingRef.current) { e.preventDefault(); e.returnValue = ''; }
    };

    const handlePageShow = () => {
      // Triggered when page is restored from back-forward cache
      handleFocus();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Listen for service worker messages
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', () => {
        // Service worker responded - connection is alive
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (bgCheckRef.current) clearInterval(bgCheckRef.current);
    };
  }, []);

  // ─── Search debounce ───
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchYT(query);
        setResults(r);
      } catch { setResults([]); }
      setSearching(false);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ─── Media Session API (notification controls) ───
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: 'Cent Music',
      artwork: [
        { src: currentTrack.thumb, sizes: '96x96', type: 'image/jpeg' },
        { src: currentTrack.thumb, sizes: '128x128', type: 'image/jpeg' },
        { src: currentTrack.thumb, sizes: '192x192', type: 'image/jpeg' },
        { src: currentTrack.thumb, sizes: '256x256', type: 'image/jpeg' },
        { src: currentTrack.thumb, sizes: '384x384', type: 'image/jpeg' },
        { src: currentTrack.thumb, sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ─── Internal play function (for auto-next) ───
  const playTrackInternal = useCallback((tr: Track) => {
    if (playerRef.current) { try { playerRef.current.destroy(); } catch {} playerRef.current = null; }
    if (timerRef.current) clearInterval(timerRef.current);

    setCurrentTrack(tr);
    setIsPlaying(true);
    setProgress(0);
    setDuration(0);
    setHist(prev => [tr, ...prev.filter(x => x.id !== tr.id)].slice(0, 50));

    const box = document.getElementById('yt-box');
    if (!box) return;
    box.innerHTML = '<div id="yt-p"></div>';

    const initPlayer = (videoId: string) => {
      if (!(window as any).YT?.Player) { setTimeout(() => initPlayer(videoId), 300); return; }
      playerRef.current = new (window as any).YT.Player('yt-p', {
        height: '1', width: '1', videoId,
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, fs: 0,
          modestbranding: 1, playsinline: 1, rel: 0,
          iv_load_policy: 3, cc_load_policy: 0,
        },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(100);
            e.target.playVideo();
            const dur = e.target.getDuration() || 0;
            if (dur > 0) setDuration(dur);
            timerRef.current = setInterval(() => {
              try {
                if (playerRef.current) {
                  const ct = playerRef.current.getCurrentTime?.() || 0;
                  const dt = playerRef.current.getDuration?.() || 0;
                  setProgress(ct);
                  if (dt > 0) setDuration(dt);
                  savedPositionRef.current = ct;
                  // Update Media Session position
                  if ('mediaSession' in navigator && dt > 0) {
                    try {
                      navigator.mediaSession.setPositionState({
                        duration: dt, playbackRate: 1,
                        position: Math.min(Math.max(0, ct), dt),
                      });
                    } catch {}
                  }
                }
              } catch {}
            }, 1000);
          },
          onStateChange: (e: any) => {
            if (e.data === 0) {
              // Video ended - auto play next
              setTimeout(() => {
                const q = queueRef.current;
                const ct = trackRef.current;
                if (!ct || !q.length) return;
                const idx = q.findIndex(x => x.id === ct.id);
                const nextIdx = (idx >= 0 && idx < q.length - 1) ? idx + 1 : 0;
                const next = q[nextIdx];
                if (next) playTrackInternal(next);
              }, 300);
            }
            if (e.data === 1) { setIsPlaying(true); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; }
            if (e.data === 2) { setIsPlaying(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; }
          },
          onError: () => {
            // On error, try next track
            setTimeout(() => {
              const q = queueRef.current;
              const ct = trackRef.current;
              if (!ct || !q.length) return;
              const idx = q.findIndex(x => x.id === ct.id);
              if (idx >= 0 && idx < q.length - 1) {
                playTrackInternal(q[idx + 1]);
              }
            }, 500);
          },
        },
      });
    };

    initPlayer(tr.id);
  }, []);

  // ─── Player Functions ───
  const playTrack = useCallback((tr: Track, q?: Track[]) => {
    // Toggle play/pause if same track
    if (currentTrack?.id === tr.id && playerRef.current) {
      try {
        const state = playerRef.current.getPlayerState();
        if (state === 1) { playerRef.current.pauseVideo(); setIsPlaying(false); }
        else { playerRef.current.playVideo(); setIsPlaying(true); }
      } catch {}
      return;
    }

    if (q) setQueue(q);

    // Activate background engine on user interaction
    if (bgEngineRef.current) bgEngineRef.current.activate();

    playTrackInternal(tr);
  }, [currentTrack?.id, playTrackInternal]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    try {
      const state = playerRef.current.getPlayerState();
      if (state === 1) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
        // Ensure background engine stays active
        if (bgEngineRef.current) bgEngineRef.current.activate();
      }
    } catch {}
  }, []);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    const ct = trackRef.current;
    if (!ct || !q.length) return;
    const idx = q.findIndex(x => x.id === ct.id);
    const nextIdx = (idx >= 0 && idx < q.length - 1) ? idx + 1 : 0;
    const next = q[nextIdx];
    if (next) {
      setCurrentTrack(null);
      setTimeout(() => {
        if (queueRef.current.length > 0) setQueue(queueRef.current);
        playTrackInternal(next);
      }, 50);
    }
  }, [playTrackInternal]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    const ct = trackRef.current;
    if (!ct || !q.length) return;
    if (playerRef.current) {
      try {
        const currentTime = playerRef.current.getCurrentTime() || 0;
        if (currentTime > 3) {
          playerRef.current.seekTo(0, true);
          setProgress(0);
          return;
        }
      } catch {}
    }
    const idx = q.findIndex(x => x.id === ct.id);
    const prevIdx = idx > 0 ? idx - 1 : q.length - 1;
    const prev = q[prevIdx];
    if (prev) {
      setCurrentTrack(null);
      setTimeout(() => playTrackInternal(prev), 50);
    }
  }, [playTrackInternal]);

  // ─── Register Media Session handlers ───
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.setActionHandler('play', () => {
      if (playerRef.current) {
        try { playerRef.current.playVideo(); setIsPlaying(true); } catch {}
      }
      if (bgEngineRef.current) bgEngineRef.current.activate();
    });
    
    navigator.mediaSession.setActionHandler('pause', () => {
      if (playerRef.current) {
        try { playerRef.current.pauseVideo(); setIsPlaying(false); } catch {}
      }
    });
    
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && playerRef.current) {
        try { playerRef.current.seekTo(details.seekTime, true); setProgress(details.seekTime); } catch {}
      }
    });

    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (playerRef.current) {
        try { const ct = playerRef.current.getCurrentTime() || 0; playerRef.current.seekTo(ct + 10, true); setProgress(ct + 10); } catch {}
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (playerRef.current) {
        try { const ct = playerRef.current.getCurrentTime() || 0; playerRef.current.seekTo(Math.max(0, ct - 10), true); setProgress(Math.max(0, ct - 10)); } catch {}
      }
    });
  }, [playNext, playPrev]);

  const seekTo = useCallback((pct: number) => {
    if (!playerRef.current || !duration) return;
    const time = pct * duration;
    playerRef.current.seekTo(time, true);
    setProgress(time);
  }, [duration]);

  const toggleFav = useCallback((tr: Track) => {
    setAnimHeart(tr.id);
    setTimeout(() => setAnimHeart(''), 500);
    setFavs(p => p.some(x => x.id === tr.id) ? p.filter(x => x.id !== tr.id) : [tr, ...p]);
  }, []);

  const isFav = useCallback((id: string) => favs.some(x => x.id === id), [favs]);

  // ─── Voice Search ───
  const [voiceModal, setVoiceModal] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceConfidence, setVoiceConfidence] = useState(0);
  const recognitionRef = useRef<any>(null);

  const startVoice = useCallback(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert('Voice search requires Chrome or Edge'); return; }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }

    const rec = new SR();
    rec.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    recognitionRef.current = rec;

    rec.onstart = () => { setListening(true); setVoiceModal(true); setVoiceText(''); setVoiceInterim(''); setVoiceConfidence(0); };
    rec.onresult = (e: any) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) { final += tr; setVoiceConfidence(Math.round(e.results[i][0].confidence * 100)); }
        else { interim += tr; }
      }
      if (final) setVoiceText(prev => prev + final);
      setVoiceInterim(interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
  }, [lang]);

  const stopVoice = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    setListening(false);
  }, []);

  const confirmVoice = useCallback(() => {
    const txt = voiceText || voiceInterim;
    if (txt) { setQuery(txt); setScreen('search'); }
    setVoiceModal(false); stopVoice();
  }, [voiceText, voiceInterim, stopVoice]);

  const cancelVoice = useCallback(() => {
    setVoiceModal(false); stopVoice();
  }, [stopVoice]);

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const bottomOffset = currentTrack ? 128 : 64;

  // ═══════════ LOADING SCREEN ═══════════
  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'breathe 2s ease infinite', boxShadow: `0 0 40px ${GOLD}30` }}>
          <span style={{ color: '#000', fontSize: 40, fontWeight: 900, fontStyle: 'italic' }}>C</span>
        </div>
        <p style={{ marginTop: 24, fontSize: 28, fontWeight: 900, fontStyle: 'italic', letterSpacing: 8, color: GOLD }}>CENT</p>
        <p style={{ marginTop: 8, color: '#555', fontSize: 10, letterSpacing: 4 }}>PREMIUM MUSIC</p>
        <div style={{ marginTop: 40, width: 28, height: 28, border: `2px solid ${GOLD}33`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // ═══════════ TRACK ROW ═══════════
  const TrackRow = ({ tr, list, i }: { tr: Track; list: Track[]; i: number }) => {
    const active = currentTrack?.id === tr.id;
    return (
      <div
        onClick={() => playTrack(tr, list)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
          opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.04}s forwards`,
        }}
      >
        <div style={{ width: 50, height: 50, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: active ? `2px solid ${GOLD}` : '2px solid transparent', position: 'relative' }}>
          <img src={tr.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          {active && isPlaying && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, paddingBottom: 8 }}>
              {[1,2,3].map(j => <div key={j} style={{ width: 3, background: GOLD, borderRadius: 2, animation: `eqBar 0.${3+j}s ease infinite` }} />)}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: active ? GOLD : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.title}</p>
          <p style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>{tr.artist}</p>
        </div>
        {tr.views && <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{tr.views}</span>}
        <button onClick={(e) => { e.stopPropagation(); toggleFav(tr); }} style={{ padding: 8, flexShrink: 0, animation: animHeart === tr.id ? 'heartPop 0.4s ease' : 'none' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isFav(tr.id) ? GOLD : 'none'} stroke={isFav(tr.id) ? GOLD : '#555'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
      </div>
    );
  };

  // ═══════════ HOME ═══════════
  const renderHome = () => (
    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'glow 3s ease infinite' }}>
            <span style={{ color: '#000', fontSize: 22, fontWeight: 900, fontStyle: 'italic' }}>C</span>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, fontStyle: 'italic', letterSpacing: 5, color: GOLD, lineHeight: 1 }}>CENT</h1>
            <p style={{ fontSize: 9, color: '#666', letterSpacing: 3, marginTop: 3 }}>PREMIUM MUSIC</p>
          </div>
        </div>
        <button onClick={startVoice} style={{ width: 40, height: 40, borderRadius: '50%', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #222' }}>
          <svg width="18" height="18" fill={GOLD} viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </button>
      </div>

      <p style={{ fontSize: 20, fontWeight: 700, color: '#eee', marginBottom: 24 }}>{t.hi} 👋</p>

      {hist.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 14 }}>⚡ {t.quickPicks}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {hist.slice(0, 4).map(tr => (
              <div key={tr.id} onClick={() => playTrack(tr, hist)} style={{ display: 'flex', alignItems: 'center', background: '#161616', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', height: 56, border: '1px solid #1a1a1a' }}>
                <img src={tr.thumb} alt="" style={{ width: 56, height: 56, objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
                <p style={{ fontSize: 11, fontWeight: 600, color: '#eee', padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{tr.title.slice(0, 30)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 14 }}>🔥 {t.trending}</h2>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 10, WebkitOverflowScrolling: 'touch' as any }}>
          {trending.slice(0, 10).map((tr, i) => (
            <div key={tr.id} onClick={() => playTrack(tr, trending)} style={{ flexShrink: 0, width: 150, cursor: 'pointer', opacity: 0, animation: `fadeIn 0.4s ease ${i * 0.06}s forwards` }}>
              <div style={{ position: 'relative', width: 150, height: 150, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
                <img src={tr.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.7))' }} />
                <div style={{ position: 'absolute', bottom: 8, right: 8, width: 32, height: 32, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 10px ${GOLD}50` }}>
                  <svg width="14" height="14" fill="#000" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                {tr.views && <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{tr.views}</span>}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.title}</p>
              <p style={{ fontSize: 11, color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>{tr.artist}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 14 }}>✨ {t.newRel}</h2>
        {trending.slice(10, 18).map((tr, i) => <TrackRow key={tr.id} tr={tr} list={trending.slice(10, 18)} i={i} />)}
      </div>

      {trending.length > 18 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 14 }}>💡 {t.forYou}</h2>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 10 }}>
            {trending.slice(18).map((tr, i) => (
              <div key={tr.id} onClick={() => playTrack(tr, trending.slice(18))} style={{ flexShrink: 0, width: 130, cursor: 'pointer', opacity: 0, animation: `fadeIn 0.4s ease ${i * 0.06}s forwards` }}>
                <div style={{ width: 130, height: 130, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                  <img src={tr.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.title}</p>
                <p style={{ fontSize: 10, color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>{tr.artist}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════ SEARCH ═══════════
  const renderSearch = () => (
    <div style={{ padding: '0 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', paddingTop: 20, paddingBottom: 20 }}>{t.search}</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a1a1a', borderRadius: 14, padding: '0 14px', height: 52, border: '1px solid rgba(255,255,255,0.06)' }}>
        <svg width="20" height="20" fill="none" stroke="#888" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPh}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} style={{ padding: 8 }}>
            <svg width="18" height="18" fill="none" stroke="#888" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
        <button onClick={startVoice} style={{ width: 36, height: 36, borderRadius: '50%', background: listening ? '#ef4444' : GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: listening ? 'micPulse 1s infinite' : 'none', transition: 'background 0.3s' }}>
          <svg width="16" height="16" fill={listening ? '#fff' : '#000'} viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </button>
      </div>

      {!query && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 18, paddingBottom: 8 }}>
          {GENRES.map(g => (
            <button key={g.name} onClick={() => setQuery(g.name + ' music')} style={{ flexShrink: 0, padding: '10px 18px', borderRadius: 22, border: `1px solid ${GOLD}30`, color: GOLD, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(212,175,55,0.05)' }}>
              {g.emoji} {g.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {searching ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${GOLD}22`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : results.length > 0 ? (
          results.map((tr, i) => <TrackRow key={tr.id} tr={tr} list={results} i={i} />)
        ) : query && !searching ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>😔</p>
            <p style={{ color: '#666', fontSize: 15 }}>{t.noResults}</p>
          </div>
        ) : !query ? (
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 16, marginTop: 10 }}>{t.discover}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {GENRES.map((g, i) => (
                <div key={g.name} onClick={() => setQuery(g.name + ' music')} style={{ padding: '22px 16px', borderRadius: 14, cursor: 'pointer', background: `linear-gradient(135deg, ${g.color}18, ${g.color}08)`, border: `1px solid ${g.color}20`, opacity: 0, animation: `fadeIn 0.3s ease ${i * 0.04}s forwards` }}>
                  <span style={{ fontSize: 30, display: 'block', marginBottom: 10 }}>{g.emoji}</span>
                  <span style={{ color: '#ddd', fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════ LIBRARY ═══════════
  const renderLibrary = () => (
    <div style={{ padding: '0 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', paddingTop: 20, paddingBottom: 20 }}>{t.library}</h1>

      <div style={{ display: 'flex', background: '#111', borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 }}>
        {(['fav', 'hist'] as const).map(tab => (
          <button key={tab} onClick={() => setLibTab(tab)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 600, background: libTab === tab ? GOLD : 'transparent', color: libTab === tab ? '#000' : '#888', transition: 'all 0.25s' }}>
            {tab === 'fav' ? `❤️ ${t.favs} (${favs.length})` : `🕐 ${t.history} (${hist.length})`}
          </button>
        ))}
      </div>

      {libTab === 'fav' ? (
        favs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" style={{ margin: '0 auto' }}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <p style={{ color: '#555', fontSize: 15, marginTop: 20 }}>{t.noFav}</p>
            <p style={{ color: '#444', fontSize: 12, marginTop: 8 }}>{t.tapHeart}</p>
          </div>
        ) : favs.map((tr, i) => <TrackRow key={tr.id} tr={tr} list={favs} i={i} />)
      ) : (
        hist.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ color: '#555', fontSize: 15 }}>{t.noHist}</p>
          </div>
        ) : hist.map((tr, i) => <TrackRow key={tr.id + i} tr={tr} list={hist} i={i} />)
      )}
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════ SETTINGS ═══════════
  const renderSettings = () => (
    <div style={{ padding: '0 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', paddingTop: 20, paddingBottom: 20 }}>{t.settings}</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#111', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 22 }}>🌍</span>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{t.lang}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setLang('en')} style={{ padding: '8px 18px', borderRadius: 20, fontSize: 14, fontWeight: 600, background: lang === 'en' ? GOLD : 'rgba(255,255,255,0.08)', color: lang === 'en' ? '#000' : '#999', transition: 'all 0.25s' }}>EN</button>
            <button onClick={() => setLang('ar')} style={{ padding: '8px 18px', borderRadius: 20, fontSize: 14, fontWeight: 600, background: lang === 'ar' ? GOLD : 'rgba(255,255,255,0.08)', color: lang === 'ar' ? '#000' : '#999', transition: 'all 0.25s' }}>عربي</button>
          </div>
        </div>

        <div style={{ background: '#111', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 22 }}>🎵</span>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{t.quality}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['high', 'medium', 'low'] as const).map(q => (
              <button key={q} onClick={() => setAudioQ(q)} style={{ padding: '7px 14px', borderRadius: 18, fontSize: 12, fontWeight: 600, background: audioQ === q ? GOLD : 'rgba(255,255,255,0.08)', color: audioQ === q ? '#000' : '#999', transition: 'all 0.25s' }}>{t[q]}</button>
            ))}
          </div>
        </div>

        <div style={{ background: '#111', borderRadius: 16, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 22 }}>🎧</span>
              <div>
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 600, display: 'block' }}>{t.bgPlay}</span>
                <span style={{ color: '#666', fontSize: 11, display: 'block', marginTop: 4 }}>{t.bgPlayDesc}</span>
              </div>
            </div>
            <div style={{ width: 44, height: 26, borderRadius: 13, padding: 2, display: 'flex', alignItems: 'center', background: GOLD, justifyContent: 'flex-end' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#000' }} />
            </div>
          </div>
        </div>

        <div style={{ background: '#111', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{t.notif}</span>
          </div>
          <button onClick={() => { setNotifOn(!notifOn); if (!notifOn && 'Notification' in window) Notification.requestPermission(); }} style={{ width: 50, height: 28, borderRadius: 14, padding: 3, display: 'flex', alignItems: 'center', background: notifOn ? GOLD : 'rgba(255,255,255,0.12)', justifyContent: notifOn ? 'flex-end' : 'flex-start', transition: 'all 0.3s' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: notifOn ? '#000' : '#555', transition: 'all 0.3s' }} />
          </button>
        </div>

        <div style={{ background: '#111', borderRadius: 16, padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <span style={{ fontSize: 22 }}>ℹ️</span>
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{t.about}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#000', fontSize: 26, fontWeight: 900, fontStyle: 'italic' }}>C</span>
            </div>
            <div>
              <p style={{ color: '#fff', fontSize: 22, fontWeight: 900, fontStyle: 'italic', letterSpacing: 5 }}>CENT</p>
              <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{t.ver}</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
            <p style={{ color: GOLD, fontSize: 15, fontWeight: 600 }}>✨ {t.dev}</p>
          </div>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════ FULL PLAYER ═══════════
  const renderFullPlayer = () => {
    if (!showPlayer || !currentTrack) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000', animation: 'slideUp 0.35s ease' }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img src={currentTrack.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(60px) brightness(0.25) saturate(1.3)', transform: 'scale(1.3)' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />

        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '60px 30px 50px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
            <button onClick={() => setShowPlayer(false)} style={{ padding: 10 }}>
              <svg width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
            </button>
            <span style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: 5 }}>{t.nowPlaying}</span>
            <button onClick={() => toggleFav(currentTrack)} style={{ padding: 10, animation: animHeart === currentTrack.id ? 'heartPop 0.4s ease' : 'none' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={isFav(currentTrack.id) ? GOLD : 'none'} stroke={isFav(currentTrack.id) ? GOLD : '#fff'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 'min(75vw, 320px)', aspectRatio: '1', borderRadius: 20, overflow: 'hidden',
              boxShadow: `0 20px 60px rgba(0,0,0,0.6)${isPlaying ? `, 0 0 60px ${GOLD}20` : ''}`,
              transition: 'box-shadow 0.5s',
            }}>
              <img src={currentTrack.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center', margin: '32px 0 24px' }}>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.title}</h2>
            <p style={{ color: '#aaa', fontSize: 15, marginTop: 8 }}>{currentTrack.artist}</p>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }}
              style={{ height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 4, cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${GOLD}, ${GOLD2})`, width: `${pct}%`, transition: 'width 0.5s linear' }} />
              <div style={{ position: 'absolute', top: -6, width: 16, height: 16, borderRadius: '50%', background: GOLD, left: `${pct}%`, transform: 'translateX(-50%)', boxShadow: `0 0 10px ${GOLD}70` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ color: '#888', fontSize: 12 }}>{fmtTime(progress)}</span>
              <span style={{ color: '#888', fontSize: 12 }}>{fmtTime(duration)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, marginBottom: 30 }}>
            <button onClick={playPrev} style={{ padding: 12 }}>
              <svg width="32" height="32" fill="#fff" viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>
            </button>
            <button onClick={togglePlay} style={{ width: 70, height: 70, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 24px ${GOLD}40` }}>
              {isPlaying ? (
                <svg width="28" height="28" fill="#000" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg width="28" height="28" fill="#000" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={playNext} style={{ padding: 12 }}>
              <svg width="32" height="32" fill="#fff" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════ MAIN RENDER ═══════════
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#000', color: '#fff', overflow: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div id="yt-box" style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        bottom: bottomOffset,
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch' as any,
      }}>
        {screen === 'home' && renderHome()}
        {screen === 'search' && renderSearch()}
        {screen === 'library' && renderLibrary()}
        {screen === 'settings' && renderSettings()}
      </div>

      {currentTrack && !showPlayer && (
        <div
          onClick={() => setShowPlayer(true)}
          style={{
            position: 'absolute', left: 6, right: 6,
            bottom: 64,
            background: 'rgba(20,20,20,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
            border: `1px solid rgba(212,175,55,0.12)`,
            zIndex: 40,
          }}
        >
          <div style={{ height: 2, background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ height: '100%', background: GOLD, width: `${pct}%`, transition: 'width 0.5s linear' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
            <img src={currentTrack.thumb} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.title}</p>
              <p style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{currentTrack.artist}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggleFav(currentTrack); }} style={{ padding: 6, flexShrink: 0, animation: animHeart === currentTrack.id ? 'heartPop 0.4s ease' : 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav(currentTrack.id) ? GOLD : 'none'} stroke={isFav(currentTrack.id) ? GOLD : '#666'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{ width: 36, height: 36, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isPlaying ? (
                <svg width="14" height="14" fill="#000" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg width="14" height="14" fill="#000" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={(e) => { e.stopPropagation(); playNext(); }} style={{ padding: 4, flexShrink: 0 }}>
              <svg width="20" height="20" fill="#ccc" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Voice Search Modal */}
      {voiceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, animation: 'fadeIn 0.3s ease' }}>
          <button onClick={cancelVoice} style={{ position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 5, marginBottom: 50 }}>
            {listening ? (lang === 'ar' ? 'جاري الاستماع...' : 'LISTENING...') : (lang === 'ar' ? 'انتهى' : 'DONE')}
          </p>

          <div style={{ position: 'relative', marginBottom: 50 }}>
            {listening && (
              <>
                <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: `2px solid ${GOLD}20`, animation: 'micRing1 2s ease infinite' }} />
                <div style={{ position: 'absolute', inset: -40, borderRadius: '50%', border: `2px solid ${GOLD}15`, animation: 'micRing2 2s ease 0.3s infinite' }} />
                <div style={{ position: 'absolute', inset: -60, borderRadius: '50%', border: `2px solid ${GOLD}10`, animation: 'micRing3 2s ease 0.6s infinite' }} />
              </>
            )}
            <button onClick={listening ? stopVoice : startVoice} style={{ width: 100, height: 100, borderRadius: '50%', background: listening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: listening ? '0 0 50px rgba(239,68,68,0.4)' : `0 0 50px ${GOLD}30`, animation: listening ? 'micPulse 1.5s ease infinite' : 'none' }}>
              <svg width="40" height="40" fill={listening ? '#fff' : '#000'} viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>

          {listening && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 40, marginBottom: 30 }}>
              {Array.from({ length: 20 }, (_, i) => (
                <div key={i} style={{ width: 3, borderRadius: 2, background: `linear-gradient(to top, ${GOLD}, ${GOLD2})`, animation: `soundWave 0.${4 + (i % 5)}s ease-in-out ${i * 0.05}s infinite alternate`, opacity: 0.5 + (i % 3) * 0.2 }} />
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', minHeight: 60, maxWidth: '80%' }}>
            {(voiceText || voiceInterim) ? (
              <>
                <p style={{ color: '#fff', fontSize: 24, fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {voiceText}<span style={{ color: '#888' }}>{voiceInterim}</span>
                </p>
                {voiceConfidence > 0 && <p style={{ color: GOLD, fontSize: 12, marginTop: 10 }}>{lang === 'ar' ? `الدقة: ${voiceConfidence}%` : `Confidence: ${voiceConfidence}%`}</p>}
              </>
            ) : (
              <p style={{ color: '#555', fontSize: 17 }}>
                {listening ? (lang === 'ar' ? '🎤 قل اسم الأغنية...' : '🎤 Say a song name...') : (lang === 'ar' ? 'اضغط المايك' : 'Tap the mic')}
              </p>
            )}
          </div>

          {(voiceText || voiceInterim) && !listening && (
            <div style={{ display: 'flex', gap: 16, marginTop: 36 }}>
              <button onClick={startVoice} style={{ padding: '14px 30px', borderRadius: 30, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, fontWeight: 600 }}>
                {lang === 'ar' ? '🎤 أعد' : '🎤 Retry'}
              </button>
              <button onClick={confirmVoice} style={{ padding: '14px 30px', borderRadius: 30, background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, color: '#000', fontSize: 15, fontWeight: 700 }}>
                {lang === 'ar' ? '🔍 ابحث' : '🔍 Search'}
              </button>
            </div>
          )}
        </div>
      )}

      {renderFullPlayer()}

      {/* ═══ BOTTOM NAV ═══ */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 60,
        background: 'rgba(0,0,0,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
        paddingBottom: 4,
      }}>
        {[
          { id: 'home' as Screen, label: t.home, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill={screen === 'home' ? GOLD : 'none'} stroke={screen === 'home' ? GOLD : '#666'} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> },
          { id: 'search' as Screen, label: t.search, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={screen === 'search' ? GOLD : '#666'} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg> },
          { id: 'library' as Screen, label: t.library, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill={screen === 'library' ? GOLD : 'none'} stroke={screen === 'library' ? GOLD : '#666'} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> },
          { id: 'settings' as Screen, label: t.settings, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={screen === 'settings' ? GOLD : '#666'} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => { setScreen(item.id); if (item.id === 'search') setTimeout(() => inputRef.current?.focus(), 200); }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 0', minWidth: 60,
              transition: 'transform 0.2s',
              transform: screen === item.id ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: screen === item.id ? 700 : 500, color: screen === item.id ? GOLD : '#666' }}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
