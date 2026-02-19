'use client';

import { useState, useEffect, useRef } from 'react';

interface ChapterData {
  title: string;
  content: string;
  nextChapterUrl: string;
  currentUrl: string;
}

export default function NovelReader() {
  const [url, setUrl] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentChapter, setCurrentChapter] = useState<ChapterData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0.8);
  const [chapterCount, setChapterCount] = useState(0);
  const [maxChapters] = useState(10);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [filteredVoices, setFilteredVoices] = useState<SpeechSynthesisVoice[]>([]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const lastCharIndexRef = useRef(0);
  const baseOffsetRef = useRef(0);
  const contentLengthRef = useRef(0);
  const playbackIdRef = useRef(0);
  const lastLoadedUrlRef = useRef<string | null>(null);

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;

      const savedTheme = localStorage.getItem('themePreference');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }
      
      // Load saved pitch from localStorage
      const savedPitch = localStorage.getItem('selectedPitch');
      if (savedPitch) {
        setPitch(parseFloat(savedPitch));
      }
      
      // Load available voices
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Filter and prioritize voices: English India first, then other English voices
        const enIndiaVoices = availableVoices.filter(v => v.lang.includes('en') && v.lang.includes('IN'));
        const otherEnglishVoices = availableVoices.filter(v => v.lang.startsWith('en') && !v.lang.includes('IN'));
        const prioritizedVoices = [...enIndiaVoices, ...otherEnglishVoices, ...availableVoices.filter(v => !v.lang.startsWith('en'))];
        setFilteredVoices(prioritizedVoices);
        
        // Try to restore saved voice from localStorage
        const savedVoiceName = localStorage.getItem('selectedVoiceName');
        if (savedVoiceName && availableVoices.length > 0) {
          const savedVoice = availableVoices.find(v => v.name === savedVoiceName);
          if (savedVoice) {
            setSelectedVoice(savedVoice);
            return;
          }
        }
        
        // If no saved voice or not found, prioritize English India
        if (availableVoices.length > 0) {
          let defaultVoice = enIndiaVoices[0]; // First priority: English India
          if (!defaultVoice) {
            defaultVoice = otherEnglishVoices[0] || availableVoices[0]; // Fallback
          }
          if (!selectedVoice) {
            setSelectedVoice(defaultVoice);
          }
        }
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Cleanup on unmount - stop speech
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Cleanup on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const fetchChapter = async (chapterUrl: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(
        `/api/fetch-chapter?url=${encodeURIComponent(chapterUrl)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch chapter');
      }

      const data: ChapterData = await response.json();
      
      if (!data.content || data.content.length < 50) {
        throw new Error('Chapter content is too short or empty. The website structure might have changed.');
      }

      setCurrentChapter(data);
      const loadedUrl = data.currentUrl || chapterUrl;
      if (loadedUrl && loadedUrl !== lastLoadedUrlRef.current) {
        lastLoadedUrlRef.current = loadedUrl;
        setChapterCount((prev) => prev + 1);
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chapter');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startReading = async () => {
    if (!url.trim()) {
      setError('Please enter a novel chapter URL');
      return;
    }

    // Reset state
    stopReading();
    setChapterCount(0);
    setProgress(0);
    lastLoadedUrlRef.current = null;
    lastCharIndexRef.current = 0;
    baseOffsetRef.current = 0;
    contentLengthRef.current = 0;

    // Fetch and read first chapter
    const chapter = await fetchChapter(url);
    if (chapter) {
      readChapter(chapter);
    }
  };

  const readChapter = (chapter: ChapterData) => {
    if (!synthRef.current) {
      setError('Speech synthesis not supported in this browser');
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    baseOffsetRef.current = 0;
    lastCharIndexRef.current = 0;
    contentLengthRef.current = chapter.content.length;
    setProgress(0);

    const utterance = new SpeechSynthesisUtterance(chapter.content);
    utterance.rate = speed;
    utterance.pitch = pitch;
    utterance.volume = 1;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Progress tracking
    utterance.onboundary = (event) => {
      if (playbackIdRef.current !== playbackId || event.charIndex < 0) {
        return;
      }

      const absoluteIndex = baseOffsetRef.current + event.charIndex;
      lastCharIndexRef.current = absoluteIndex;
      const length = contentLengthRef.current || chapter.content.length;
      const progressPercent = (absoluteIndex / length) * 100;
      setProgress(Math.min(Math.max(progressPercent, 0), 100));
    };

    utterance.onend = async () => {
      if (playbackIdRef.current !== playbackId) {
        return;
      }
      setProgress(100);
      
      // Auto-advance to next chapter if under max limit
      if (chapterCount < maxChapters && chapter.nextChapterUrl) {
        setTimeout(async () => {
          try {
            const nextChapter = await fetchChapter(chapter.nextChapterUrl);
            if (nextChapter) {
              readChapter(nextChapter);
            } else {
              setIsPlaying(false);
            }
          } catch (err) {
            console.error('Error fetching next chapter:', err);
            setError('Failed to load next chapter. Stopping playback.');
            setIsPlaying(false);
          }
        }, 1000); // 1 second delay between chapters
      } else {
        setIsPlaying(false);
        if (chapterCount >= maxChapters) {
          setError(`Completed ${maxChapters} chapters!`);
        }
      }
    };

    utterance.onerror = (event) => {
      if (playbackIdRef.current !== playbackId) {
        return;
      }

      // Silently ignore cancellation and interruption errors
      if (event.error && event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('Speech synthesis error:', event.error);
        // Don't stop on certain recoverable errors
        if (event.error === 'network' || event.error === 'synthesis-failed') {
          setError(`Audio issue: ${event.error}. Retrying...`);
          // Auto retry
          setTimeout(() => {
            if (synthRef.current && utteranceRef.current) {
              synthRef.current.speak(utteranceRef.current);
            }
          }, 500);
        }
      }
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const pauseReading = () => {
    if (synthRef.current && isPlaying) {
      synthRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeReading = () => {
    if (synthRef.current && isPaused) {
      synthRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopReading = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    playbackIdRef.current += 1;
    lastCharIndexRef.current = 0;
    baseOffsetRef.current = 0;
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
  };

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    
    // If currently playing, restart with new speed
    if (isPlaying && currentChapter && synthRef.current) {
      synthRef.current.cancel();
      
      // Get current position (precise)
      const length = currentChapter.content.length;
      let startPosition = Math.min(Math.max(lastCharIndexRef.current, 0), length);
      if (startPosition === 0 && progress > 0) {
        startPosition = Math.floor(length * (progress / 100));
      }
      const remainingContent = currentChapter.content.substring(startPosition);

      const playbackId = playbackIdRef.current + 1;
      playbackIdRef.current = playbackId;
      baseOffsetRef.current = startPosition;
      contentLengthRef.current = length;
      
      const utterance = new SpeechSynthesisUtterance(remainingContent);
      utterance.rate = newSpeed;
      utterance.pitch = pitch;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onboundary = (event) => {
        if (playbackIdRef.current !== playbackId || event.charIndex < 0) {
          return;
        }

        const absoluteIndex = baseOffsetRef.current + event.charIndex;
        lastCharIndexRef.current = absoluteIndex;
        const progressPercent = (absoluteIndex / length) * 100;
        setProgress(Math.min(Math.max(progressPercent, 0), 100));
      };

      utterance.onend = async () => {
        if (playbackIdRef.current !== playbackId) {
          return;
        }
        setProgress(100);
        
        if (chapterCount < maxChapters && currentChapter.nextChapterUrl) {
          setTimeout(async () => {
            const nextChapter = await fetchChapter(currentChapter.nextChapterUrl);
            if (nextChapter) {
              readChapter(nextChapter);
            } else {
              setIsPlaying(false);
            }
          }, 1000);
        } else {
          setIsPlaying(false);
        }
      };

      utterance.onerror = (event) => {
        if (playbackIdRef.current !== playbackId) {
          return;
        }

        if (!event.error || event.error === 'canceled' || event.error === 'interrupted') {
          return;
        }

        if (event.error === 'synthesis-failed' || event.error === 'network') {
          // Retry once for recoverable engine hiccups
          setTimeout(() => {
            if (synthRef.current && utteranceRef.current && playbackIdRef.current === playbackId) {
              synthRef.current.speak(utteranceRef.current);
            }
          }, 300);
          return;
        }

        setError(`Speed adjustment error: ${event.error}`);
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    }
  };

  const goToNextChapter = async () => {
    if (currentChapter?.nextChapterUrl) {
      stopReading();
      const nextChapter = await fetchChapter(currentChapter.nextChapterUrl);
      if (nextChapter) {
        readChapter(nextChapter);
      }
    }
  };

  const goToPreviousChapter = async () => {
    if (currentChapter?.currentUrl) {
      const chapterMatch = currentChapter.currentUrl.match(/chapter-(\d+)/);
      if (chapterMatch) {
        const currentChapterNum = parseInt(chapterMatch[1]);
        if (currentChapterNum > 1) {
          const prevUrl = currentChapter.currentUrl.replace(
            /chapter-\d+/,
            `chapter-${currentChapterNum - 1}`
          );
          stopReading();
          const prevChapter = await fetchChapter(prevUrl);
          if (prevChapter) {
            setChapterCount((prev) => Math.max(0, prev - 1));
            readChapter(prevChapter);
          }
        }
      }
    }
  };

  const handleVoiceChange = (voiceName: string) => {
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice);
      // Save to localStorage
      localStorage.setItem('selectedVoiceName', voice.name);
      
      // If currently playing, restart with new voice
      if (isPlaying && currentChapter && synthRef.current && !isPaused) {
        try {
          // Stop current speech
          synthRef.current.cancel();
          
          // Small delay to ensure voice list is updated
          setTimeout(() => {
            // Get current position
            const length = currentChapter.content.length;
            let startPosition = Math.min(Math.max(lastCharIndexRef.current, 0), length);
            if (startPosition === 0 && progress > 0) {
              startPosition = Math.floor(length * (progress / 100));
            }
            const remainingContent = currentChapter.content.substring(startPosition);

            const playbackId = playbackIdRef.current + 1;
            playbackIdRef.current = playbackId;
            baseOffsetRef.current = startPosition;
            contentLengthRef.current = length;
            
            const utterance = new SpeechSynthesisUtterance(remainingContent);
            utterance.rate = speed;
            utterance.pitch = pitch;
            utterance.volume = 1;
            
            // Ensure voice is set correctly
            if (voice && synthRef.current) {
              utterance.voice = voice;
            }

            utterance.onboundary = (event) => {
              if (playbackIdRef.current !== playbackId || event.charIndex < 0) {
                return;
              }

              const absoluteIndex = baseOffsetRef.current + event.charIndex;
              lastCharIndexRef.current = absoluteIndex;
              const progressPercent = (absoluteIndex / length) * 100;
              setProgress(Math.min(Math.max(progressPercent, 0), 100));
            };

            utterance.onend = async () => {
              if (playbackIdRef.current !== playbackId) {
                return;
              }
              setProgress(100);
              
              if (chapterCount < maxChapters && currentChapter.nextChapterUrl) {
                setTimeout(async () => {
                  const nextChapter = await fetchChapter(currentChapter.nextChapterUrl);
                  if (nextChapter) {
                    readChapter(nextChapter);
                  } else {
                    setIsPlaying(false);
                  }
                }, 1000);
              } else {
                setIsPlaying(false);
              }
            };

            utterance.onerror = (event) => {
              // Silently ignore cancellation errors
              if (playbackIdRef.current !== playbackId) {
                return;
              }

              if (event.error && event.error !== 'canceled' && event.error !== 'interrupted') {
                console.warn('Voice change error:', event.error);
                setError(`Voice change issue: ${event.error}. Retrying with current voice...`);
                // Try again with the new voice after a short delay
                setTimeout(() => {
                  if (synthRef.current) {
                    synthRef.current.speak(utterance);
                  }
                }, 500);
              }
            };

            utteranceRef.current = utterance;
            
            if (synthRef.current) {
              synthRef.current.speak(utterance);
            }
          }, 100);
        } catch (err) {
          console.warn('Error during voice change:', err);
        }
      }
    }
  };

  const speedOptions = [];
  for (let i = 0.25; i <= 8; i += 0.25) {
    speedOptions.push(i);
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('themePreference', nextTheme);
  };

  const isDarkTheme = theme === 'dark';

  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentChapter || !isPlaying || !synthRef.current) return;
    
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    const newProgress = Math.max(0, Math.min(percentage, 100));
    
    setProgress(newProgress);
    
    // Calculate new position in text
    const length = currentChapter.content.length;
    const newPosition = Math.floor((newProgress / 100) * length);
    const remainingContent = currentChapter.content.substring(newPosition);
    
    // Stop current speech and start from new position
    synthRef.current.cancel();
    
    setIsPaused(false);
    lastCharIndexRef.current = newPosition;
    baseOffsetRef.current = newPosition;
    contentLengthRef.current = length;

    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    
    // Use requestAnimationFrame to ensure smooth seeking
    requestAnimationFrame(() => {
      const utterance = new SpeechSynthesisUtterance(remainingContent);
      utterance.rate = speed;
      utterance.pitch = pitch;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      utterance.onboundary = (event) => {
        if (playbackIdRef.current !== playbackId || event.charIndex < 0) {
          return;
        }

        const absoluteIndex = baseOffsetRef.current + event.charIndex;
        lastCharIndexRef.current = absoluteIndex;
        const progressPercent = (absoluteIndex / length) * 100;
        setProgress(Math.min(Math.max(progressPercent, 0), 100));
      };
      
      utterance.onend = async () => {
        if (playbackIdRef.current !== playbackId) {
          return;
        }
        setProgress(100);
        
        if (chapterCount < maxChapters && currentChapter.nextChapterUrl) {
          setTimeout(async () => {
            try {
              const nextChapter = await fetchChapter(currentChapter.nextChapterUrl);
              if (nextChapter) {
                readChapter(nextChapter);
              } else {
                setIsPlaying(false);
              }
            } catch (err) {
              console.error('Error loading next chapter:', err);
              setIsPlaying(false);
            }
          }, 1000);
        } else {
          setIsPlaying(false);
        }
      };
      
      utterance.onerror = (event) => {
        if (playbackIdRef.current !== playbackId) {
          return;
        }

        if (event.error && event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn('Seek error:', event.error);
        }
      };
      
      utteranceRef.current = utterance;
      
      if (synthRef.current) {
        synthRef.current.speak(utterance);
      }
    });
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkTheme
          ? 'bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 text-slate-100'
          : 'bg-gradient-to-br from-sky-50 via-white to-emerald-50 text-slate-900'
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
                isDarkTheme
                  ? 'bg-sky-900/30 border-sky-500/30 text-sky-200'
                  : 'bg-sky-100 border-sky-200 text-sky-800'
              }`}
            >
              <span className="text-2xl">🎧</span>
              <span className="text-sm font-medium">Novel Audio Reader</span>
            </div>
            <button
              onClick={toggleTheme}
              type="button"
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                isDarkTheme
                  ? 'bg-slate-800/70 border-slate-600 hover:bg-slate-700 text-slate-100'
                  : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {isDarkTheme ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
          <h1
            className={`text-5xl md:text-6xl font-bold mb-3 bg-clip-text text-transparent ${
              isDarkTheme
                ? 'bg-gradient-to-r from-sky-300 via-cyan-300 to-emerald-300'
                : 'bg-gradient-to-r from-sky-700 via-cyan-700 to-emerald-700'
            }`}
          >
            Story Audiobook
          </h1>
          <p className={`text-lg max-w-lg mx-auto ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
            Listen to web novels with hands-free playback. Perfect for your commute! 🚴
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Control Panel */}
          <div className="lg:col-span-2">
            <div
              className={`backdrop-blur-md rounded-2xl shadow-xl p-6 md:p-8 border space-y-6 ${
                isDarkTheme
                  ? 'bg-slate-900/70 border-slate-700/60'
                  : 'bg-white/80 border-slate-200'
              }`}
            >
              {/* URL Input Section */}
              <div>
                <label
                  className={`block text-sm font-semibold mb-3 uppercase tracking-wide ${
                    isDarkTheme ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  📖 Novel URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://novelfire.net/book/..."
                  className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:outline-none transition-all text-sm ${
                    isDarkTheme
                      ? 'bg-slate-800/70 border-slate-600/50 text-slate-100 placeholder-slate-400 focus:border-cyan-400 focus:ring-cyan-400/40'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-sky-500/30'
                  }`}
                  disabled={isPlaying}
                />
              </div>

              {/* Chapter Info */}
              {currentChapter && (
                <div
                  className={`rounded-lg border p-4 space-y-3 ${
                    isDarkTheme
                      ? 'bg-slate-800/60 border-slate-600'
                      : 'bg-sky-50 border-sky-100'
                  }`}
                >
                  <div>
                    <h2 className={`text-lg font-semibold ${isDarkTheme ? 'text-cyan-300' : 'text-sky-700'}`}>
                      {currentChapter.title || 'Current Chapter'}
                    </h2>
                    <p className={`text-sm ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                      Chapter {Math.min(chapterCount, maxChapters)} of {maxChapters} max
                    </p>
                  </div>
                  
                  {/* Seekable Progress Bar */}
                  <div>
                    <div 
                      onClick={handleProgressSeek}
                      className={`relative w-full rounded-full h-3 cursor-pointer hover:h-4 transition-all group ${
                        isDarkTheme ? 'bg-slate-700' : 'bg-slate-200'
                      }`}
                    >
                      <div
                        className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full rounded-full transition-all duration-100 shadow"
                        style={{ width: `${progress}%` }}
                      />
                      {/* Seek dot */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity ${
                          isDarkTheme ? 'bg-white' : 'bg-sky-600'
                        }`}
                        style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                      />
                    </div>
                    <p className={`text-xs mt-2 text-center ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                      Click to seek • {Math.round(progress)}% complete
                    </p>
                  </div>
                </div>
              )}

              {/* Voice Selection */}
              <div>
                <label
                  className={`block text-sm font-semibold mb-3 uppercase tracking-wide ${
                    isDarkTheme ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  🎤 Voice Selection {isPlaying && <span className={isDarkTheme ? 'text-cyan-300 text-xs' : 'text-sky-700 text-xs'}>(live)</span>}
                </label>
                <select
                  value={selectedVoice?.name || ''}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:outline-none text-sm ${
                    isDarkTheme
                      ? 'bg-slate-800/70 border-slate-600/50 text-slate-100 focus:border-cyan-400 focus:ring-cyan-400/40'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 focus:ring-sky-500/30'
                  }`}
                >
                  {filteredVoices.map((voice) => {
                    const isIndian = voice.lang.includes('IN');
                    const prefix = isIndian ? '🇮🇳 India: ' : '🌍 ';
                    return (
                      <option key={voice.name} value={voice.name}>
                        {prefix}{voice.name} ({voice.lang})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Pitch Control */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label
                    className={`block font-semibold uppercase tracking-wide text-sm ${
                      isDarkTheme ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    🎵 Voice Pitch
                  </label>
                  <span className={`text-lg font-semibold ${isDarkTheme ? 'text-cyan-300' : 'text-sky-700'}`}>
                    {pitch.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={pitch}
                    onChange={(e) => {
                      const newPitch = parseFloat(e.target.value);
                      setPitch(newPitch);
                      // Save to localStorage
                      localStorage.setItem('selectedPitch', newPitch.toString());
                      // If playing, update pitch immediately
                      if (isPlaying && currentChapter && synthRef.current && !isPaused) {
                        synthRef.current.cancel();
                        setTimeout(() => {
                          const length = currentChapter.content.length;
                          let startPosition = Math.min(Math.max(lastCharIndexRef.current, 0), length);
                          if (startPosition === 0 && progress > 0) {
                            startPosition = Math.floor(length * (progress / 100));
                          }
                          const remainingContent = currentChapter.content.substring(startPosition);

                          const playbackId = playbackIdRef.current + 1;
                          playbackIdRef.current = playbackId;
                          baseOffsetRef.current = startPosition;
                          contentLengthRef.current = length;
                          
                          const utterance = new SpeechSynthesisUtterance(remainingContent);
                          utterance.rate = speed;
                          utterance.pitch = newPitch;
                          utterance.volume = 1;
                          if (selectedVoice) {
                            utterance.voice = selectedVoice;
                          }

                          utterance.onboundary = (event) => {
                            if (playbackIdRef.current !== playbackId || event.charIndex < 0) {
                              return;
                            }

                            const absoluteIndex = baseOffsetRef.current + event.charIndex;
                            lastCharIndexRef.current = absoluteIndex;
                            const progressPercent = (absoluteIndex / length) * 100;
                            setProgress(Math.min(Math.max(progressPercent, 0), 100));
                          };
                          
                          utterance.onend = async () => {
                            if (playbackIdRef.current !== playbackId) {
                              return;
                            }
                            setProgress(100);
                            if (chapterCount < maxChapters && currentChapter.nextChapterUrl) {
                              setTimeout(async () => {
                                const nextChapter = await fetchChapter(currentChapter.nextChapterUrl);
                                if (nextChapter) {
                                  readChapter(nextChapter);
                                } else {
                                  setIsPlaying(false);
                                }
                              }, 1000);
                            } else {
                              setIsPlaying(false);
                            }
                          };
                          
                          utteranceRef.current = utterance;
                          if (synthRef.current) {
                            synthRef.current.speak(utterance);
                          }
                        }, 100);
                      }
                    }}
                    className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-sky-500 ${
                      isDarkTheme ? 'bg-slate-700' : 'bg-slate-200'
                    }`}
                  />
                </div>
                <p className={`text-xs mt-2 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  Lower values = deeper voice
                </p>
              </div>

          {/* Speed Control */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label
                className={`block font-semibold uppercase tracking-wide text-sm ${
                  isDarkTheme ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                ⚡ Playback Speed
              </label>
              <span className={`text-2xl font-bold ${isDarkTheme ? 'text-cyan-300' : 'text-sky-700'}`}>
                {speed.toFixed(2)}x
              </span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="range"
                min="0.25"
                max="8"
                step="0.25"
                value={speed}
                onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-sky-500 ${
                  isDarkTheme ? 'bg-slate-700' : 'bg-slate-200'
                }`}
              />
              <select
                value={speed}
                onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                className={`px-3 py-2 rounded-lg border focus:outline-none text-sm font-medium ${
                  isDarkTheme
                    ? 'bg-slate-800/70 border-slate-600 text-slate-100 focus:border-cyan-400'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
                }`}
              >
                {speedOptions.map((s) => (
                  <option key={s} value={s}>
                    {s.toFixed(2)}x
                  </option>
                ))}
              </select>
            </div>
            <div
              className={`rounded-lg p-3 text-sm border ${
                isDarkTheme
                  ? 'bg-cyan-900/20 border-cyan-500/30 text-cyan-200'
                  : 'bg-cyan-50 border-cyan-200 text-cyan-800'
              }`}
            >
              <p className="font-semibold mb-1">⚠️ Browser Limitation Notice:</p>
              <p>Most browsers effectively support up to <strong>2-2.5x speed</strong>. Higher speeds may not work:</p>
              <ul className="mt-2 ml-4 text-xs space-y-1">
                <li>• <strong>Chrome/Edge:</strong> Best at 0.25x - 2.5x</li>
                <li>• <strong>Safari:</strong> Best at 0.25x - 2x</li>
                <li>• <strong>Firefox:</strong> Very limited speed control</li>
              </ul>
            </div>
          </div>

          {/* Navigation Buttons */}
          {currentChapter && (
            <div className="flex gap-3 mb-4">
              <button
                onClick={goToPreviousChapter}
                disabled={isLoading}
                className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-all border disabled:opacity-50 ${
                  isDarkTheme
                    ? 'bg-slate-700/50 hover:bg-slate-700 disabled:bg-slate-800 text-slate-100 border-slate-600 hover:border-slate-500'
                    : 'bg-white hover:bg-slate-100 disabled:bg-slate-100 text-slate-800 border-slate-300 hover:border-slate-400'
                }`}
              >
                ◀ Previous Chapter
              </button>
              <button
                onClick={goToNextChapter}
                disabled={isLoading || !currentChapter.nextChapterUrl}
                className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-all border disabled:opacity-50 ${
                  isDarkTheme
                    ? 'bg-slate-700/50 hover:bg-slate-700 disabled:bg-slate-800 text-slate-100 border-slate-600 hover:border-slate-500'
                    : 'bg-white hover:bg-slate-100 disabled:bg-slate-100 text-slate-800 border-slate-300 hover:border-slate-400'
                }`}
              >
                Next Chapter ▶
              </button>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex gap-3 mb-6">
            {!isPlaying ? (
              <button
                onClick={startReading}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 disabled:from-slate-500 disabled:to-slate-500 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 disabled:scale-100 shadow"
              >
                {isLoading ? 'Loading...' : '▶ Start Reading'}
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button
                    onClick={resumeReading}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    onClick={pauseReading}
                    className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                  >
                    ⏸ Pause
                  </button>
                )}
                <button
                  onClick={stopReading}
                  className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                >
                  ⏹ Stop
                </button>
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className={`p-4 rounded-lg ${
              error.includes('Completed') 
                ? isDarkTheme
                  ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-200'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : isDarkTheme
                  ? 'bg-rose-900/30 border border-rose-700 text-rose-200'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}>
              {error}
            </div>
          )}

          {/* Info */}
          <div
            className={`mt-8 pt-6 border-t text-center text-sm ${
              isDarkTheme ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-600'
            }`}
          >
            <p className="mb-2">
              🎧 Paste a chapter URL, hit start, and enjoy hands-free listening
            </p>
            <p className="text-xs">
              Auto-advances through chapters • Stops after 10 chapters or manual stop
            </p>
          </div>
            </div>
          </div>
        </div>

        {/* Current Chapter Content Display */}
        {currentChapter && (
          <div
            className={`mt-6 backdrop-blur-sm rounded-2xl shadow-xl border overflow-hidden ${
              isDarkTheme
                ? 'bg-slate-900/70 border-slate-700'
                : 'bg-white/80 border-slate-200'
            }`}
          >
            {/* Chapter Header */}
            <div
              className={`p-6 border-b ${
                isDarkTheme
                  ? 'bg-gradient-to-r from-sky-900/50 to-emerald-900/40 border-slate-700'
                  : 'bg-gradient-to-r from-sky-100 to-emerald-100 border-slate-200'
              }`}
            >
              <h2 className={`text-2xl md:text-3xl font-bold mb-2 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {currentChapter.title || 'Current Chapter'}
              </h2>
              <div className={`flex items-center gap-4 text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                <span className="flex items-center gap-1">
                  📖 Chapter {Math.min(chapterCount, maxChapters)}
                </span>
                <span className="flex items-center gap-1">
                  🎧 {isPlaying ? (isPaused ? 'Paused' : 'Playing') : 'Stopped'}
                </span>
                <span className="flex items-center gap-1">
                  ⚡ {speed.toFixed(2)}x
                </span>
              </div>
            </div>
            
            {/* Chapter Content */}
            <div className="p-6 md:p-8">
              <div className={`max-w-none ${isDarkTheme ? 'prose prose-invert prose-slate' : 'prose prose-slate'}`}>
                <div
                  className={`leading-relaxed text-base md:text-lg whitespace-pre-wrap max-h-[500px] overflow-y-auto custom-scrollbar ${
                    isDarkTheme ? 'text-slate-200' : 'text-slate-700'
                  }`}
                >
                  {currentChapter.content}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
    </div>
  );
}
