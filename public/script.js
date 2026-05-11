const steps = document.querySelectorAll(".step"); // ステップボタンを取得
const kickSteps = document.querySelectorAll(".kick .step"); // キックステップボタンを取得
const snareSteps = document.querySelectorAll(".snare .step"); // スネアステップボタンを取得
const hihatSteps = document.querySelectorAll(".hihat .step"); // ハイハットステップボタンを取得
const clapSteps = document.querySelectorAll(".clap .step"); // クラップステップボタンを取得
const bellSteps = document.querySelectorAll(".bell .step"); // ベルステップボタンを取得
const playButton = document.getElementById("play"); // 再生ボタンを取得
const volumeControl = document.getElementById("volume"); // 音量バーを取得
const bpmControl = document.getElementById("bpm"); // BPMバーを取得
const bpmDisplay = document.getElementById("bpm-display"); // BPM表示を取得
const trackVolumes = document.querySelectorAll(".volume-control"); // 各トラックの音量調節バーを取得
const pitchBendControls = document.querySelectorAll(".pitch-bend-control"); // 各トラックのピッチベンド調節バーを取得
const recordButtons = document.querySelectorAll(".record-button"); // !ボタンを取得
const offsetControls = document.querySelectorAll(".offset-control"); // オフセット調節バーを取得
const endOffsetControls = document.querySelectorAll(".end-offset-control"); // 終了位置調節バーを取得
const exportButton = document.getElementById("export"); // エクスポートボタンを取得
const muteButtons = document.querySelectorAll(".mute-button"); // ミュートボタンを取得

const dropdownLinks = document.querySelectorAll(".dropdown-content a");
const dropbtn = document.querySelector(".dropbtn");

let rhythmPrecision = "1/8"; // デフォルトのリズムの細かさ
let stepsPerBeat = 8; // デフォルトのステップ数
let intervalMultiplier = 1; // デフォルトのインターバル倍率

// ドロップダウンメニューのリンクをクリックしたときにリズムの細かさを変更
dropdownLinks.forEach(link => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        
        // 再生中の場合は一旦再生を停止
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            playButton.textContent = ""; // ボタンのテキストを変更
            playButton.classList.remove("playing"); // ボタンのクラスを変更
            steps.forEach(step => step.classList.remove("current")); // 再生停止時に全ステップの現在状態をクリア
            kickSteps.forEach(step => step.classList.remove("current")); // 再生停止時に全キックステップの現在状態をクリア
        }

        rhythmPrecision = event.target.getAttribute("data-precision");
        dropbtn.textContent = rhythmPrecision;
        updateStepsAndInterval();
    });
});
dropdownLinks.forEach(link => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        rhythmPrecision = event.target.getAttribute("data-precision");
        dropbtn.textContent = rhythmPrecision;
        updateStepsAndInterval();
    });
});

function updateStepsAndInterval() {
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
    updateStepButtons();
}

function updateStepButtons() {
    const trackContainers = document.querySelectorAll(".track-container .track");
    trackContainers.forEach(track => {
        const stepButtons = track.querySelectorAll(".step");
        stepButtons.forEach((step, index) => {
            if (index < stepsPerBeat) {
                step.style.display = "inline-block";
                if (rhythmPrecision === "1/16") {
                    step.classList.add("sixteenth");
                } else {
                    step.classList.remove("sixteenth");
                }
            } else {
                step.style.display = "none";
            }
        });
    });
}


let intervalId = null; // インターバルID
let currentStep = 0; // 現在のステップ
let audioContext = null; // オーディオコンテキスト
let gainNode = null; // ゲインノード
let snareBuffer = null; // スネアドラムのオーディオバッファ
let kickBuffer = null; // キックドラムのオーディオバッファ
let hihatBuffer = null; // ハイハットのオーディオバッファ
let clapBuffer = null; // クラップのオーディオバッファ
let bellBuffer = null; // ベルのオーディオバッファ
let mediaRecorder = null; // メディアレコーダー
let recordedChunks = []; // !されたチャンク
let muteStates = [false, false, false, false, false]; // 各トラックのミュート状態を管理

let analyser = null;
let dataArray = null;
let bufferLength = null;
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");

let frequencyDataArray = null;
const spectrumCanvas = document.getElementById("spectrum");
const spectrumCtx = spectrumCanvas.getContext("2d");

// BPMの値を表示
bpmControl.addEventListener("input", () => {
    bpmDisplay.textContent = `♩=${bpmControl.value}`;
    updateBpmDisplayArrows();
});

