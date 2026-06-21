// ============================================================================
// Voice Beats - Refactored Main Script (ES Modules)
// ============================================================================

// --- DOM elements ---
const playButton = document.getElementById("play");
const bpmControl = document.getElementById("bpm");
const bpmDisplay = document.getElementById("bpm-display");
const exportButton = document.getElementById("export");
const dropdownLinks = document.querySelectorAll(".dropdown-content a");
const dropbtn = document.querySelector(".dropbtn");
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");
const spectrumCanvas = document.getElementById("spectrum");
const spectrumCtx = spectrumCanvas.getContext("2d");

// --- Track Configuration & Initializer ---
const TRACK_DATA = [
    { id: 'kick', class: 'kick', defaultUrl: 'sounds/kick.wav', waveformId: 'kick-waveform' },
    { id: 'snare', class: 'snare', defaultUrl: 'sounds/snare.wav', waveformId: 'snare-waveform' },
    { id: 'clap', class: 'clap', defaultUrl: 'sounds/clap.wav', waveformId: 'clap-waveform' },
    { id: 'hihat', class: 'hihat', defaultUrl: 'sounds/hihat.wav', waveformId: 'hihat-waveform' },
    { id: 'bell', class: 'bell', defaultUrl: 'sounds/bell.wav', waveformId: 'bell-waveform' }
];

const tracks = TRACK_DATA.map((data, index) => {
    const container = document.querySelector(`.track.${data.class}`);
    if (!container) {
        console.error(`Track container not found for: ${data.class}`);
    }
    return {
        id: data.id,
        index: index,
        defaultUrl: data.defaultUrl,
        waveformId: data.waveformId,
        container: container,
        buffer: null,
        
        // DOM Elements
        steps: container.querySelectorAll('.step'),
        pitchBendControl: container.querySelector('.pitch-bend-control'),
        volumeControl: container.querySelector('.volume-control'),
        muteButton: container.querySelector('.mute-button'),
        recordButton: container.querySelector('.record-button'),
        offsetControl: container.querySelector('.offset-control'),
        endOffsetControl: container.querySelector('.end-offset-control'),
        waveformCanvas: container.querySelector('.waveform'),
        offsetHandle: container.querySelector('.offset-handle'),
        endOffsetHandle: container.querySelector('.end-offset-handle'),
        offsetOverlay: container.querySelector('.offset-overlay'),
        endOffsetOverlay: container.querySelector('.end-offset-overlay'),
        
        // Audio graph properties (initialized dynamically)
        gainNode: null,
        
        // States
        isMuted: false
    };
});

// Get a flat collection of all step buttons for easy visual updates
const allSteps = document.querySelectorAll(".step");

// --- Global Audio & Playback States ---
let audioContext = null;
let masterGainNode = null;

let rhythmPrecision = "1/8";
let stepsPerBeat = 8;
let intervalMultiplier = 1;

let schedulerTimerId = null;
const lookahead = 25.0;            // How frequently to poll (ms)
const scheduleAheadTime = 0.1;    // How far ahead to schedule audio (seconds)
let nextNoteTime = 0.0;           // When the next step is due
let currentStep = 0;              // Current sequencer step

// --- Visualizer & Spectrum Analysers ---
let visualizerAnalyser = null;
let visualizerDataArray = null;

let spectrumAnalyser = null;
let spectrumDataArray = null;

// --- Recording & Export States ---
let mediaRecorder = null;
let recordedChunks = [];

let isExporting = false;
let exportStepCount = 0;
let exportRecorder = null;
let exportChunks = [];
let exportEndTime = 0;

// ============================================================================
// Audio Graph & Buffer Setup
// ============================================================================

/**
 * Initializes the AudioContext, persistent track GainNodes, and Analysers.
 * Safe to call multiple times (idempotent).
 */
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Use AudioSession API (iOS 16.4+ Safari) to output audio even in Silent/Mute switch mode
        if (navigator.audioSession) {
            try {
                navigator.audioSession.type = 'playback';
            } catch (e) {
                console.warn('Failed to set audio session type to playback:', e);
            }
        }

        masterGainNode = audioContext.createGain();
        masterGainNode.connect(audioContext.destination);

        // Initialize persistent Audio Graph for each track
        tracks.forEach(track => {
            track.gainNode = audioContext.createGain();
            // Set initial volume based on track volume control
            const vol = track.isMuted ? 0 : parseFloat(track.volumeControl.value);
            track.gainNode.gain.setValueAtTime(vol, audioContext.currentTime);
            track.gainNode.connect(masterGainNode);
        });

        // Initialize separate analysers to prevent collisions
        setupVisualizer();
        setupSpectrum();
    }
}

/**
 * Loads and decodes an audio file from a URL/Blob URL.
 */
