// Control page logic - plain JavaScript, no frameworks
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // API configuration
    const API_BASE = '';
    
    // Application state
    const state = {
        currentAcquisitionId: null,
        currentStatus: 'idle'
    };
    
    // DOM elements
    const elements = {
        status: document.getElementById('status'),
        acquisitionId: document.getElementById('acquisition-id'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        feedback: document.getElementById('feedback')
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
                updateUI();
                const num = data.acquisition_id.replace('acq_', '');
                showFeedback(`✓ Recording stopped (#${num})`, 'success');
                
                // Reset to idle after 2 seconds
                setTimeout(() => {
                    state.currentStatus = 'idle';
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
    
    // Event listeners
    elements.startBtn.addEventListener('click', startAcquisition);
    elements.stopBtn.addEventListener('click', stopAcquisition);
    
    // Initialize on page load
    checkStatus();
    
})();