function updateBpmDisplayArrows() {
    const bpmValue = parseInt(bpmControl.value, 10);
    bpmDisplay.classList.toggle('max', bpmValue >= 200);
    bpmDisplay.classList.toggle('min', bpmValue <= 60);
}

let isDraggingBpm = false;
let startY = 0;
let startBpm = 0;

bpmDisplay.addEventListener("mousedown", (event) => {
    isDraggingBpm = true;
    startY = event.clientY;
    startBpm = parseInt(bpmControl.value, 10);
});

document.addEventListener("mousemove", (event) => {
    if (isDraggingBpm) {
        const deltaY = startY - event.clientY;
        const newBpm = Math.min(200, Math.max(60, startBpm + deltaY));
        bpmControl.value = newBpm;
        bpmDisplay.textContent = `♩=${newBpm}`;
    }
    updateBpmDisplayArrows();
});

document.addEventListener("mouseup", () => {
    isDraggingBpm = false;
    updateBpmDisplayArrows();
});

function adjustBpm(amount) {
    const newBpm = Math.min(200, Math.max(60, parseInt(bpmControl.value, 10) + amount));
    bpmControl.value = newBpm;
    bpmDisplay.textContent = `♩=${newBpm}`;
    updateBpmDisplayArrows();
}

bpmDisplay.addEventListener("click", (event) => {
    const rect = bpmDisplay.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < rect.height / 2) {
        adjustBpm(1); // △をクリックした場合
    } else {
        adjustBpm(-1); // ▽をクリックした場合
    }
});

// オーディオファイルをロードする関数
function loadAudioFile(url) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
    }
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
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

// デフォルトの音源をロードして波形を描画する関数
function loadDefaultSounds() {
    loadAudioFile('sounds/kick.wav').then(buffer => {
        kickBuffer = buffer;
        drawWaveform(buffer, "kick-waveform");
    });
    loadAudioFile('sounds/snare.wav').then(buffer => {
        snareBuffer = buffer;
        drawWaveform(buffer, "snare-waveform");
    });
    loadAudioFile('sounds/clap.wav').then(buffer => {
        clapBuffer = buffer;
        drawWaveform(buffer, "clap-waveform");
    });
    loadAudioFile('sounds/hihat.wav').then(buffer => {
        hihatBuffer = buffer;
        drawWaveform(buffer, "hihat-waveform");
    });
    loadAudioFile('sounds/bell.wav').then(buffer => {
        bellBuffer = buffer;
        drawWaveform(buffer, "bell-waveform");
    });
}

// シンプルなサウンドを再生するための関数
function playSound(buffer, volume, pitch, offset, endOffset, trackIndex) {
    if (!audioContext || !buffer || muteStates[trackIndex]) return; // ミュート状態の場合は再生しない
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(pitch * 2, audioContext.currentTime); // ピッチを設定 (0.5 - 1.5 の範囲に調整)
    const trackGainNode = audioContext.createGain();
    trackGainNode.gain.setValueAtTime(volume, audioContext.currentTime); // トラックごとの音量を設定
    source.connect(trackGainNode).connect(gainNode);
    offset = offset;
    endOffset = endOffset;
    // console.log(`Offset: ${offset}, End Offset: ${endOffset}`);
    const startTime = Math.max(0, buffer.duration * offset);
    const duration = Math.max(0, buffer.duration * (endOffset - offset));
    source.start(0, startTime, duration); // オフセットと終了位置を適用して再生開始
}