function loadAudioFile(url) {
    initAudio();
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${url}`);
            }
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .catch(error => {
            console.error('Error loading audio file:', error);
        });
}

/**
 * Loads default WAV sound files for all tracks and draws their waveforms.
 */
function loadDefaultSounds() {
    initAudio();
    tracks.forEach(track => {
        loadAudioFile(track.defaultUrl).then(buffer => {
            if (buffer) {
                track.buffer = buffer;
                drawWaveform(buffer, track.waveformId);
            }
        });
    });
}

// ============================================================================
// Live Playback Engine (Look-Ahead Scheduler)
// ============================================================================

/**
 * Plays a single drum hit scheduled at a specific audio timeline position.
 */
function playSound(track, time) {
    if (!audioContext || !track.buffer || track.isMuted) return;

    const source = audioContext.createBufferSource();
    source.buffer = track.buffer;

    // Pitch: Map pitch control value (0.0 - 1.0, default 0.5) to speed multiplier (0.0 - 2.0)
    const pitch = parseFloat(track.pitchBendControl.value);
    source.playbackRate.setValueAtTime(pitch * 2, time);

    // Connect source to the track's persistent GainNode
    source.connect(track.gainNode);

    const offset = parseFloat(track.offsetControl.value) || 0;
    const endOffset = parseFloat(track.endOffsetControl.value) || 1;

    const startTime = Math.max(0, track.buffer.duration * offset);
    const duration = Math.max(0, track.buffer.duration * (endOffset - offset));

    source.start(time, startTime, duration);
}

/**
 * The scheduling polling loop. Evaluates and schedules any beats falling
 * within the look-ahead window.
 */
function scheduler() {
    if (isExporting && exportEndTime > 0 && audioContext.currentTime >= exportEndTime) {
        stopExporting();
        return;
    }

    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        if (isExporting && exportEndTime > 0) {
            break;
        }
        scheduleNote(currentStep, nextNoteTime);
        advanceNote();
    }
}

/**
 * Schedules sounds and schedules corresponding visual UI updates.
 */
function scheduleNote(stepIndex, time) {
    tracks.forEach(track => {
        if (track.steps[stepIndex] && track.steps[stepIndex].classList.contains("active")) {
            playSound(track, time);
        }
    });

    // Schedule UI highlighting at the exact moment of playback
    const delayMs = (time - audioContext.currentTime) * 1000;
    setTimeout(() => {
        if (schedulerTimerId !== null || isExporting) {
            tracks.forEach(track => {
                track.steps.forEach(step => step.classList.remove("current"));
                if (track.steps[stepIndex]) {
                    track.steps[stepIndex].classList.add("current");
                }
            });
        }
    }, Math.max(0, delayMs));
}

/**
 * Advances the current step and timeline position based on BPM.
 */
function advanceNote() {
    const bpm = parseFloat(bpmControl.value) || 120;
    const stepDuration = (30.0 / bpm) * intervalMultiplier;

    nextNoteTime += stepDuration;
    currentStep = (currentStep + 1) % stepsPerBeat;

    if (isExporting) {
        exportStepCount++;
        if (exportStepCount >= stepsPerBeat) {
            exportEndTime = nextNoteTime;
        }
    }
}

// ============================================================================
// Event Listeners & UI Operations
// ============================================================================

// Play/Pause button click
playButton.addEventListener("click", async () => {
    initAudio();
    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    if (schedulerTimerId === null) {
        // Start live playback
        currentStep = 0;
        nextNoteTime = audioContext.currentTime;
        schedulerTimerId = setInterval(scheduler, lookahead);
        playButton.classList.add("playing");
        playButton.setAttribute("data-tooltip", "停止");
    } else {
        // Stop live playback
        clearInterval(schedulerTimerId);
        schedulerTimerId = null;
        playButton.classList.remove("playing");
        playButton.setAttribute("data-tooltip", "再生");
        // Clear all highlight states
        allSteps.forEach(step => step.classList.remove("current"));
    }
});

// Rhythm precision dropdown change
dropdownLinks.forEach(link => {
    link.addEventListener("click", (event) => {
        event.preventDefault();

        // Stop live sequencer if running
        if (schedulerTimerId !== null) {
            clearInterval(schedulerTimerId);
            schedulerTimerId = null;
            playButton.classList.remove("playing");
            playButton.setAttribute("data-tooltip", "再生");
            allSteps.forEach(step => step.classList.remove("current"));
        }

        rhythmPrecision = event.target.getAttribute("data-precision");
        dropbtn.textContent = rhythmPrecision;
        updateStepsAndInterval();
    });
});

/**
 * Updates sequencer parameters based on rhythm precision settings.
 */
function updateStepsAndInterval() {
    const oldStepsPerBeat = stepsPerBeat;

    switch (rhythmPrecision) {
        case "1/16":
            stepsPerBeat = 16;
            intervalMultiplier = 0.5;
            break;
        case "1/8T":
            stepsPerBeat = 12;
            intervalMultiplier = 2 / 3;
            break;
        default:
            stepsPerBeat = 8;
            intervalMultiplier = 1;
            break;
    }

    if (oldStepsPerBeat !== stepsPerBeat) {
        convertTrackStepsState(oldStepsPerBeat, stepsPerBeat);
    }

    updateStepButtons();
}

/**
 * Maps the active step states when rhythm precision changes to preserve rhythm timing.
 */
function convertTrackStepsState(oldSteps, newSteps) {
    tracks.forEach(track => {
        // 1. Extract the active states of the previous steps
        const oldStates = [];
        for (let i = 0; i < oldSteps; i++) {
            oldStates.push(track.steps[i].classList.contains("active"));
        }
        
        // 2. Compute the new active states using beat-aligned mapping
        const newStates = new Array(newSteps).fill(false);
        
        if (oldSteps === 8 && newSteps === 16) {
            for (let i = 0; i < 8; i++) {
                newStates[2 * i] = oldStates[i];
            }
        } else if (oldSteps === 16 && newSteps === 8) {
            for (let i = 0; i < 8; i++) {
                newStates[i] = oldStates[2 * i];
            }
        } else if (oldSteps === 8 && newSteps === 12) {
            for (let b = 0; b < 4; b++) {
                newStates[3 * b] = oldStates[2 * b];
                newStates[3 * b + 2] = oldStates[2 * b + 1];
            }
        } else if (oldSteps === 12 && newSteps === 8) {
            for (let b = 0; b < 4; b++) {
                newStates[2 * b] = oldStates[3 * b];
                newStates[2 * b + 1] = oldStates[3 * b + 1] || oldStates[3 * b + 2];
            }
        } else if (oldSteps === 12 && newSteps === 16) {
            for (let b = 0; b < 4; b++) {
                newStates[4 * b] = oldStates[3 * b];
                newStates[4 * b + 1] = oldStates[3 * b + 1];
                newStates[4 * b + 3] = oldStates[3 * b + 2];
            }
        } else if (oldSteps === 16 && newSteps === 12) {
            for (let b = 0; b < 4; b++) {
                newStates[3 * b] = oldStates[4 * b];
                newStates[3 * b + 1] = oldStates[4 * b + 1] || oldStates[4 * b + 2];
                newStates[3 * b + 2] = oldStates[4 * b + 3];
            }
        }
        
        // 3. Apply the new states to the DOM buttons
        track.steps.forEach((step, index) => {
            if (index < newSteps) {
                if (newStates[index]) {
                    step.classList.add("active");
                } else {
                    step.classList.remove("active");
                }
            } else {
                // Clear state for buttons that are hidden just in case
                step.classList.remove("active");
            }
        });
    });
}

/**
 * Displays/hides step buttons in track headers to match active precision division.
 */
function updateStepButtons() {
    tracks.forEach(track => {
        track.steps.forEach((step, index) => {
            if (index < stepsPerBeat) {
                step.style.display = "inline-block";
                if (rhythmPrecision === "1/16") {
                    step.classList.add("sixteenth");
                    step.classList.remove("triplet");
                } else if (rhythmPrecision === "1/8T") {
                    step.classList.add("triplet");
                    step.classList.remove("sixteenth");
                } else {
                    step.classList.remove("sixteenth");
                    step.classList.remove("triplet");
                }
            } else {
                step.style.display = "none";
            }
        });
    });
}

// Track settings inputs initialization and updates
tracks.forEach(track => {
    // Set initial input display variables and tooltips
    track.volumeControl.style.setProperty('--value', track.volumeControl.value);
    track.pitchBendControl.style.setProperty('--value', track.pitchBendControl.value);

    const updateVolumeTooltip = (val) => {
        const pct = Math.round(val * 100);
        track.volumeControl.parentElement.setAttribute("data-tooltip", `音量: ${pct}%`);
    };
    const updatePitchTooltip = (val) => {
        const speed = (val * 2).toFixed(2);
        track.pitchBendControl.parentElement.setAttribute("data-tooltip", `ピッチ: x${speed}`);
    };

    updateVolumeTooltip(track.volumeControl.value);
    updatePitchTooltip(track.pitchBendControl.value);

    // Track volume slider
    track.volumeControl.addEventListener("input", (event) => {
        const val = event.target.value;
        event.target.style.setProperty('--value', val);
        updateVolumeTooltip(val);
        updateTrackMute(track);
    });

    // Track pitch slider
    track.pitchBendControl.addEventListener("input", (event) => {
        const val = event.target.value;
        event.target.style.setProperty('--value', val);
        updatePitchTooltip(val);
    });

    // Mute button click
    track.muteButton.addEventListener("click", () => {
        track.isMuted = !track.isMuted;
        track.muteButton.classList.toggle("muted", track.isMuted);
        track.muteButton.setAttribute("data-tooltip", track.isMuted ? "ミュート解除" : "ミュート");
        updateTrackMute(track);
    });

    // Step button toggles
    track.steps.forEach(step => {
        step.addEventListener("click", () => {
            step.classList.toggle("active");
        });
    });
});

/**
 * Syncs track volume gain nodes with the physical volume sliders and mute state.
 */
function updateTrackMute(track) {
    if (track.gainNode) {
        const targetVolume = track.isMuted ? 0 : parseFloat(track.volumeControl.value);
        track.gainNode.gain.setValueAtTime(targetVolume, audioContext.currentTime);
    }
}

// BPM Slider input
bpmControl.addEventListener("input", () => {
    bpmDisplay.textContent = `♩=${bpmControl.value}`;
    updateBpmDisplayArrows();
});

function updateBpmDisplayArrows() {
    const bpmValue = parseInt(bpmControl.value, 10);
    bpmDisplay.classList.toggle('max', bpmValue >= 200);
    bpmDisplay.classList.toggle('min', bpmValue <= 60);
}

// Drag BPM to adjust (Mouse and Touch support)
const startBpmDrag = (startY, startBpm) => {
    const onMoveBpm = (clientY) => {
        const deltaY = startY - clientY;
        const newBpm = Math.round(Math.min(200, Math.max(60, startBpm + deltaY)));
        bpmControl.value = newBpm;
        bpmDisplay.textContent = `♩=${newBpm}`;
        updateBpmDisplayArrows();
    };

    const onMouseMoveBpm = (moveEvent) => {
        onMoveBpm(moveEvent.clientY);
    };

    const onTouchMoveBpm = (moveEvent) => {
        if (moveEvent.cancelable) moveEvent.preventDefault();
        onMoveBpm(moveEvent.touches[0].clientY);
    };

    const onDragEndBpm = () => {
        document.removeEventListener("mousemove", onMouseMoveBpm);
        document.removeEventListener("mouseup", onDragEndBpm);
        document.removeEventListener("touchmove", onTouchMoveBpm);
        document.removeEventListener("touchend", onDragEndBpm);
    };

    document.addEventListener("mousemove", onMouseMoveBpm);
    document.addEventListener("mouseup", onDragEndBpm);
    document.addEventListener("touchmove", onTouchMoveBpm, { passive: false });
    document.addEventListener("touchend", onDragEndBpm);
};

bpmDisplay.addEventListener("mousedown", (event) => {
    event.preventDefault();
    startBpmDrag(event.clientY, parseInt(bpmControl.value, 10));
});

bpmDisplay.addEventListener("touchstart", (event) => {
    const startY = event.touches[0].clientY;
    const startBpm = parseInt(bpmControl.value, 10);
    startBpmDrag(startY, startBpm);
}, { passive: true });

// Click BPM display arrows
bpmDisplay.addEventListener("click", (event) => {
    const rect = bpmDisplay.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < rect.height / 2) {
        adjustBpm(1); // Clicked up arrow area
    } else {
        adjustBpm(-1); // Clicked down arrow area
    }
});

function adjustBpm(amount) {
    const newBpm = Math.min(200, Math.max(60, parseInt(bpmControl.value, 10) + amount));
    bpmControl.value = newBpm;
    bpmDisplay.textContent = `♩=${newBpm}`;
    updateBpmDisplayArrows();
}

// ============================================================================
// Waveform Canvas Rendering & Trim Handles
// ============================================================================

/**
 * Renders the audio buffer waveform onto a canvas.
 */
function drawWaveform(buffer, canvasId) {
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl || !buffer) return;
    const context = canvasEl.getContext("2d");
    const data = buffer.getChannelData(0);
    const width = canvasEl.width;
    const height = canvasEl.height;
    
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0ea5e9";
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        context.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
}

// Bind Waveform Trim Handle dragging dynamically
tracks.forEach(track => {
    const offsetHandle = track.offsetHandle;
    const endOffsetHandle = track.endOffsetHandle;
    const offsetOverlay = track.offsetOverlay;
    const endOffsetOverlay = track.endOffsetOverlay;
    const waveform = track.waveformCanvas;

    // Left handle (Offset Start - Mouse and Touch support)
    const onMoveOffset = (clientX) => {
        const rect = waveform.getBoundingClientRect();
        const offset = Math.min(Math.max(0, clientX - rect.left), rect.width);
        const endOffset = parseFloat(endOffsetHandle.style.right) || 0;
        if (offset < rect.width - endOffset - 5) {
            offsetHandle.style.left = `${offset}px`;
            offsetOverlay.style.width = `${offset}px`;
            track.offsetControl.value = offset / rect.width;
        }
    };

    const onMouseMoveOffset = (event) => {
        onMoveOffset(event.clientX);
    };

    const onTouchMoveOffset = (event) => {
        if (event.cancelable) event.preventDefault();
        onMoveOffset(event.touches[0].clientX);
    };

    const onDragEndOffset = () => {
        document.removeEventListener("mousemove", onMouseMoveOffset);
        document.removeEventListener("mouseup", onDragEndOffset);
        document.removeEventListener("touchmove", onTouchMoveOffset);
        document.removeEventListener("touchend", onDragEndOffset);
    };

    offsetHandle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        document.addEventListener("mousemove", onMouseMoveOffset);
        document.addEventListener("mouseup", onDragEndOffset);
    });

    offsetHandle.addEventListener("touchstart", (event) => {
        if (event.cancelable) event.preventDefault();
        document.addEventListener("touchmove", onTouchMoveOffset, { passive: false });
        document.addEventListener("touchend", onDragEndOffset);
    }, { passive: false });

    // Right handle (Offset End - Mouse and Touch support)
    const onMoveEndOffset = (clientX) => {
        const rect = waveform.getBoundingClientRect();
        const endOffset = Math.min(Math.max(0, rect.right - clientX), rect.width);
        const offset = parseFloat(offsetHandle.style.left) || 0;
        if (endOffset < rect.width - offset - 4) {
            endOffsetHandle.style.right = `${endOffset}px`;
            endOffsetOverlay.style.width = `${endOffset}px`;
            track.endOffsetControl.value = 1 - (endOffset / rect.width);
        }
    };

    const onMouseMoveEndOffset = (event) => {
        onMoveEndOffset(event.clientX);
    };

    const onTouchMoveEndOffset = (event) => {
        if (event.cancelable) event.preventDefault();
        onMoveEndOffset(event.touches[0].clientX);
    };

    const onDragEndEndOffset = () => {
        document.removeEventListener("mousemove", onMouseMoveEndOffset);
        document.removeEventListener("mouseup", onDragEndEndOffset);
        document.removeEventListener("touchmove", onTouchMoveEndOffset);
        document.removeEventListener("touchend", onDragEndEndOffset);
    };

    endOffsetHandle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        document.addEventListener("mousemove", onMouseMoveEndOffset);
        document.addEventListener("mouseup", onDragEndEndOffset);
    });

    endOffsetHandle.addEventListener("touchstart", (event) => {
        if (event.cancelable) event.preventDefault();
        document.addEventListener("touchmove", onTouchMoveEndOffset, { passive: false });
        document.addEventListener("touchend", onDragEndEndOffset);
    }, { passive: false });
});

// ============================================================================
// Voice Sampling (Mic Recording) Logic
// ============================================================================
// Voice Sampling (Mic Recording) Logic
// ============================================================================

tracks.forEach(track => {
    track.recordButton.addEventListener("click", async () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            return;
        }

        // Ignore clicks if countdown is active to avoid multi-clicks
        if (track.recordButton.classList.contains("countdown-active")) {
            return;
        }

        initAudio();
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        // Lock recording UI
        tracks.forEach(t => t.recordButton.disabled = true);
        track.recordButton.disabled = false;

        // Switch iOS audio session to play-and-record to allow microphone input
        if (navigator.audioSession) {
            try {
                navigator.audioSession.type = 'play-and-record';
                // Wait for iOS audio session transition (hardware route changes) to complete
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
                console.warn('Failed to set audio session type to play-and-record:', e);
            }
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('マイク入力がサポートされていないブラウザです。');
            tracks.forEach(t => t.recordButton.disabled = false);
            return;
        }

        // 1. Start fetching microphone stream in background
        let micStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true });

        // 2. Start countdown animation visual feedback (3.. 2.. 1..)
        track.recordButton.classList.add("countdown-active");
        let countdown = 3;
        track.recordButton.textContent = countdown;
        track.recordButton.parentElement.setAttribute("data-tooltip", `録音開始まで ${countdown}`);

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                track.recordButton.textContent = countdown;
                track.recordButton.parentElement.setAttribute("data-tooltip", `録音開始まで ${countdown}`);
            } else {
                clearInterval(countdownInterval);
            }
        }, 500); // 500ms interval, total 1.5 seconds preparation

        // 3. After countdown finishes (1.5 seconds), start recording using the pre-warmed stream
        setTimeout(() => {
            micStreamPromise.then(async stream => {
                // Safeguard: Wait slightly for WebKit to stabilize the tracks
                await new Promise(resolve => setTimeout(resolve, 50));

                // Determine supported MIME type for recording (especially for iOS Safari compatibility)
                const mimeTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
                let selectedMimeType = "";
                for (const mime of mimeTypes) {
                    if (MediaRecorder.isTypeSupported(mime)) {
                        selectedMimeType = mime;
                        break;
                    }
                }

                const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
                
                const startRecording = (opts) => {
                    mediaRecorder = new MediaRecorder(stream, opts);
                    recordedChunks = [];

                    mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            recordedChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstop = () => {
                        // Release microphone device completely
                        if (stream) {
                            stream.getTracks().forEach(t => t.stop());
                        }

                        // Restore audio session to playback
                        if (navigator.audioSession) {
                            try {
                                navigator.audioSession.type = 'playback';
                            } catch (e) {
                                console.warn('Failed to restore audio session type to playback:', e);
                            }
                        }

                        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/wav" });
                        const url = URL.createObjectURL(blob);

                        loadAudioFile(url).then(buffer => {
                            if (buffer) {
                                track.buffer = buffer;
                                drawWaveform(buffer, track.waveformId);
                            }
                            // Revoke to clean up browser memory
                            URL.revokeObjectURL(url);
                        });

                        // Restore recording buttons UI state
                        tracks.forEach(t => {
                            t.recordButton.disabled = false;
                            t.recordButton.parentElement.setAttribute("data-tooltip", "録音");
                            t.recordButton.textContent = "";
                        });
                        track.recordButton.classList.remove("recording");
                    };

                    mediaRecorder.start();
                };

                try {
                    startRecording(options);
                } catch (e) {
                    console.warn("MediaRecorder start with options failed, retrying with browser defaults:", e);
                    try {
                        startRecording({});
                    } catch (e2) {
                        console.error("MediaRecorder fallback failed:", e2);
                        throw e2;
                    }
                }

                // Switch UI from countdown to recording state
                track.recordButton.classList.remove("countdown-active");
                track.recordButton.textContent = "";
                track.recordButton.classList.add("recording");
                track.recordButton.parentElement.setAttribute("data-tooltip", "録音中");

                // Compute recording animation length from BPM (exactly 4 beats time limit)
                const bpm = parseFloat(bpmControl.value) || 120;
                const fillDuration = (30000 / bpm) * 4 / 1000;
                track.recordButton.style.setProperty('--fill-duration', `${fillDuration}s`);

                // Force record termination after 4 beats limit
                setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }, (30000 / bpm) * 4);
            })
            .catch(error => {
                // Clear countdown UI if stream fails
                clearInterval(countdownInterval);
                track.recordButton.classList.remove("countdown-active");
                track.recordButton.textContent = "";

                console.error('Error accessing microphone:', error);
                if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    alert('マイクの使用にはHTTPS接続（セキュア接続）が必要です。http接続ではスマートフォンのブラウザ仕様によりマイクが利用できません。');
                } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    alert('マイクのアクセス許可が得られませんでした。ブラウザやOSの設定でマイクの使用が許可されているか確認してください。');
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    alert('マイクが別のアプリやタブで既に使用中のため、アクセスできません。');
                } else {
                    alert(`マイクのアクセス許可が得られませんでした（エラー: ${error.name}）。`);
                }
                
                // Unlock buttons if failed
                tracks.forEach(t => {
                    t.recordButton.disabled = false;
                    t.recordButton.parentElement.setAttribute("data-tooltip", "録音");
                    t.recordButton.textContent = "";
                });
            });
        }, 1500); // 1.5 seconds countdown matches 3 intervals of 500ms
    });
});

// ============================================================================
// WAV Export Logic (via ffmpeg.wasm)
// ============================================================================

async function convertWebmToWav(webmBlob, duration) {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({
        log: true,
        corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js'
    });
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.webm', await fetchFile(webmBlob));
    if (duration) {
        await ffmpeg.run('-i', 'input.webm', '-t', duration.toString(), 'output.wav');
    } else {
        await ffmpeg.run('-i', 'input.webm', 'output.wav');
    }
    const data = ffmpeg.FS('readFile', 'output.wav');
    const wavBlob = new Blob([data.buffer], { type: 'audio/wav' });
    return wavBlob;
}

exportButton.addEventListener("click", async () => {
    // Stop live sequencer if running
    if (schedulerTimerId !== null) {
        clearInterval(schedulerTimerId);
        schedulerTimerId = null;
        playButton.classList.remove("playing");
        playButton.setAttribute("data-tooltip", "再生");
        allSteps.forEach(step => step.classList.remove("current"));
    }

    if (exportButton.classList.contains("exporting")) {
        return;
    }

    initAudio();
    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    // Connect masterGainNode output to a recorder stream node
    const destination = audioContext.createMediaStreamDestination();
    masterGainNode.connect(destination);

    exportRecorder = new MediaRecorder(destination.stream);
    exportChunks = [];

    exportRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            exportChunks.push(event.data);
        }
    };

    exportRecorder.onstart = () => {
        isExporting = true;
        exportStepCount = 0;
        exportEndTime = 0;
        currentStep = 0;
        nextNoteTime = audioContext.currentTime;

        // Launch scheduler loop for capturing
        schedulerTimerId = setInterval(scheduler, lookahead);
    };

    exportRecorder.onstop = async () => {
        const blob = new Blob(exportChunks, { type: "audio/webm" });
        try {
            const bpm = parseFloat(bpmControl.value) || 120;
            const duration = (30000 / bpm) * stepsPerBeat / 1000;
            const wavBlob = await convertWebmToWav(blob, duration);
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = "VoiceBeats.wav";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("FFmpeg conversion failed:", err);
            alert("WAVファイルへのエクスポート中にエラーが発生しました。");
        }

        // Clean up connections
        masterGainNode.disconnect(destination);
    };

    // Run export sequence
    exportRecorder.start();
    exportButton.classList.add("exporting");

    const bpm = parseFloat(bpmControl.value) || 120;
    const fillDuration = (30000 / bpm) * stepsPerBeat / 1000;
    exportButton.style.setProperty('--fill-duration', `${fillDuration}s`);
});

function stopExporting() {
    isExporting = false;
    exportEndTime = 0;
    clearInterval(schedulerTimerId);
    schedulerTimerId = null;

    if (exportRecorder && exportRecorder.state === "recording") {
        // Delay stopping the recorder to ensure all scheduled buffer data flows in and gets encoded.
        // We will trim the file to the exact loop duration during WAV conversion via FFmpeg anyway.
        setTimeout(() => {
            if (exportRecorder && exportRecorder.state === "recording") {
                exportRecorder.stop();
            }
        }, 500);
    }

    exportButton.classList.remove("exporting");
    allSteps.forEach(step => step.classList.remove("current"));
}

// ============================================================================
// Oscilloscope & Spectrum Render Processing
// ============================================================================

function setupVisualizer() {
    if (!audioContext) return;
    visualizerAnalyser = audioContext.createAnalyser();
    masterGainNode.connect(visualizerAnalyser);
    visualizerAnalyser.fftSize = 2048;
    const bufferLength = visualizerAnalyser.frequencyBinCount;
    visualizerDataArray = new Uint8Array(bufferLength);
}

function drawVisualizer() {
    if (!visualizerAnalyser) return;
    requestAnimationFrame(drawVisualizer);
    
    visualizerAnalyser.getByteTimeDomainData(visualizerDataArray);
    
    // Slight translucent overlay to get a trailing oscilloscope trace
    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#0ea5e9';
    canvasCtx.beginPath();

    const bufferLength = visualizerAnalyser.frequencyBinCount;
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = visualizerDataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

function setupSpectrum() {
    if (!audioContext) return;
    spectrumAnalyser = audioContext.createAnalyser();
    masterGainNode.connect(spectrumAnalyser);
    spectrumAnalyser.fftSize = 256;
    const bufferLength = spectrumAnalyser.frequencyBinCount;
    spectrumDataArray = new Uint8Array(bufferLength);
}

function drawSpectrum() {
    if (!spectrumAnalyser) return;
    requestAnimationFrame(drawSpectrum);
    
    spectrumAnalyser.getByteFrequencyData(spectrumDataArray);
    
    spectrumCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    spectrumCtx.fillRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

    const bufferLength = spectrumAnalyser.frequencyBinCount;
    const barWidth = (spectrumCanvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = spectrumDataArray[i];
        spectrumCtx.fillStyle = '#0ea5e9';
        spectrumCtx.fillRect(x, spectrumCanvas.height - barHeight / 2, barWidth, barHeight / 2);
        x += barWidth + 1;
    }
}

// ============================================================================
// Initialization Entry Point
// ============================================================================

window.onload = function() {
    updateStepButtons();
    loadDefaultSounds();
    updateBpmDisplayArrows();
    
    // Trigger paint cycles
    drawVisualizer();
    drawSpectrum();

    // Global touchstart and click listener to resume AudioContext (iOS / Mobile Web Audio policy)
    const unlockAudio = () => {
        initAudio();
        if (audioContext) {
            if (audioContext.state === "suspended") {
                audioContext.resume().then(() => {
                    if (audioContext.state === "running") {
                        document.removeEventListener("click", unlockAudio);
                        document.removeEventListener("touchstart", unlockAudio);
                    }
                }).catch(err => {
                    console.error("AudioContext resume failed:", err);
                });
            } else if (audioContext.state === "running") {
                document.removeEventListener("click", unlockAudio);
                document.removeEventListener("touchstart", unlockAudio);
            }
        }
    };
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);

    // Force check and update Service Worker to clear stale caches
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.update();
            }
        });
    }

    // === Analyzer Tabs switching (Mobile only) ===
    const analyzerTabs = document.querySelectorAll(".analyzer-tab");
    analyzerTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            analyzerTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const activeTab = tab.getAttribute("data-tab");
            const visualizer = document.getElementById("visualizer");
            const spectrum = document.getElementById("spectrum");
            
            if (activeTab === "visualizer") {
                visualizer.style.display = "block";
                spectrum.style.display = "none";
            } else {
                visualizer.style.display = "none";
                spectrum.style.display = "block";
            }
        });
    });

    // === Track Tabs switching (Mobile only) ===
    const trackTabs = document.querySelectorAll(".track-tab");
    const updateActiveTrackMobile = (activeTrackId) => {
        tracks.forEach(track => {
            if (track.id === activeTrackId) {
                track.container.classList.add("active-track");
            } else {
                track.container.classList.remove("active-track");
            }
            // Ensure all tracks are visible on mobile in accordion grid mode
            track.container.style.display = "";
        });
    };

    trackTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            trackTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const selectedTrack = tab.getAttribute("data-track");
            updateActiveTrackMobile(selectedTrack);
        });
    });

    // Make track container click trigger selection on mobile
    tracks.forEach(track => {
        track.container.addEventListener("click", (e) => {
            // Only switch track on mobile (width <= 768px)
            if (window.innerWidth <= 768) {
                // Ignore click if it was on any control/input or step button to avoid layout trigger conflicts
                const isInteractive = e.target.closest('.track-controls') || e.target.closest('.step');
                if (!isInteractive) {
                    const tab = document.querySelector(`.track-tab[data-track="${track.id}"]`);
                    if (tab) {
                        tab.click();
                    }
                }
            }
        });
    });

    // Make circular dials easy to adjust via vertical drag on mobile
    const setupDialTouchControls = () => {
        const dials = document.querySelectorAll(".volume-control, .pitch-bend-control");
        dials.forEach(dial => {
            dial.addEventListener("touchstart", (e) => {
                const touch = e.touches[0];
                const startY = touch.clientY;
                const startVal = parseFloat(dial.value);
                const step = parseFloat(dial.step) || 0.01;
                const min = parseFloat(dial.min) || 0;
                const max = parseFloat(dial.max) || 1;
                
                const onTouchMove = (moveEvent) => {
                    if (moveEvent.cancelable) moveEvent.preventDefault();
                    const currentY = moveEvent.touches[0].clientY;
                    const deltaY = startY - currentY; // Drag up to increase value
                    
                    // 150px vertical drag spans full range from min to max
                    const sensitivity = 150; 
                    const deltaVal = (deltaY / sensitivity) * (max - min);
                    let newVal = startVal + deltaVal;
                    
                    // Clamp and snap to steps
                    newVal = Math.min(max, Math.max(min, Math.round(newVal / step) * step));
                    
                    if (dial.value !== newVal.toString()) {
                        dial.value = newVal;
                        dial.dispatchEvent(new Event("input")); // Triggers existing update listeners
                    }
                };
                
                const onTouchEnd = () => {
                    document.removeEventListener("touchmove", onTouchMove);
                    document.removeEventListener("touchend", onTouchEnd);
                };
                
                document.addEventListener("touchmove", onTouchMove, { passive: false });
                document.addEventListener("touchend", onTouchEnd);
            }, { passive: true });
        });
    };

    setupDialTouchControls();

    // === Responsive Mobile Check & Switch logic ===
    const checkMobileLayout = () => {
        if (window.innerWidth <= 768) {
            // Apply mobile defaults
            const activeTrackTab = document.querySelector(".track-tab.active");
            if (activeTrackTab) {
                updateActiveTrackMobile(activeTrackTab.getAttribute("data-track"));
            }
            
            const activeAnalyzerTab = document.querySelector(".analyzer-tab.active");
            if (activeAnalyzerTab) {
                const activeTab = activeAnalyzerTab.getAttribute("data-tab");
                const visualizer = document.getElementById("visualizer");
                const spectrum = document.getElementById("spectrum");
                if (activeTab === "visualizer") {
                    visualizer.style.display = "block";
                    spectrum.style.display = "none";
                } else {
                    visualizer.style.display = "none";
                    spectrum.style.display = "block";
                }
            }
        } else {
            // Restore desktop state (show all tracks, remove active class, and restore visualizers)
            tracks.forEach(track => {
                track.container.style.display = "";
                track.container.classList.remove("active-track");
            });
            document.getElementById("visualizer").style.display = "";
            document.getElementById("spectrum").style.display = "";
        }
    };

    window.addEventListener("resize", checkMobileLayout);
    checkMobileLayout(); // Check immediately on load
};