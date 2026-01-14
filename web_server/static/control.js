// Control page logic - plain JavaScript, no frameworks
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // API configuration
    const API_BASE = '';
    
    // Application state
    const state = {
        currentAcquisitionId: null,
        currentStatus: 'idle',
        timerInterval: null,
        startTime: null
    };
    
    // DOM elements
    const elements = {
        status: document.getElementById('status'),
        acquisitionId: document.getElementById('acquisition-id'),
        timer: document.getElementById('timer'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        feedback: document.getElementById('feedback'),
        offsetBtn: document.getElementById('offset-btn'),
        offsetFeedback: document.getElementById('offset-feedback')
    };
    
    // Show feedback message to user
    function showFeedback(message, type) {
        elements.feedback.textContent = message;
        elements.feedback.className = `feedback feedback-${type}`;
        elements.feedback.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            elements.feedback.style.display = 'none';
        }, 5000);
    }
    
    // Format time as MM:SS
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    // Update timer display
    function updateTimer() {
        if (state.startTime) {
            const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
            elements.timer.textContent = formatTime(elapsed);
        }
    }
    
    // Start timer
    function startTimer() {
        state.startTime = Date.now();
        elements.timer.textContent = '00:00';
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = setInterval(updateTimer, 1000);
    }
    
    // Stop timer
    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
        updateTimer(); // Final update
    }
    
    // Reset timer
    function resetTimer() {
        stopTimer();
        state.startTime = null;
        elements.timer.textContent = '00:00';
    }
    
    // Update UI based on current state
    function updateUI() {
        // Update status text and styling
        const statusMap = {
            'idle': 'Ready',
            'running': 'Recording',
            'stopped': 'Stopped'
        };
        const statusText = statusMap[state.currentStatus] || 'Ready';
        elements.status.textContent = statusText;
        elements.status.className = state.currentStatus === 'running' ? 'status-running' : 
                                    state.currentStatus === 'stopped' ? 'status-stopped' : 'status-ready';
        
        // Update acquisition ID - show user-friendly format
        if (state.currentAcquisitionId) {
            const num = state.currentAcquisitionId.replace('acq_', '');
            elements.acquisitionId.textContent = `#${num}`;
        } else {
            elements.acquisitionId.textContent = 'None';
        }
        
        // Update button states
        const isRunning = state.currentStatus === 'running';
        elements.startBtn.disabled = isRunning;
        elements.stopBtn.disabled = !isRunning;
    }
    
    // Start acquisition
    async function startAcquisition() {
        try {
            showFeedback('Starting acquisition...', 'info');
            
            const response = await fetch(`${API_BASE}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'started') {
                state.currentAcquisitionId = data.acquisition_id;
                state.currentStatus = 'running';
                startTimer();
                updateUI();
                const num = data.acquisition_id.replace('acq_', '');
                showFeedback(`✓ Recording started (#${num})`, 'success');
            } else {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Start acquisition error:', error);
            showFeedback('✗ Cannot start recording. Check connection.', 'error');
        }
    }
    
    // Stop acquisition
    async function stopAcquisition() {
        try {
            showFeedback('Stopping acquisition...', 'info');
            
            const response = await fetch(`${API_BASE}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'stopped') {
                state.currentStatus = 'stopped';
                stopTimer();
                updateUI();
                const num = data.acquisition_id.replace('acq_', '');
                showFeedback(`✓ Recording stopped (#${num})`, 'success');
                
                // Reset to idle after 2 seconds
                setTimeout(() => {
                    state.currentStatus = 'idle';
                    resetTimer();
                    updateUI();
                }, 2000);
            } else {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Stop acquisition error:', error);
            showFeedback('✗ Cannot stop recording. Check connection.', 'error');
        }
    }
    
    // Check current acquisition status on load
    async function checkStatus() {
        try {
            const response = await fetch(`${API_BASE}/acquisitions`);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.current_acquisition) {
                state.currentAcquisitionId = data.current_acquisition;
                state.currentStatus = 'running';
            } else {
                state.currentStatus = 'idle';
                state.currentAcquisitionId = null;
            }
            updateUI();
        } catch (error) {
            console.error('Check status error:', error);
            showFeedback('Cannot connect. Check if device is powered on.', 'error');
        }
    }
    
    // Set offset
    async function setOffset() {
        try {
            showFeedbackOffset('Setting offset...', 'info');
            
            const response = await fetch(`${API_BASE}/set_offset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showFeedbackOffset(`✓ Offset set`, 'success');
            } else {
                showFeedbackOffset(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Set offset error:', error);
            showFeedbackOffset('✗ Cannot set offset. Check connection.', 'error');
        }
    }
    
    // Show offset feedback message
    function showFeedbackOffset(message, type) {
        elements.offsetFeedback.textContent = message;
        elements.offsetFeedback.className = `feedback feedback-${type}`;
        elements.offsetFeedback.style.display = 'block';
        
        setTimeout(() => {
            elements.offsetFeedback.style.display = 'none';
        }, 5000);
    }
    
    // Event listeners
    elements.offsetBtn.addEventListener('click', setOffset);
    
    elements.startBtn.addEventListener('click', startAcquisition);
    elements.stopBtn.addEventListener('click', stopAcquisition);
    
    // Initialize on page load
    checkStatus();
    
})();