// ステップの再生
function playSequence() {
    snareSteps.forEach(step => step.classList.remove("current")); // 以前のスネアステップの現在状態をクリア
    kickSteps.forEach(step => step.classList.remove("current")); // 以前のキックステップの現在状態をクリア
    hihatSteps.forEach(step => step.classList.remove("current")); // 以前のハイハットステップの現在状態をクリア
    clapSteps.forEach(step => step.classList.remove("current")); // 以前のクラップステップの現在状態をクリア
    bellSteps.forEach(step => step.classList.remove("current")); // 以前のベルステップの現在状態をクリア

    if (snareSteps[currentStep] && snareSteps[currentStep].classList.contains("active")) {
        playSound(snareBuffer, trackVolumes[1].value, pitchBendControls[1].value, offsetControls[1].value, endOffsetControls[1].value, 1); // アクティブなスネアステップの場合、スネアドラムのサウンドを再生
    }
    if (kickSteps[currentStep] && kickSteps[currentStep].classList.contains("active")) {
        playSound(kickBuffer, trackVolumes[0].value, pitchBendControls[0].value, offsetControls[0].value, endOffsetControls[0].value, 0); // アクティブなキックステップの場合、キックドラムのサウンドを再生
    }
    if (hihatSteps[currentStep] && hihatSteps[currentStep].classList.contains("active")) {
        playSound(hihatBuffer, trackVolumes[3].value, pitchBendControls[3].value, offsetControls[3].value, endOffsetControls[3].value, 3); // アクティブなハイハットステップの場合、ハイハットのサウンドを再生
    }
    if (clapSteps[currentStep] && clapSteps[currentStep].classList.contains("active")) {
        playSound(clapBuffer, trackVolumes[2].value, pitchBendControls[2].value, offsetControls[2].value, endOffsetControls[2].value, 2); // アクティブなクラップステップの場合、クラップのサウンドを再生
    }
    if (bellSteps[currentStep] && bellSteps[currentStep].classList.contains("active")) {
        playSound(bellBuffer, trackVolumes[4].value, pitchBendControls[4].value, offsetControls[4].value, endOffsetControls[4].value, 4); // アクティブなベルステップの場合、ベルのサウンドを再生
    }

    if (snareSteps[currentStep]) {
        snareSteps[currentStep].classList.add("current"); // 現在のスネアステップを現在状態に
    }
    if (kickSteps[currentStep]) {
        kickSteps[currentStep].classList.add("current"); // 現在のキックステップを現在状態に
    }
    if (hihatSteps[currentStep]) {
        hihatSteps[currentStep].classList.add("current"); // 現在のハイハットステップを現在状態に
    }
    if (clapSteps[currentStep]) {
        clapSteps[currentStep].classList.add("current"); // 現在のクラップステップを現在状態に
    }
    if (bellSteps[currentStep]) {
        bellSteps[currentStep].classList.add("current"); // 現在のベルステップを現在状態に
    }

    currentStep = (currentStep + 1) % stepsPerBeat; // 次のステップに進む
}


// シーケンサーの再生を開始または停止
playButton.addEventListener("click", () => {
    if (!audioContext) {
        // 初めての再生時にオーディオコンテキストを初期化
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
    }
    
    if (intervalId === null) {
        const interval = (30000 / bpmControl.value) * intervalMultiplier; // BPMに基づいてインターバルを計算
        intervalId = setInterval(playSequence, interval); // インターバルを設定
        playButton.textContent = ""; // ボタンのテキストを変更
        playButton.classList.add("playing"); // ボタンのクラスを変更
    } else {
        clearInterval(intervalId); // インターバルをクリア
        intervalId = null;
        playButton.textContent = ""; // ボタンのテキストを変更
        playButton.classList.remove("playing"); // ボタンのクラスを変更
        steps.forEach(step => step.classList.remove("current")); // 再生停止時に全ステップの現在状態をクリア
        kickSteps.forEach(step => step.classList.remove("current")); // 再生停止時に全キックステップの現在状態をクリア
    }
});

/*
// サイト起動時にデフォルトの音源をロードして波形を描画
window.addEventListener("load", () => {
    loadDefaultSounds();
});
*/

window.onload = function(){
    updateStepButtons(); // リズムの細かさに基づいてステップボタンを更新
    loadDefaultSounds();// ページ読み込み時に実行したい処理
    updateBpmDisplayArrows(); // 初期表示時に矢印の色を更新
    setupVisualizer();
    drawVisualizer();
    setupSpectrum();
    drawSpectrum();
}

// ステップをクリックしたときにトグル
snareSteps.forEach(step => {
    step.addEventListener("click", () => {
        step.classList.toggle("active"); // アクティブ状態をトグル
    });
});

// キックステップをクリックしたときにトグル
kickSteps.forEach(step => {
    step.addEventListener("click", () => {
        step.classList.toggle("active"); // アクティブ状態をトグル
    });
});

// ハイハットステップをクリックしたときにトグル
hihatSteps.forEach(step => {
    step.addEventListener("click", () => {
        step.classList.toggle("active"); // アクティブ状態をトグル
    });
});

// クラップステップをクリックしたときにトグル
clapSteps.forEach(step => {
    step.addEventListener("click", () => {
        step.classList.toggle("active"); // アクティブ状態をトグル
    });
});

// ベルステップをクリックしたときにトグル
bellSteps.forEach(step => {
    step.addEventListener("click", () => {
        step.classList.toggle("active"); // アクティブ状態をトグル
    });
});

// 音量調節バーの値を変更したときにスタイルを更新
trackVolumes.forEach(volumeControl => {
    volumeControl.addEventListener("input", (event) => {
        event.target.style.setProperty('--value', event.target.value);
    });
});

// ピッチベンド調節バーの値を変更したときにスタイルを更新
pitchBendControls.forEach(pitchBendControl => {
    pitchBendControl.addEventListener("input", (event) => {
        event.target.style.setProperty('--value', event.target.value);
    });
});

