import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Upload,
  Mic,
  Search,
  X,
} from "lucide-react";
import { usePromptStore, type Prompt } from "@/state/promptStore";
import "./PromptPicker.css";

interface PromptPickerProps {
  value: string;
  onChange: (next: string) => void;
}

export function PromptPicker({ value, onChange }: PromptPickerProps) {
  const prompts = usePromptStore((s) => s.prompts);
  const selectedPrompt = prompts.find((p) => p.id === value);

  const [open, setOpen] = useState(false);
  const [isPlayingInline, setIsPlayingInline] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop inline audio if selection changes or component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlayInline = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedPrompt) return;

    if (isPlayingInline) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingInline(false);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(selectedPrompt.url);
      audioRef.current.play().catch((err) => console.log("Audio play blocked/failed:", err));
      setIsPlayingInline(true);
      
      audioRef.current.onended = () => {
        setIsPlayingInline(false);
      };
    }
  };

  return (
    <>
      <div className="prompt-picker-inline">
        <div className="prompt-picker-preview">
          {selectedPrompt ? (
            <>
              <button
                type="button"
                className="prompt-picker-play-btn"
                onClick={togglePlayInline}
                title={isPlayingInline ? "Pause" : "Play audio preview"}
              >
                {isPlayingInline ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <span className="prompt-picker-title-text" title={selectedPrompt.description}>
                {selectedPrompt.name}
              </span>
            </>
          ) : (
            <span className="prompt-picker-title-text is-empty">
              — No prompt selected —
            </span>
          )}
        </div>
        <button
          type="button"
          className="prompt-picker-choose-btn"
          onClick={() => setOpen(true)}
        >
          Choose…
        </button>
      </div>

      {open && (
        <PromptPickerModal
          value={value}
          onChange={(val) => {
            onChange(val);
            if (audioRef.current) {
              audioRef.current.pause();
              setIsPlayingInline(false);
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface ModalProps {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
}

type TabType = "select" | "play" | "record" | "upload";

function PromptPickerModal({ value, onChange, onClose }: ModalProps) {
  const prompts = usePromptStore((s) => s.prompts);
  const addPrompt = usePromptStore((s) => s.addPrompt);
  
  const [activeTab, setActiveTab] = useState<TabType>("select");
  const [selectedId, setSelectedId] = useState<string>(value);

  // Active playing prompt inside the modal
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [recordedTitle, setRecordedTitle] = useState("");
  const recordIntervalRef = useRef<number | null>(null);

  // Upload State
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop any playing audio when modal closes or changes tab
  useEffect(() => {
    return () => {
      stopModalAudio();
      stopRecordingTimer();
    };
  }, []);

  const handleTabChange = (tab: TabType) => {
    stopModalAudio();
    setActiveTab(tab);
  };

  const stopModalAudio = () => {
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      modalAudioRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPlayingId(null);
    setCurrentTime(0);
  };

  const startModalAudio = (prompt: Prompt) => {
    stopModalAudio();
    
    const audio = new Audio(prompt.url);
    modalAudioRef.current = audio;
    setPlayingId(prompt.id);

    audio.play().catch((err) => console.log("Modal play failed:", err));

    audio.onloadedmetadata = () => {
      setDuration(audio.duration || 0);
    };

    audio.onended = () => {
      stopModalAudio();
    };

    progressIntervalRef.current = window.setInterval(() => {
      if (modalAudioRef.current) {
        setCurrentTime(modalAudioRef.current.currentTime);
      }
    }, 100);
  };

  const togglePlayPrompt = (prompt: Prompt, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (playingId === prompt.id) {
      stopModalAudio();
    } else {
      startModalAudio(prompt);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!modalAudioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const seekTime = pct * duration;
    modalAudioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Search & filter matching
  const filteredPrompts = prompts.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory =
      categoryFilter === "All" || p.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Recording Actions
  const startRecording = () => {
    setIsRecording(true);
    setRecordingStopped(false);
    setRecordedSeconds(0);
    setRecordedTitle("");
    
    recordIntervalRef.current = window.setInterval(() => {
      setRecordedSeconds((s) => s + 1);
    }, 1000);
  };

  const stopRecording = () => {
    stopRecordingTimer();
    setIsRecording(false);
    setRecordingStopped(true);
    setRecordedTitle(`Greeting Recorded ${new Date().toLocaleDateString()}`);
  };

  const stopRecordingTimer = () => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  const saveRecording = () => {
    if (!recordedTitle.trim()) return;
    const timestamp = Date.now();
    const id = `p_recorded_${timestamp}`;
    const newPrompt: Prompt = {
      id,
      name: recordedTitle.trim(),
      description: `User-recorded voicemail greeting prompt saved at ${new Date().toLocaleTimeString()}.`,
      category: "Custom",
      duration: `${recordedSeconds}s`,
      // Use SoundHelix song as sample audio track so it streams actual audio
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      isCustom: true,
    };
    addPrompt(newPrompt);
    setSelectedId(id);
    setRecordingStopped(false);
    setActiveTab("select");
  };

  // Upload Actions
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      simulateUpload(files[0].name);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      simulateUpload(files[0].name);
    }
  };

  const simulateUpload = (fileName: string) => {
    setIsUploading(true);
    setUploadPercent(0);
    setUploadedFileName(fileName);

    const step = 10;
    const totalTime = 1200; // 1.2s total
    const interval = totalTime / (100 / step);

    const timer = setInterval(() => {
      setUploadPercent((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => {
            finalizeUpload(fileName);
          }, 300);
          return 100;
        }
        return prev + step;
      });
    }, interval);
  };

  const finalizeUpload = (fileName: string) => {
    setIsUploading(false);
    const cleanName = fileName.replace(/\.[^/.]+$/, ""); // Strip extension
    const id = `p_uploaded_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const newPrompt: Prompt = {
      id,
      name: `Uploaded ${cleanName}`,
      description: `User-uploaded audio file: ${fileName}.`,
      category: "Custom",
      duration: "14s",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
      isCustom: true,
    };
    addPrompt(newPrompt);
    setSelectedId(id);
    setActiveTab("select");
  };

  const activePrompt = prompts.find((p) => p.id === selectedId);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Audio Prompt Picker"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="modal ppm">
        <header>
          <strong>Select Audio Prompt</strong>
          <button type="button" onClick={onClose} aria-label="Close selector">
            <X size={14} aria-hidden />
          </button>
        </header>

        <nav className="ppm-tabs" role="tablist" aria-label="Selector sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "select"}
            className={"ppm-tab" + (activeTab === "select" ? " is-active" : "")}
            onClick={() => handleTabChange("select")}
          >
            Select Prompt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "play"}
            className={"ppm-tab" + (activeTab === "play" ? " is-active" : "")}
            onClick={() => handleTabChange("play")}
            disabled={!selectedId}
          >
            Play Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "record"}
            className={"ppm-tab" + (activeTab === "record" ? " is-active" : "")}
            onClick={() => handleTabChange("record")}
          >
            Record Mic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "upload"}
            className={"ppm-tab" + (activeTab === "upload" ? " is-active" : "")}
            onClick={() => handleTabChange("upload")}
          >
            Upload File
          </button>
        </nav>

        <div className="ppm-body">
          {activeTab === "select" && (
            <div className="ppm-select-tab">
              <div className="ppm-search-bar">
                <div className="ppm-search-input-wrapper">
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-dim)",
                    }}
                  />
                  <input
                    type="text"
                    className="ppm-search-input"
                    placeholder="Search prompts by name, ID or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: "32px" }}
                  />
                </div>
                <select
                  className="ppm-search-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  <option value="Greetings">Greetings</option>
                  <option value="Menus">Menus</option>
                  <option value="System">System</option>
                  <option value="Voicemail">Voicemail</option>
                  <option value="Custom">Custom Listings</option>
                </select>
              </div>

              <div className="ppm-grid-scroll">
                {filteredPrompts.length === 0 ? (
                  <p className="shell-placeholder" style={{ padding: "40px" }}>
                    No audio prompts match your filter criteria.
                  </p>
                ) : (
                  <div className="ppm-grid">
                    {filteredPrompts.map((p) => {
                      const isChosen = p.id === selectedId;
                      const isPlaying = p.id === playingId;
                      return (
                        <div
                          key={p.id}
                          className={"ppm-card" + (isChosen ? " is-selected" : "")}
                          onClick={() => setSelectedId(p.id)}
                          onDoubleClick={() => {
                            setSelectedId(p.id);
                            onChange(p.id);
                            onClose();
                          }}
                        >
                          <div className="ppm-card-header">
                            <div className="ppm-card-info">
                              <span className="ppm-card-name">{p.name}</span>
                              <span className="ppm-card-id">{p.id}</span>
                            </div>
                            <span className={"ppm-card-badge" + (p.isCustom ? " custom" : "")}>
                              {p.category}
                            </span>
                          </div>
                          <p className="ppm-card-desc">{p.description}</p>
                          <div className="ppm-card-footer">
                            <span className="ppm-card-duration">Duration: {p.duration}</span>
                            <button
                              type="button"
                              className="ppm-card-play-btn"
                              onClick={(e) => togglePlayPrompt(p, e)}
                              title={isPlaying ? "Pause Preview" : "Play Preview"}
                            >
                              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "play" && activePrompt && (
            <div
              className={"ppm-play-tab" + (playingId === activePrompt.id ? " is-playing" : "")}
            >
              <div className="ppm-player-visualizer">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} className="visualizer-bar" />
                ))}
              </div>

              <div className="ppm-player-info">
                <h3 className="ppm-player-name">{activePrompt.name}</h3>
                <p className="ppm-player-desc">{activePrompt.description}</p>
              </div>

              <div className="ppm-player-progress-container">
                <div className="ppm-player-seeker-wrapper" onClick={handleSeek}>
                  <div
                    className="ppm-player-seeker-fill"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <div className="ppm-player-time">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration || parseFloat(activePrompt.duration) || 0)}</span>
                </div>
              </div>

              <div className="ppm-player-controls">
                <button
                  type="button"
                  className="player-main-btn"
                  onClick={() => togglePlayPrompt(activePrompt)}
                  title={playingId === activePrompt.id ? "Pause" : "Play"}
                >
                  {playingId === activePrompt.id ? <Pause size={20} /> : <Play size={20} />}
                </button>
              </div>
            </div>
          )}

          {activeTab === "record" && (
            <div className={"ppm-record-tab" + (isRecording ? " is-recording" : "")}>
              {!recordingStopped ? (
                <>
                  <div className="ppm-record-mic-zone">
                    <div className="ppm-record-mic-glow" />
                    <button
                      type="button"
                      className={"ppm-record-mic-btn" + (isRecording ? " is-recording" : "")}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      <Mic size={36} />
                    </button>
                  </div>
                  <div className="ppm-record-timer">{formatTime(recordedSeconds)}</div>
                  <span className="ppm-record-status-label">
                    {isRecording ? "Recording in progress..." : "Click microphone to start"}
                  </span>
                </>
              ) : (
                <div className="ppm-record-save-form">
                  <label>
                    <span>Recorded Greeting Title</span>
                    <input
                      type="text"
                      value={recordedTitle}
                      onChange={(e) => setRecordedTitle(e.target.value)}
                      placeholder="e.g. Sales Holiday Greetings"
                      autoFocus
                    />
                  </label>
                  <div className="ppm-record-save-btns">
                    <button
                      type="button"
                      onClick={() => setRecordingStopped(false)}
                      style={{ background: "transparent", border: "none" }}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={saveRecording}
                      disabled={!recordedTitle.trim()}
                      className="inspector-save"
                    >
                      Save & Select
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "upload" && (
            <div className="ppm-upload-tab">
              {!isUploading ? (
                <>
                  <div
                    className={"ppm-upload-dropzone" + (isDragOver ? " is-dragover" : "")}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="ppm-upload-icon-wrapper">
                      <Upload size={44} />
                    </div>
                    <div className="ppm-upload-text">
                      <span className="ppm-upload-primary">
                        Drag and drop your audio file here
                      </span>
                      <span className="ppm-upload-secondary">
                        Or click to browse from local computer (.mp3, .wav, max 10MB)
                      </span>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept="audio/*"
                    onChange={handleFileSelect}
                  />
                </>
              ) : (
                <div className="ppm-upload-progress-wrapper">
                  <div className="ppm-upload-progress-header">
                    <span>Uploading {uploadedFileName}...</span>
                    <span>{uploadPercent}%</span>
                  </div>
                  <div className="ppm-upload-progress-bar">
                    <div
                      className="ppm-upload-progress-fill"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer>
          <div className="modal-footer-select">
            <span className="modal-selected-preview">
              Selected:{" "}
              {activePrompt ? (
                <strong>
                  {activePrompt.name} ({activePrompt.id})
                </strong>
              ) : (
                <em style={{ color: "var(--text-dim)" }}>None</em>
              )}
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ppm-select-btn"
                disabled={!selectedId}
                onClick={() => {
                  onChange(selectedId);
                  onClose();
                }}
              >
                Select Prompt
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
