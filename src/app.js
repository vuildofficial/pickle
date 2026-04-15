/**
 * PicklePro Analyzer - Main Application
 * Handles UI interactions, YouTube player, and frame capture
 */

// Global state
const state = {
    player: null,
    playerReady: false,
    videoId: null,
    capturedFrames: [],
    analysisResults: null,
    analyzer: null,
    // Local video state
    videoSource: 'youtube', // 'youtube' or 'local'
    localVideoFile: null,
    localPlayer: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    // Initialize the analyzer
    state.analyzer = new PickleballAnalyzer();

    // Load saved API key
    const savedKey = localStorage.getItem('anthropic_api_key');
    if (savedKey) {
        document.getElementById('apiKey').value = savedKey;
        updateApiStatus('API key loaded from storage', 'success');
    }

    // Setup keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Setup URL input enter key
    document.getElementById('youtubeUrl').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadVideo();
        }
    });

    // Setup local video player reference
    state.localPlayer = document.getElementById('localPlayer');

    // Setup drag and drop for file upload
    setupDragAndDrop();
}

/**
 * Video Source Toggle
 */
function setVideoSource(source) {
    state.videoSource = source;

    // Update toggle buttons
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
    });

    // Show/hide appropriate input
    const youtubeInput = document.getElementById('youtubeInput');
    const localFileInput = document.getElementById('localFileInput');

    if (source === 'youtube') {
        youtubeInput.style.display = 'flex';
        localFileInput.style.display = 'none';
    } else {
        youtubeInput.style.display = 'none';
        localFileInput.style.display = 'block';
    }
}

/**
 * Drag and Drop Setup
 */
function setupDragAndDrop() {
    const dropZone = document.getElementById('fileDropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', handleFileDrop, false);
}

function handleFileDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processVideoFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processVideoFile(files[0]);
    }
}

function processVideoFile(file) {
    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
    const validExtensions = ['.mp4', '.mov', '.m4v'];

    const isValidType = validTypes.includes(file.type);
    const isValidExtension = validExtensions.some(ext =>
        file.name.toLowerCase().endsWith(ext)
    );

    if (!isValidType && !isValidExtension) {
        alert('Please select an MP4 or MOV video file.');
        return;
    }

    state.localVideoFile = file;

    // Update UI
    document.getElementById('fileDropZone').style.display = 'none';
    document.getElementById('selectedFile').style.display = 'flex';
    document.getElementById('fileName').textContent = file.name;

    // Load the video
    loadLocalVideo(file);
}

function removeLocalFile() {
    state.localVideoFile = null;

    // Reset file input
    document.getElementById('localVideoFile').value = '';

    // Update UI
    document.getElementById('fileDropZone').style.display = 'block';
    document.getElementById('selectedFile').style.display = 'none';
    document.getElementById('fileName').textContent = '';

    // Hide video section
    document.getElementById('videoSection').classList.remove('visible');
    document.getElementById('analysisControls').classList.remove('visible');

    // Hide and reset local player
    const localPlayer = state.localPlayer;
    localPlayer.style.display = 'none';
    localPlayer.src = '';
    localPlayer.load();

    // Clear frames
    clearFrames();
}

function loadLocalVideo(file) {
    // Create object URL for the video
    const videoUrl = URL.createObjectURL(file);

    // Show video section
    document.getElementById('videoSection').classList.add('visible');
    document.getElementById('videoPlaceholder').classList.add('hidden');
    document.getElementById('analysisControls').classList.add('visible');

    // Hide YouTube player, show local player
    const youtubePlayerDiv = document.getElementById('youtubePlayer');
    youtubePlayerDiv.style.display = 'none';

    const localPlayer = state.localPlayer;
    localPlayer.style.display = 'block';
    localPlayer.src = videoUrl;
    localPlayer.load();

    // Set player as ready when metadata loads
    localPlayer.onloadedmetadata = () => {
        state.playerReady = true;
        console.log('Local video ready:', file.name);
    };

    localPlayer.onerror = () => {
        alert('Error loading video. Please try a different file.');
        removeLocalFile();
    };

    // Clear previous frames
    clearFrames();
}

// YouTube API callback - called automatically when API loads
function onYouTubeIframeAPIReady() {
    console.log('YouTube API ready');
}

/**
 * Settings Panel
 */
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.classList.toggle('open');
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
        updateApiStatus('Please enter an API key', 'error');
        return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
        updateApiStatus('Invalid API key format. Should start with sk-ant-', 'error');
        return;
    }

    localStorage.setItem('anthropic_api_key', apiKey);
    state.analyzer.setApiKey(apiKey);
    updateApiStatus('API key saved successfully!', 'success');

    // Close settings after brief delay
    setTimeout(() => {
        toggleSettings();
    }, 1500);
}