// 波形を描画する関数
function drawWaveform(buffer, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !buffer) return;
    const context = canvas.getContext("2d");
    const data = buffer.getChannelData(0);
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#76c7c0";
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

// !ボタンのクリックイベントを設定
recordButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop(); // 録音を停止
            button.textContent = ""; // ボタンのテキストを変更
            button.style.backgroundImage = "url('sample/rec.png')"; // ボタンの背景画像を変更
            button.classList.remove("recording"); // 録音中クラスを削除
            recordButtons.forEach(btn => btn.disabled = false); // 全ての録音ボタンを有効にする
        } else {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.error('getUserMedia is not supported in this browser.');
                return;
            }
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            recordedChunks.push(event.data);
                        }
                    };
                    mediaRecorder.onstop = () => {
                        const blob = new Blob(recordedChunks, { type: "audio/wav" });
                        const url = URL.createObjectURL(blob);
                        loadAudioFile(url).then(buffer => {
                            switch (index) {
                                case 0:
                                    kickBuffer = buffer;
                                    drawWaveform(buffer, "kick-waveform");
                                    break;
                                case 1:
                                    snareBuffer = buffer;
                                    drawWaveform(buffer, "snare-waveform");
                                    break;
                                case 2:
                                    clapBuffer = buffer;
                                    drawWaveform(buffer, "clap-waveform");
                                    break;
                                case 3:
                                    hihatBuffer = buffer;
                                    drawWaveform(buffer, "hihat-waveform");
                                    break;
                                case 4:
                                    bellBuffer = buffer;
                                    drawWaveform(buffer, "bell-waveform");
                                    break;
                            }
                        });
                        recordedChunks = [];
                        recordButtons.forEach(btn => btn.disabled = false); // 全ての録音ボタンを有効にする
                    };
                    mediaRecorder.start();
                    button.textContent = ""; // ボタンのテキストを変更
                    button.style.backgroundImage = "url('sample/rec.png')"; // ボタンの背景画像を変更
                    button.classList.add("recording"); // 録音中クラスを追加
                    recordButtons.forEach(btn => btn.disabled = true); // 全ての録音ボタンを無効にする
                    button.disabled = false; // 現在のボタンだけ有効にする

                    // アニメーションの時間をBPMに基づいて設定
                    const fillDuration = (30000 / bpmControl.value) * 4 / 1000; // 4ステップ分の時間を秒で計算
                    button.style.setProperty('--fill-duration', `${fillDuration}s`);

                    // 4ステップ後に録音を停止
                    setTimeout(() => {
                        if (mediaRecorder.state === "recording") {
                            mediaRecorder.stop();
                            button.textContent = ""; // ボタンのテキストを変更
                            button.style.backgroundImage = "url('sample/rec.png')"; // ボタンの背景画像を変更
                            button.classList.remove("recording"); // 録音中クラスを削除
                            recordButtons.forEach(btn => btn.disabled = false); // 全ての録音ボタンを有効にする
                        }
                    }, (30000 / bpmControl.value) * 4); // 4ステップ分の時間を計算
                })
                .catch(e => console.error('Error accessing microphone:', e));
        }
    });
});

const waveformContainers = document.querySelectorAll(".waveform-container");

waveformContainers.forEach((container, index) => {
    const offsetHandle = container.querySelector(".offset-handle");
    const endOffsetHandle = container.querySelector(".end-offset-handle");
    const offsetOverlay = container.querySelector(".offset-overlay");
    const endOffsetOverlay = container.querySelector(".end-offset-overlay");
    const waveform = container.querySelector(".waveform");

    let isDraggingOffset = false;
    let isDraggingEndOffset = false;

    const startDraggingOffset = () => isDraggingOffset = true;
    const startDraggingEndOffset = () => isDraggingEndOffset = true;

    offsetHandle.addEventListener("mousedown", startDraggingOffset);
    endOffsetHandle.addEventListener("mousedown", startDraggingEndOffset);

    // Add event listeners to the arrow symbols
    offsetHandle.addEventListener("mousedown", (event) => {
        if (event.target === offsetHandle) {
            startDraggingOffset();
        }
    });
    endOffsetHandle.addEventListener("mousedown", (event) => {
        if (event.target === endOffsetHandle) {
            startDraggingEndOffset();
        }
    });

    document.addEventListener("mouseup", () => {
        isDraggingOffset = false;
        isDraggingEndOffset = false;
    });

    document.addEventListener("mousemove", (event) => {
        if (isDraggingOffset) {
            const rect = waveform.getBoundingClientRect();
            const offset = Math.min(Math.max(0, event.clientX - rect.left), rect.width);
            const endOffset = parseFloat(endOffsetHandle.style.right) || 0;
            if (offset < rect.width - endOffset - 5) {
                offsetHandle.style.left = `${offset}px`;
                offsetOverlay.style.width = `${offset}px`;
                offsetControls[index].value = offset / rect.width;
            }
        }
        if (isDraggingEndOffset) {
            const rect = waveform.getBoundingClientRect();
            const endOffset = Math.min(Math.max(0, rect.right - event.clientX), rect.width);
            const offset = parseFloat(offsetHandle.style.left) || 0;
            if (endOffset < rect.width - offset - 4) {
                endOffsetHandle.style.right = `${endOffset}px`;
                endOffsetOverlay.style.width = `${endOffset}px`;
                endOffsetControls[index].value = 1 - (endOffset / rect.width);
            }
        }
    });
});