function updateApiStatus(message, type) {
    const status = document.getElementById('apiStatus');
    status.textContent = message;
    status.className = 'api-status ' + type;
}

/**
 * Video Loading
 */
function loadVideo() {
    const urlInput = document.getElementById('youtubeUrl');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('Invalid YouTube URL. Please enter a valid YouTube video link.');
        return;
    }

    state.videoId = videoId;
    state.videoSource = 'youtube';

    // Show video section
    document.getElementById('videoSection').classList.add('visible');
    document.getElementById('videoPlaceholder').classList.add('hidden');
    document.getElementById('analysisControls').classList.add('visible');

    // Hide local player, show YouTube player div
    state.localPlayer.style.display = 'none';
    document.getElementById('youtubePlayer').style.display = 'block';

    // Create or update player
    if (state.player) {
        state.player.loadVideoById(videoId);
    } else {
        createYouTubePlayer(videoId);
    }

    // Clear previous frames
    clearFrames();
}

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

function createYouTubePlayer(videoId) {
    const playerDiv = document.getElementById('youtubePlayer');
    playerDiv.innerHTML = '';

    state.player = new YT.Player('youtubePlayer', {
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            fs: 1,
            origin: window.location.origin
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    state.playerReady = true;
    console.log('Player ready');
}

function onPlayerStateChange(event) {
    // Could track play state for auto-capture features
}

/**
 * Frame Capture
 * Note: Due to YouTube's iframe security restrictions, we cannot directly
 * capture frames from the video. Instead, we capture the current playback
 * timestamp and use YouTube's thumbnail API as a workaround, or prompt
 * users to upload screenshots.
 */
function captureFrame() {
    // Check if we have a video loaded based on source type
    if (state.videoSource === 'local') {
        captureLocalFrame();
    } else {
        captureYouTubeFrame();
    }
}

function captureLocalFrame() {
    const localPlayer = state.localPlayer;

    if (!localPlayer || !localPlayer.src || localPlayer.readyState < 2) {
        alert('Please load a video first');
        return;
    }

    const currentTime = localPlayer.currentTime;
    const formattedTime = formatTime(currentTime);

    // Direct canvas capture from HTML5 video
    const canvas = document.getElementById('captureCanvas');
    canvas.width = localPlayer.videoWidth || 1280;
    canvas.height = localPlayer.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(localPlayer, 0, 0, canvas.width, canvas.height);

    // Add timestamp overlay
    addTimestampOverlay(ctx, canvas, formattedTime);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    const frame = {
        id: Date.now(),
        timestamp: formattedTime,
        timeSeconds: currentTime,
        dataUrl: dataUrl,
        videoId: state.localVideoFile ? state.localVideoFile.name : 'local'
    };

    state.capturedFrames.push(frame);
    renderFrames();
    updateCaptureCount();

    // Visual feedback
    flashCaptureIndicator();
}

function captureYouTubeFrame() {
    if (!state.player || !state.playerReady) {
        alert('Please load a video first');
        return;
    }

    const currentTime = state.player.getCurrentTime();
    const formattedTime = formatTime(currentTime);

    // Use YouTube's thumbnail API for the frame
    // Note: This gets a thumbnail at a fixed interval, not exact frame
    // For production, consider server-side frame extraction
    const qualityOptions = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

    captureYouTubeThumbnail(state.videoId, qualityOptions, 0, (dataUrl) => {
        const frame = {
            id: Date.now(),
            timestamp: formattedTime,
            timeSeconds: currentTime,
            dataUrl: dataUrl,
            videoId: state.videoId
        };

        state.capturedFrames.push(frame);
        renderFrames();
        updateCaptureCount();

        // Visual feedback
        flashCaptureIndicator();
    });
}

function captureYouTubeThumbnail(videoId, qualities, index, callback) {
    if (index >= qualities.length) {
        // Fallback: create a placeholder frame
        createPlaceholderFrame(callback);
        return;
    }

    const url = `https://img.youtube.com/vi/${videoId}/${qualities[index]}.jpg`;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
        // Check if it's a valid thumbnail (not the default gray one)
        if (img.width > 120) {
            const canvas = document.getElementById('captureCanvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Add timestamp overlay
            const currentTime = state.player.getCurrentTime();
            addTimestampOverlay(ctx, canvas, formatTime(currentTime));

            callback(canvas.toDataURL('image/jpeg', 0.9));
        } else {
            // Try next quality
            captureYouTubeThumbnail(videoId, qualities, index + 1, callback);
        }
    };

    img.onerror = function () {
        captureYouTubeThumbnail(videoId, qualities, index + 1, callback);
    };

    img.src = url;
}

function addTimestampOverlay(ctx, canvas, timestamp) {
    const fontSize = Math.max(16, canvas.height / 20);
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';

    const textWidth = ctx.measureText(timestamp).width;
    const padding = 10;
    const x = canvas.width - textWidth - padding * 2;
    const y = canvas.height - padding * 2 - fontSize;

    ctx.fillRect(x - padding, y - padding, textWidth + padding * 2, fontSize + padding * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(timestamp, x, y + fontSize - 4);
}

function createPlaceholderFrame(callback) {
    const canvas = document.getElementById('captureCanvas');
    canvas.width = 640;
    canvas.height = 360;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#4a4a6a';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frame captured at ' + formatTime(state.player.getCurrentTime()), canvas.width / 2, canvas.height / 2);

    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('(Thumbnail preview - AI will analyze video context)', canvas.width / 2, canvas.height / 2 + 30);

    callback(canvas.toDataURL('image/jpeg', 0.9));
}

function flashCaptureIndicator() {
    const btn = document.querySelector('.capture-btn');
    btn.style.transform = 'scale(1.1)';
    setTimeout(() => {
        btn.style.transform = '';
    }, 150);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderFrames() {
    const grid = document.getElementById('framesGrid');
    const panel = document.getElementById('framesPanel');

    if (state.capturedFrames.length === 0) {
        panel.classList.remove('visible');
        grid.innerHTML = '';
        return;
    }

    panel.classList.add('visible');
    grid.innerHTML = state.capturedFrames.map((frame, index) => `
        <div class="frame-item fade-in" style="animation-delay: ${index * 50}ms">
            <img src="${frame.dataUrl}" alt="Frame at ${frame.timestamp}">
            <span class="frame-timestamp">${frame.timestamp}</span>
            <button class="frame-remove" onclick="removeFrame(${frame.id})" title="Remove frame">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function removeFrame(frameId) {
    state.capturedFrames = state.capturedFrames.filter(f => f.id !== frameId);
    renderFrames();
    updateCaptureCount();
}

function clearFrames() {
    state.capturedFrames = [];
    renderFrames();
    updateCaptureCount();
}

function updateCaptureCount() {
    const count = state.capturedFrames.length;
    document.getElementById('captureCount').textContent =
        `${count} frame${count !== 1 ? 's' : ''} captured`;
}

/**
 * Keyboard Shortcuts
 */
function handleKeyboardShortcuts(e) {
    // Space to capture (when not in input)
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        // Don't capture if video is playing/pausing
        return;
    }

    // C to capture frame
    if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        captureFrame();
    }
}

/**
 * Analysis
 */
async function analyzeVideo() {
    const apiKey = state.analyzer.getApiKey();
    if (!apiKey) {
        alert('Please configure your API key in settings first.');
        toggleSettings();
        return;
    }

    if (state.capturedFrames.length === 0) {
        alert('Please capture at least one frame from the video to analyze.');
        return;
    }

    // Get configuration
    const config = {
        courtSide: document.getElementById('courtSide').value,
        courtPosition: document.getElementById('courtPosition').value,
        skillLevel: document.getElementById('skillLevel').value,
        focusAreas: Array.from(document.querySelectorAll('input[name="focus"]:checked'))
            .map(cb => cb.value)
    };

    // Show loading
    showLoading();

    try {
        const results = await state.analyzer.analyzeFrames(
            state.capturedFrames,
            config,
            updateLoadingProgress
        );

        state.analysisResults = results;
        renderResults(results);
        hideLoading();

    } catch (error) {
        hideLoading();
        alert('Analysis failed: ' + error.message);
        console.error('Analysis error:', error);
    }
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('visible');
    document.getElementById('analyzeBtn').disabled = true;
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
    document.getElementById('analyzeBtn').disabled = false;
}

function updateLoadingProgress(status, percentage) {
    document.getElementById('loadingStatus').textContent = status;
    document.getElementById('progressBar').style.width = `${percentage}%`;
}

/**
 * Results Rendering
 */
function renderResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContent = document.getElementById('resultsContent');

    resultsSection.classList.add('visible');

    // Scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    // Build results HTML
    let html = '';

    // Summary card
    html += `
        <div class="summary-card fade-in">
            <div class="summary-header">
                <div class="summary-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                </div>
                <div>
                    <h4 class="summary-title">Game Analysis Summary</h4>
                    <p class="summary-subtitle">${state.capturedFrames.length} frames analyzed</p>
                </div>
            </div>
            <div class="summary-content">
                <p>${results.summary || 'Analysis complete. Review the tips below for detailed feedback.'}</p>
                ${results.strengthsObserved && results.strengthsObserved.length > 0 ? `
                    <p style="margin-top: 12px; color: var(--color-primary);">
                        <strong>Strengths observed:</strong> ${results.strengthsObserved.join(', ')}
                    </p>
                ` : ''}
            </div>
            ${results.stats ? `
                <div class="summary-stats">
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.framesAnalyzed || state.capturedFrames.length}</div>
                        <div class="stat-label">Frames</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.tipsGenerated || countTips(results)}</div>
                        <div class="stat-label">Tips</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.priorityAreas || results.categories?.length || 0}</div>
                        <div class="stat-label">Focus Areas</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    // Category cards
    if (results.categories && results.categories.length > 0) {
        results.categories.forEach((category, catIndex) => {
            html += `
                <div class="tip-category fade-in" style="animation-delay: ${(catIndex + 1) * 100}ms">
                    <div class="category-header">
                        <div class="category-icon">
                            ${getCategoryIcon(category.icon)}
                        </div>
                        <h4 class="category-title">${category.name}</h4>
                    </div>
                    <div class="tips-list">
                        ${category.tips.map((tip, tipIndex) => `
                            <div class="tip-card fade-in" style="animation-delay: ${(catIndex * 100) + (tipIndex * 50)}ms">
                                <div class="tip-header">
                                    <h5 class="tip-title">${tip.title}</h5>
                                    <span class="tip-priority ${tip.priority || 'medium'}">${tip.priority || 'medium'}</span>
                                </div>
                                <p class="tip-description">${tip.description}</p>
                                ${tip.drill ? `
                                    <div class="tip-drill">
                                        <div class="tip-drill-label">Practice Drill</div>
                                        <p class="tip-drill-text">${tip.drill}</p>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
    }

    resultsContent.innerHTML = html;
}

function countTips(results) {
    if (!results.categories) return 0;
    return results.categories.reduce((sum, cat) => sum + (cat.tips?.length || 0), 0);
}

function getCategoryIcon(iconType) {
    const icons = {
        paddle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="9" rx="8" ry="6"/><line x1="12" y1="15" x2="12" y2="22"/></svg>',
        footwork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l3-9-3-4H4l2 6z"/><path d="M16 20h4l-2-6 2-7h-4l-3 4z"/></svg>',
        position: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
        strategy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>',
        body: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="12" y1="12" x2="8" y2="10"/><line x1="12" y1="12" x2="16" y2="10"/><line x1="12" y1="16" x2="9" y2="22"/><line x1="12" y1="16" x2="15" y2="22"/></svg>'
    };
    return icons[iconType] || icons.paddle;
}

/**
 * Export & Reset
 */
function exportResults() {
    if (!state.analysisResults) {
        alert('No results to export');
        return;
    }

    const exportData = {
        exportDate: new Date().toISOString(),
        videoId: state.videoId,
        framesAnalyzed: state.capturedFrames.length,
        analysis: state.analysisResults
    };

    // Create markdown export
    let markdown = `# PicklePro Analyzer Results\n\n`;
    markdown += `**Date:** ${new Date().toLocaleDateString()}\n`;
    if (state.videoSource === 'youtube' && state.videoId) {
        markdown += `**Video:** https://youtube.com/watch?v=${state.videoId}\n`;
    } else if (state.localVideoFile) {
        markdown += `**Video:** ${state.localVideoFile.name} (local file)\n`;
    }
    markdown += `**Frames Analyzed:** ${state.capturedFrames.length}\n\n`;
    markdown += `## Summary\n${state.analysisResults.summary || 'N/A'}\n\n`;

    if (state.analysisResults.categories) {
        state.analysisResults.categories.forEach(cat => {
            markdown += `## ${cat.name}\n\n`;
            cat.tips.forEach(tip => {
                markdown += `### ${tip.title} (${tip.priority} priority)\n`;
                markdown += `${tip.description}\n\n`;
                if (tip.drill) {
                    markdown += `**Practice Drill:** ${tip.drill}\n\n`;
                }
            });
        });
    }

    // Download as file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pickleball-analysis-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function newAnalysis() {
    // Reset results
    state.analysisResults = null;
    document.getElementById('resultsSection').classList.remove('visible');

    // Clear frames
    clearFrames();

    // Reset local video if applicable
    if (state.videoSource === 'local' && state.localVideoFile) {
        removeLocalFile();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