async function convertWebmToWav(webmBlob) {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ log: true, corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js' });
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.webm', await fetchFile(webmBlob));
    await ffmpeg.run('-i', 'input.webm', 'output.wav');
    const data = ffmpeg.FS('readFile', 'output.wav');
    const wavBlob = new Blob([data.buffer], { type: 'audio/wav' });
    return wavBlob;
}

exportButton.addEventListener("click", () => {
    // 再生中は一旦再生を停止
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        playButton.textContent = ""; // ボタンのテキストを変更
        playButton.classList.remove("playing"); // ボタンのクラスを変更
    }
    // エクスポート中はエクスポートボタンを押せないようにする
    if (exportButton.classList.contains("exporting")) {
        return;
    }
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
    }

    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);

    const recorder = new MediaRecorder(destination.stream);
    const chunks = [];

    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            chunks.push(event.data);
        }
    };

    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const wavBlob = await convertWebmToWav(blob);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = "VoiceBeats.wav";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    };

    recorder.start();
    exportButton.classList.add("exporting"); // エクスポート中クラスを追加

    currentStep = 0; // 強制的に一番最初のステップから始める
    steps.forEach(step => step.classList.remove("current")); // 全ステップの現在状態をクリア
    let stepCount = 0;
    const interval = (30000 / bpmControl.value) * intervalMultiplier; // BPMに基づいてインターバルを計算
    const playExportSequence = () => {
        playSequence();
        stepCount++;
        if (stepCount >= stepsPerBeat) {
            clearInterval(exportIntervalId);
            recorder.stop();
            exportButton.classList.remove("exporting"); // エクスポート中クラスを削除
        }
    };

    let exportIntervalId = setInterval(playExportSequence, interval);

    // アニメーションの時間をBPMに基づいて設定
    const fillDuration = (30000 / bpmControl.value) * stepsPerBeat / 1000; // ステップ数に基づいて時間を秒で計算
    exportButton.style.setProperty('--fill-duration', `${fillDuration}s`);
});

// ミュートボタンのクリックイベントを設定
muteButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
        muteStates[index] = !muteStates[index]; // ミュート状態をトグル
        button.classList.toggle("muted", muteStates[index]); // ボタンのクラスをトグル
    });
});

function setupVisualizer() {
    if (!audioContext) return;
    analyser = audioContext.createAnalyser();
    gainNode.connect(analyser);
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function drawVisualizer() {
    if (!analyser) return;
    requestAnimationFrame(drawVisualizer);
    analyser.getByteTimeDomainData(dataArray);
    canvasCtx.fillStyle = 'rgba(235, 235, 235, 0.31)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#6ab5ae';
    canvasCtx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    canvasCtx.lineTo(canvas.width, canvas.height/2);
    canvasCtx.stroke();
}

function setupSpectrum() {
    if (!audioContext) return;
    analyser = audioContext.createAnalyser();
    gainNode.connect(analyser);
    analyser.fftSize = 256;
    bufferLength = analyser.frequencyBinCount;
    frequencyDataArray = new Uint8Array(bufferLength);
}

function drawSpectrum() {
    if (!analyser) return;
    requestAnimationFrame(drawSpectrum);
    analyser.getByteFrequencyData(frequencyDataArray);
    spectrumCtx.fillStyle = 'rgba(235, 235, 235, 0.31)';
    spectrumCtx.fillRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
    const barWidth = (spectrumCanvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        barHeight = frequencyDataArray[i];
        spectrumCtx.fillStyle = '#6ab5ae';
        spectrumCtx.fillRect(x, spectrumCanvas.height - barHeight / 2, barWidth, barHeight / 2);
        x += barWidth + 1;
    }
}