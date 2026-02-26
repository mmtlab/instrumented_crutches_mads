// Control page logic - plain JavaScript, no frameworks
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // Configuration - which side is the master (only change on restart)
    const masterSide = 'right';  // Can be 'left' or 'right' - requires restart to change
    
    // API configuration
    const API_BASE = '';
    
    // Application state
    const state = {
        currentAcquisitionId: null,
        currentStatus: 'idle',
        timerInterval: null,
        startTime: null,
        currentConditionId: null
    };
    
    // DOM elements
    const elements = {
        status: document.getElementById('status'),
        acquisitionId: document.getElementById('acquisition-id'),
        timer: document.getElementById('timer'),
        currentCondition: document.getElementById('current-condition'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        feedback: document.getElementById('feedback'),
        offsetBtn: document.getElementById('offset-btn'),
        offsetLeft: document.getElementById('offset-left'),
        offsetRight: document.getElementById('offset-right'),
        errorDialog: document.getElementById('error-dialog'),
        errorDialogMessage: document.getElementById('error-dialog-message'),
        errorDialogIgnore: document.getElementById('error-dialog-ignore'),
        errorDialogStop: document.getElementById('error-dialog-stop'),
        offsetLeftIndicator: document.getElementById('offset-left-indicator'),
        offsetRightIndicator: document.getElementById('offset-right-indicator'),
        offsetTime: document.getElementById('offset-time'),
        offsetFeedbackContainer: document.getElementById('offset-feedback-container'),
        startStopFeedbackContainer: document.getElementById('start-stop-feedback-container'),
        subjectId: document.getElementById('subject-id'),
        sessionId: document.getElementById('session-id'),
        heightCm: document.getElementById('height-cm'),
        weightKg: document.getElementById('weight-kg'),
        crutchHeight: document.getElementById('crutch-height'),
        toggleConfigBtn: document.getElementById('toggle-config-btn'),
        configContent: document.getElementById('config-content'),
        toggleCommentsBtn: document.getElementById('toggle-comments-btn'),
        commentsContent: document.getElementById('comments-content'),
        commentText: document.getElementById('comment-text'),
        saveCommentBtn: document.getElementById('save-comment-btn'),
        commentFeedback: document.getElementById('comment-feedback'),
        tipLeft: document.getElementById('tip-left'),
        tipRight: document.getElementById('tip-right'),
        tipLeftState: document.getElementById('tip-left-state'),
        tipRightState: document.getElementById('tip-right-state'),
        tipLeftValue: document.getElementById('tip-left-value'),
        tipRightValue: document.getElementById('tip-right-value'),
        statusCoordinator: document.getElementById('status-coordinator'),
        statusCoordinatorState: document.getElementById('status-coordinator-state'),
        statusCoordinatorValue: document.getElementById('status-coordinator-value'),
        statusEyetracker: document.getElementById('status-eyetracker'),
        statusEyetrackerState: document.getElementById('status-eyetracker-state'),
        statusEyetrackerValue: document.getElementById('status-eyetracker-value'),
        statusHdf5: document.getElementById('status-hdf5'),
        statusHdf5State: document.getElementById('status-hdf5-state'),
        statusHdf5Value: document.getElementById('status-hdf5-value'),
        toggleNodeStatusBtn: document.getElementById('toggle-node-status-btn'),
        nodeStatusContent: document.getElementById('node-status-content'),
        conditionBtn: document.getElementById('condition-btn'),
        conditionsModal: document.getElementById('conditions-modal'),
        closeConditionsBtn: document.getElementById('close-conditions-btn'),
        conditionsGrid: document.getElementById('conditions-grid'),
        eyetrackerBtn: document.getElementById('eyetracker-btn'),
        eyetrackerStatus: document.getElementById('eyetracker-status'),
        eyetrackerFeedbackContainer: document.getElementById('eyetracker-feedback-container')
    };
    
    // Application state - add current condition
    state.currentCondition = null; // No default condition on startup
    state.currentConditionId = null;
    state.eyetrackerConnected = false; // Eye-tracker connection state

    
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
    
    // Track dismissed messages across refresh
    const dismissedMessages = new Set(JSON.parse(localStorage.getItem('dismissedStatusMessages') || '[]'));

    function saveDismissedMessages() {
        localStorage.setItem('dismissedStatusMessages', JSON.stringify(Array.from(dismissedMessages).slice(-200)));
    }

    async function dismissServerMessage(messageKey) {
        try {
            await fetch(`${API_BASE}/status/dismiss`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_key: messageKey })
            });
        } catch (error) {
            console.warn('Dismiss status error:', error);
        }
    }

    // Add persistent error message to a container (with close button)
    function addPersistentMessage(container, message, type, messageKey, meta = {}) {
        if (messageKey && dismissedMessages.has(messageKey)) {
            console.log(`✉️ Skipping dismissed message: ${messageKey}`);
            return;
        }
        const msgDiv = document.createElement('div');
        msgDiv.className = `feedback-message feedback-${type}`;
        if (messageKey) {
            msgDiv.dataset.messageKey = messageKey;
        }
        if (meta && typeof meta === 'object') {
            if (meta.source) msgDiv.dataset.source = meta.source;
            if (meta.side) msgDiv.dataset.side = meta.side;
            if (meta.level) msgDiv.dataset.level = meta.level;
            if (meta.text) msgDiv.dataset.text = meta.text;
        }
        
        const textSpan = document.createElement('span');
        textSpan.className = 'feedback-message-text';
        textSpan.textContent = message;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'feedback-message-close';
        closeBtn.innerHTML = '✕';
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            msgDiv.remove();
            if (messageKey) {
                dismissedMessages.add(messageKey);
                saveDismissedMessages();
                dismissServerMessage(messageKey);
            }
        });
        
        msgDiv.appendChild(textSpan);
        msgDiv.appendChild(closeBtn);
        container.appendChild(msgDiv);
        
        console.log(`✉️ Added persistent ${type} message to ${container.id}`);
    }
    
    // Clear all messages from container
    function clearMessages(container) {
        container.innerHTML = '';
    }

    // Clear offset-related messages and dismiss on server
    function clearOffsetMessages() {
        const nodes = Array.from(elements.offsetFeedbackContainer.children);
        nodes.forEach((node) => {
            const messageKey = node.dataset ? node.dataset.messageKey : null;
            if (messageKey) {
                dismissServerMessage(messageKey);
                dismissedMessages.add(messageKey);
            }
        });
        saveDismissedMessages();
        clearMessages(elements.offsetFeedbackContainer);
    }

    function removeShutdownMessagesForNode(source, side) {
        const containers = [elements.startStopFeedbackContainer, elements.offsetFeedbackContainer].filter(Boolean);
        const sourceBase = (source || '').toLowerCase().replace(/\.plugin$/, '');
        
        containers.forEach((container) => {
            const nodes = Array.from(container.querySelectorAll('.feedback-message'));
            nodes.forEach((node) => {
                const nodeSource = (node.dataset.source || '').toLowerCase().replace(/\.plugin$/, '');
                const nodeSide = (node.dataset.side || '').toLowerCase();
                const nodeLevel = (node.dataset.level || '').toLowerCase();
                const nodeText = (node.dataset.text || '').toLowerCase();

                const sourceMatch = nodeSource && (nodeSource === sourceBase || nodeSource.includes(sourceBase) || sourceBase.includes(nodeSource));
                const sideMatch = !side ? true : (!nodeSide || nodeSide === side.toLowerCase());
                const looksLikeShutdown = nodeText.includes('shutdown') || nodeText.includes('shutting down');
                const isCritical = nodeLevel === 'critical' || nodeLevel === 'fatal' || nodeLevel === 'error';

                if (sourceMatch && sideMatch && (looksLikeShutdown || isCritical)) {
                    const messageKey = node.dataset ? node.dataset.messageKey : null;
                    if (messageKey) {
                        dismissedMessages.add(messageKey);
                        saveDismissedMessages();
                        dismissServerMessage(messageKey);
                    }
                    node.remove();
                }
            });
        });
    }

    const tipStatusClasses = ['node-status-unknown', 'node-status-live', 'node-status-dead'];
    const statusValueClasses = ['node-status-value-ready', 'node-status-value-attn', 'node-status-value-recording'];

    function deriveIndicatorStatus(message, statusValue) {
        const msg = (message || '').toString().trim().toLowerCase();
        const status = (statusValue || '').toString().trim().toLowerCase();

        if (msg.includes('startup')) return 'live';
        if (msg.includes('shutdown')) return 'dead';
        if (status === 'idle') return 'live';
        if (status === 'recording') return 'live';
        if (status === 'shutdown') return 'dead';

        return 'unknown';
    }

    function applyStatusValue(valueLabel, statusValue, options = {}) {
        if (!valueLabel) return;
        valueLabel.classList.remove(...statusValueClasses);

        if (!statusValue) {
            valueLabel.textContent = '';
            return;
        }

        const normalized = statusValue.toString().trim().toLowerCase();
        if (normalized === 'idle') {
            if (options.isPupilNeon) {
                valueLabel.textContent = 'ready to connect';
                valueLabel.classList.add('node-status-value-attn');
            } else {
                valueLabel.textContent = 'ready';
                valueLabel.classList.add('node-status-value-ready');
            }
            return;
        }

        if (normalized === 'connected') {
            valueLabel.textContent = 'CONNECTED';
            valueLabel.classList.add('node-status-value-ready');
            return;
        }

        if (normalized === 'disconnected') {
            valueLabel.textContent = 'DISCONNECTED';
            valueLabel.classList.add('node-status-value-attn');
            return;
        }

        if (normalized === 'recording') {
            valueLabel.textContent = 'RECORDING';
            valueLabel.classList.add('node-status-value-recording');
            return;
        }

        valueLabel.textContent = statusValue;
    }

    function setServiceStatus(serviceName, status, statusValue) {
        let indicator, stateLabel, valueLabel;
        
        if (serviceName === 'coordinator') {
            indicator = elements.statusCoordinator;
            stateLabel = elements.statusCoordinatorState;
            valueLabel = elements.statusCoordinatorValue;
        } else if (serviceName === 'hdf5_writer') {
            indicator = elements.statusHdf5;
            stateLabel = elements.statusHdf5State;
            valueLabel = elements.statusHdf5Value;
        } else {
            return;
        }

        if (!indicator || !stateLabel) return;

        indicator.classList.remove(...tipStatusClasses);
        if (status === 'live') {
            indicator.classList.add('node-status-live');
            stateLabel.textContent = 'Alive';
        } else if (status === 'dead') {
            indicator.classList.add('node-status-dead');
            stateLabel.textContent = 'Dead';
        } else {
            indicator.classList.add('node-status-unknown');
            stateLabel.textContent = 'Unknown';
        }
        
        // Update status value if provided
        applyStatusValue(valueLabel, statusValue);
    }

    function setTipStatus(side, status, statusValue) {
        const isLeft = side === 'left';
        const indicator = isLeft ? elements.tipLeft : elements.tipRight;
        const stateLabel = isLeft ? elements.tipLeftState : elements.tipRightState;
        const valueLabel = isLeft ? elements.tipLeftValue : elements.tipRightValue;

        if (!indicator || !stateLabel) return;

        indicator.classList.remove(...tipStatusClasses);
        if (status === 'live') {
            indicator.classList.add('node-status-live');
            stateLabel.textContent = 'Alive';
        } else if (status === 'dead') {
            indicator.classList.add('node-status-dead');
            stateLabel.textContent = 'Dead';
        } else {
            indicator.classList.add('node-status-unknown');
            stateLabel.textContent = 'Unknown';
        }
        
        // Update status value if provided
        applyStatusValue(valueLabel, statusValue);
    }

    const eyetrackerStatusClasses = ['node-status-connected', 'node-status-disconnected'];

    function setEyetrackerStatus(status, statusValue, options = {}) {
        const indicator = elements.statusEyetracker;
        const stateLabel = elements.statusEyetrackerState;
        const valueLabel = elements.statusEyetrackerValue;

        if (!indicator || !stateLabel) {
            console.warn('⚠️ Eye-tracker status elements not found');
            return;
        }

        const isConnected = status === 'connected';
        
        console.log(`🔄 setEyetrackerStatus called with: "${status}"`);
        
        // Update Status panel
        indicator.classList.remove(...eyetrackerStatusClasses);
        if (isConnected) {
            indicator.classList.add('node-status-connected');
            stateLabel.textContent = 'Connected';
            console.log('✅ Eye-tracker Status Panel: Connected');
        } else {
            indicator.classList.add('node-status-disconnected');
            stateLabel.textContent = 'Disconnected';
            console.log('❌ Eye-tracker Status Panel: Disconnected');
        }
        
        // Update Eye-tracker feedback panel and button
        if (elements.eyetrackerStatus) {
            elements.eyetrackerStatus.textContent = isConnected ? 'Connected' : 'Disconnected';
            elements.eyetrackerStatus.style.color = isConnected ? '#10b981' : '#64748b';
        }
        
        if (elements.eyetrackerBtn) {
            elements.eyetrackerBtn.textContent = isConnected ? 'Disconnect' : 'Connect';
        }
        
        // Sync state
        state.eyetrackerConnected = isConnected;
        
        // Update status value if provided
        applyStatusValue(valueLabel, statusValue, options);
    }

    function getCrutchSideFromMessage(msg) {
        const sideRaw = (msg.side || '').toString().toLowerCase();
        if (sideRaw === 'left' || sideRaw === 'right') return sideRaw;

        const sourceRaw = (msg.source || msg.name || msg.agent_id || msg.topic || '').toString().toLowerCase();
        if (sourceRaw.includes('tip_loadcell_left')) return 'left';
        if (sourceRaw.includes('tip_loadcell_right')) return 'right';
        return '';
    }

    function updateSensorStatusFromMessage(msg) {
        const level = (msg.level || '').toString().toLowerCase();
        const text = (msg.message || '').toString().trim().toLowerCase();
        const source = (msg.source || msg.name || msg.agent_id || msg.topic || '').toString();
        const sourceNorm = source.toLowerCase().replace(/\.plugin$/, '');
        const statusValue = (msg.status || '').toString();  // New status field from message

        // Handle eye-tracker sensors (pupil_neon, eye_tracker)
        if (sourceNorm.includes('eye_tracker') || sourceNorm.includes('pupil_neon')) {
            console.log(`👁️ Eye-tracker message detected: source="${source}", text="${text}", level="${level}"`);
            // Check disconnected FIRST (more specific) before connected
            const isPupilNeon = sourceNorm.includes('pupil_neon');

            if (text === 'disconnected' || text.includes('disconnected')) {
                console.log(`❌ Calling setEyetrackerStatus('disconnected')`);
                setEyetrackerStatus('disconnected', statusValue, { isPupilNeon });
                return;
            } else if (text === 'connected' || text.includes('connected')) {
                console.log(`✅ Calling setEyetrackerStatus('connected')`);
                setEyetrackerStatus('connected', statusValue, { isPupilNeon });
                return;
            } else {
                console.warn(`⚠️ Eye-tracker message not recognized: "${text}"`);
                return;
            }
        }

        // Handle tip loadcell sensors and master services
        const side = getCrutchSideFromMessage(msg);
        const isStartup = level === 'info' && text === 'startup';
        const isShutdown = level === 'critical' && (text === 'shutdown' || text.includes('shutdown') || text.includes('shutting down'));

        if (isStartup) {
            // Remove shutdown messages for this source (with or without side)
            removeShutdownMessagesForNode(source, side);
            // Update tip status only if we have a side (loadcell)
            if (side) {
                setTipStatus(side, 'live', statusValue);
            }
            // Update master services status
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', 'live', statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'live', statusValue);
            }
        } else if (isShutdown) {
            // Update tip status only if we have a side (loadcell)
            if (side) {
                setTipStatus(side, 'dead', statusValue);
            }
            // Update master services status
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', 'dead', statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'dead', statusValue);
            }
        } else if (statusValue) {
            const derivedStatus = deriveIndicatorStatus(text, statusValue);
            if (side) {
                setTipStatus(side, derivedStatus, statusValue);
            }
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', derivedStatus, statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', derivedStatus, statusValue);
            }
        }
    }
    
    // Update offset display values
    function updateOffsetDisplay(message, side) {
        // Parse message like: "offset = 50 N, test = 5 N"
        const offsetMatch = message.match(/offset\s*=\s*([-\d.]+)/i);
        const testMatch = message.match(/test\s*=\s*([-\d.]+)/i);
        const offsetValue = offsetMatch ? parseFloat(offsetMatch[1]) : null;
        const testValue = testMatch ? parseFloat(testMatch[1]) : null;
        
        const offsetClasses = ['offset-indicator-unknown', 'offset-indicator-ok', 'offset-indicator-warning'];
        const targetSide = (side || '').toLowerCase();
        
        const updateSide = (which) => {
            const value = testValue !== null ? testValue : offsetValue;
            if (value === null || Number.isNaN(value)) return;
            const absValue = Math.abs(testValue !== null ? testValue : value);
            if (which === 'left') {
                elements.offsetLeft.textContent = value.toFixed(2);
                if (elements.offsetLeftIndicator) {
                    elements.offsetLeftIndicator.classList.remove(...offsetClasses);
                    elements.offsetLeftIndicator.classList.add(absValue > 10 ? 'offset-indicator-warning' : 'offset-indicator-ok');
                }
            } else if (which === 'right') {
                elements.offsetRight.textContent = value.toFixed(2);
                if (elements.offsetRightIndicator) {
                    elements.offsetRightIndicator.classList.remove(...offsetClasses);
                    elements.offsetRightIndicator.classList.add(absValue > 10 ? 'offset-indicator-warning' : 'offset-indicator-ok');
                }
            }
        };
        
        if (targetSide === 'left' || targetSide === 'right') {
            updateSide(targetSide);
        } else {
            updateSide('left');
            updateSide('right');
        }
        
        // Update time with current time in HH:MM:SS format
        const now = new Date();
        const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        elements.offsetTime.textContent = timeStr;
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
        
        // Update current condition display
        elements.currentCondition.textContent = state.currentCondition || '-';
        
        // Update button states
        const isRunning = state.currentStatus === 'running';
        elements.startBtn.disabled = isRunning;
        elements.stopBtn.disabled = !isRunning;
    }
    
    // Start acquisition
    async function startAcquisition() {
        try {
            // Clear previous errors on start
            clearMessages(elements.startStopFeedbackContainer);
            
            showFeedback('Starting acquisition...', 'info');
            
            // Collect test configuration
            const testConfig = {
                subject_id: elements.subjectId.value ? parseInt(elements.subjectId.value) : null,
                session_id: elements.sessionId.value ? parseInt(elements.sessionId.value) : null,
                height_cm: elements.heightCm.value ? parseInt(elements.heightCm.value) : null,
                weight_kg: elements.weightKg.value ? parseFloat(elements.weightKg.value) : null,
                crutch_height: elements.crutchHeight.value ? parseInt(elements.crutchHeight.value) : null
            };
            
            // Add current condition ID
            if (state.currentConditionId) {
                testConfig.condition_id = state.currentConditionId;
            }
            
            // Add comment if present
            const comment = elements.commentText.value.trim();
            if (comment) {
                testConfig.comment = comment;
            }
            
            const response = await fetch(`${API_BASE}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testConfig)
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
                
                // Clear comment field after successful start
                if (comment) {
                    elements.commentText.value = '';
                }
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
            // Clear previous errors on stop
            clearMessages(elements.startStopFeedbackContainer);
            
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
                state.currentCondition = null; // Reset condition after stop
                state.currentConditionId = null;
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
            // Clear previous offset errors on calibrate
            clearOffsetMessages();
            
            const response = await fetch(`${API_BASE}/set_offset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status !== 'success') {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Set offset error:', error);
            showFeedback('✗ Cannot set offset. Check connection.', 'error');
        }
    }
    
    // Show offset feedback message
    // Load last test configuration
    async function loadLastTestConfig() {
        try {
            const response = await fetch(`${API_BASE}/last-test-config`);
            
            if (!response.ok) {
                return; // Silently fail if no data
            }
            
            const data = await response.json();
            const testConfig = data.test_config;
            
            if (testConfig) {
                if (testConfig.subject_id) elements.subjectId.value = testConfig.subject_id;
                if (testConfig.session_id) elements.sessionId.value = testConfig.session_id;
                if (testConfig.height_cm) elements.heightCm.value = testConfig.height_cm;
                if (testConfig.weight_kg) elements.weightKg.value = testConfig.weight_kg;
                if (testConfig.crutch_height) elements.crutchHeight.value = testConfig.crutch_height;
            }
        } catch (error) {
            console.error('Load last test config error:', error);
            // Silently fail - this is optional
        }
    }
    
    // Toggle configuration panel
    function toggleConfigPanel() {
        elements.configContent.classList.toggle('collapsed');
        elements.toggleConfigBtn.classList.toggle('collapsed');
    }
    
    // Toggle comments panel
    function toggleCommentsPanel() {
        elements.commentsContent.classList.toggle('collapsed');
        elements.toggleCommentsBtn.classList.toggle('collapsed');
    }

    // Toggle node status panel
    function toggleNodeStatusPanel() {
        if (!elements.nodeStatusContent || !elements.toggleNodeStatusBtn) return;
        elements.nodeStatusContent.classList.toggle('collapsed');
        elements.toggleNodeStatusBtn.classList.toggle('collapsed');
    }

    // Configure Status panel based on masterSide
    function configureStatusPanel() {
        const cards = document.querySelectorAll('.node-status-card');
        if (cards.length < 2) return;
        
        // Find cards by their content (which one contains tip_loadcell_left/right)
        let leftCard = null;
        let rightCard = null;
        
        cards.forEach(card => {
            if (card.textContent.includes('tip_loadcell_left')) {
                leftCard = card;
            }
            if (card.textContent.includes('tip_loadcell_right')) {
                rightCard = card;
            }
        });
        
        if (!leftCard || !rightCard) {
            console.warn('⚠ Could not identify left/right cards');
            return;
        }
        
        const isMasterLeft = masterSide === 'left';
        const masterCard = isMasterLeft ? leftCard : rightCard;
        
        // Update card titles with correct roles (left always first, right always second)
        const leftTitle = leftCard.querySelector('.node-status-card-title');
        const rightTitle = rightCard.querySelector('.node-status-card-title');
        
        if (leftTitle) {
            leftTitle.textContent = `Left Crutch (${isMasterLeft ? 'Master' : 'Slave'})`;
        }
        if (rightTitle) {
            rightTitle.textContent = `Right Crutch (${isMasterLeft ? 'Slave' : 'Master'})`;
        }
        
        // Move Coordinator, Logger, Eye-tracker and Separator items to master card
        // Find the items
        const coordinatorNode = document.querySelector('[id="status-coordinator"]');
        const loggerNode = document.querySelector('[id="status-hdf5"]');
        const eyetrackerNode = document.querySelector('[id="status-eyetracker"]');
        const tipNode = masterCard.querySelector('[id*="tip-"]');

        const coordinatorItem = coordinatorNode ? coordinatorNode.closest('.node-status-item') : null;
        const loggerItem = loggerNode ? loggerNode.closest('.node-status-item') : null;
        const eyetrackerItem = eyetrackerNode ? eyetrackerNode.closest('.node-status-item') : null;
        const separator = leftCard.querySelector('.node-status-separator');
        const tipItem = tipNode ? tipNode.closest('.node-status-item') : null;
        
        if (coordinatorItem && loggerItem && eyetrackerItem && separator && tipItem) {
            // Remove from their current location
            coordinatorItem.remove();
            loggerItem.remove();
            eyetrackerItem.remove();
            separator.remove();
            
            // Insert into master card maintaining order: Coordinator, Logger, Eye-tracker, Separator, Tip
            tipItem.parentNode.insertBefore(coordinatorItem, tipItem);
            coordinatorItem.parentNode.insertBefore(loggerItem, tipItem);
            loggerItem.parentNode.insertBefore(eyetrackerItem, tipItem);
            eyetrackerItem.parentNode.insertBefore(separator, tipItem);
        }
        
        console.log(`✓ Status panel configured: master=${masterSide}`);
    }

    let lastStatusCount = 0;
    
    async function checkNewStatusMessages() {
        try {
            const response = await fetch(`${API_BASE}/status`);
            if (!response.ok) return;
            const data = await response.json();
            const messages = data.messages || [];
            const totalCount = data.total_count || data.count || 0;
            
            console.log(`📥 Received ${messages.length} recent messages (total: ${totalCount}, lastStatusCount: ${lastStatusCount})`);
            
            // Show only new messages as feedback
            if (totalCount > lastStatusCount) {
                const newMessages = messages.slice(Math.max(0, lastStatusCount - (totalCount - messages.length)));
                console.log(`📨 Processing ${newMessages.length} new messages:`, newMessages);
                newMessages.forEach(msg => {
                    const level = (msg.level || 'info').toString().toLowerCase();
                    const source = msg.source || msg.name || 'system';
                    const side = msg.side ? ` (${msg.side})` : '';
                    const text = msg.message || msg.error || msg.detail || 'Status update';
                    const messageText = `${source}${side}: ${text}`;

                    updateSensorStatusFromMessage(msg);
                    
                    // Map level to feedback type
                    let feedbackType = 'info';
                    if (level === 'error' || level === 'fatal' || level === 'critical') {
                        feedbackType = 'error';
                    } else if (level === 'warning') {
                        feedbackType = 'warning';
                    }
                    
                    console.log(`✉️ Processing message: ${messageText} [${feedbackType}]`);
                    
                    // Check if this is an offset message
                    const isOffsetMessage = /\boffset\s*=\s*[-\d.]+/i.test(text || '') && /\btest\s*=\s*[-\d.]+/i.test(text || '');
                    if (isOffsetMessage) {
                        updateOffsetDisplay(text, msg.side || msg.topic);
                        // Don't show the message as feedback, only update the display
                        return;
                    }
                    
                    // Determine routing: set_offset errors go to offset section, others to start/stop section
                    const isOffsetRelated = isOffsetMessage ||
                                           source?.toLowerCase().includes('set_offset') || 
                                           text?.toLowerCase().includes('set_offset') ||
                                           text?.toLowerCase().includes('calibrat');
                    
                    if (feedbackType === 'error' || feedbackType === 'warning') {
                        // Check if conditions modal is open and this is a critical error
                        const isConditionsModalOpen = elements.conditionsModal.classList.contains('open');
                        const isCriticalError = (level === 'error' || level === 'critical' || level === 'fatal');
                        
                        if (isConditionsModalOpen && isCriticalError) {
                            // Show error dialog instead of persistent message
                            showErrorDialog(messageText);
                            console.log(`⚠️ Showed error dialog during condition selection`);
                            return;
                        }
                        
                        // Persistent message (with close button)
                        const targetContainer = isOffsetRelated ? 
                            elements.offsetFeedbackContainer : 
                            elements.startStopFeedbackContainer;
                        const messageKey = `${messageText}::${msg.timestamp || msg.timecode || ''}`;
                        addPersistentMessage(targetContainer, messageText, feedbackType, messageKey, {
                            source: source,
                            side: msg.side || '',
                            level: level,
                            text: text
                        });
                        console.log(`✉️ Added persistent message to ${isOffsetRelated ? 'offset' : 'start/stop'} container`);
                    } else {
                        // Transient message (auto-close)
                        showFeedback(messageText, feedbackType);
                        console.log(`✉️ Showed auto-close feedback`);
                    }
                });
            }
            lastStatusCount = totalCount;  // Track total count globally, not array length
        } catch (error) {
            console.error('Check status error:', error);
        }
    }
    
    // Load and update component status state from backend
    async function loadAndUpdateStatusState() {
        try {
            const response = await fetch(`${API_BASE}/status/state`);
            if (!response.ok) return;
            const statusState = await response.json();

            console.log(`📊 Received status state:`, statusState);

            // Update each component's status indicator and value
            if (statusState.coordinator) {
                const {message, status: statusValue} = statusState.coordinator;
                const sensorStatus = deriveIndicatorStatus(message, statusValue);
                setServiceStatus('coordinator', sensorStatus, statusValue);
            }

            if (statusState.hdf5_writer) {
                const {message, status: statusValue} = statusState.hdf5_writer;
                const sensorStatus = deriveIndicatorStatus(message, statusValue);
                setServiceStatus('hdf5_writer', sensorStatus, statusValue);
            }

            if (statusState.tip_loadcell_left) {
                const {message, status: statusValue} = statusState.tip_loadcell_left;
                const sensorStatus = deriveIndicatorStatus(message, statusValue);
                setTipStatus('left', sensorStatus, statusValue);
            }

            if (statusState.tip_loadcell_right) {
                const {message, status: statusValue} = statusState.tip_loadcell_right;
                const sensorStatus = deriveIndicatorStatus(message, statusValue);
                setTipStatus('right', sensorStatus, statusValue);
            }

            if (statusState.eye_tracker) {
                const {status: statusValue, source} = statusState.eye_tracker;
                const isConnected = statusValue.toLowerCase() !== 'idle' && statusValue.toLowerCase() !== 'disconnected';
                const isPupilNeon = (source || '').toString().toLowerCase().includes('pupil_neon');
                console.log(`📊 Eye-tracker status: "${statusValue}" -> connected=${isConnected}`);
                setEyetrackerStatus(isConnected ? 'connected' : 'disconnected', statusValue, { isPupilNeon });
            }
        } catch (error) {
            console.error('Load status state error:', error);
        }
    }
    
    // Show comment feedback message
    function showCommentFeedback(message, type) {
        elements.commentFeedback.textContent = message;
        elements.commentFeedback.className = `feedback feedback-${type}`;
        elements.commentFeedback.style.display = 'block';
        
        setTimeout(() => {
            elements.commentFeedback.style.display = 'none';
        }, 5000);
    }
    
    // Save comment
    async function saveComment() {
        const comment = elements.commentText.value.trim();
        
        if (!comment) {
            showCommentFeedback('⚠ Comment cannot be empty', 'warning');
            return;
        }
        
        try {
            showCommentFeedback('Saving comment...', 'info');
            
            const response = await fetch(`${API_BASE}/save_comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: comment })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showCommentFeedback(`✓ Comment saved`, 'success');
                elements.commentText.value = ''; // Clear the textarea
            } else {
                showCommentFeedback(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Save comment error:', error);
            showCommentFeedback('✗ Cannot save comment. Check connection.', 'error');
        }
    }
    
    // Load last condition if available
    async function loadLastCondition() {
        try {
            const response = await fetch(`${API_BASE}/acquisitions`);
            
            if (!response.ok) {
                return; // Use default walking
            }
            
            const data = await response.json();
            const acquisitions = data.acquisitions;
            
            if (acquisitions.length === 0) {
                state.currentCondition = null; // No condition yet
                return;
            }
            
            // Find the most recent acquisition
            const lastAcq = acquisitions[acquisitions.length - 1];
            
            // Try to get the last condition from the most recent acquisition
            const response2 = await fetch(`${API_BASE}/acquisitions/${lastAcq.id}`);
            if (!response2.ok) {
                state.currentCondition = null;
                return;
            }
            
            const acqData = await response2.json();
            
            // Check if there are conditions recorded
            if (acqData.conditions && acqData.conditions.length > 0) {
                const lastCondition = acqData.conditions[acqData.conditions.length - 1];
                const lastId = lastCondition.condition_id || '';
                if (lastId) {
                    state.currentConditionId = lastId;
                    state.currentCondition = lastCondition.condition || lastId;
                } else {
                    state.currentCondition = lastCondition.condition;
                    const resolvedId = resolveConditionIdByLabel(state.currentCondition);
                    if (resolvedId) {
                        state.currentConditionId = resolvedId;
                    }
                }
            } else {
                state.currentCondition = null; // No condition recorded
            }
            
            if (!state.currentConditionId && state.currentCondition) {
                const resolvedId = resolveConditionIdByLabel(state.currentCondition);
                if (resolvedId) {
                    state.currentConditionId = resolvedId;
                }
            }
            updateUI();
        } catch (error) {
            console.error('Load last condition error:', error);
            state.currentCondition = null; // No condition on error
            updateUI();
        }
    }
    let conditionsConfig = [];
    
    function resolveConditionLabelById(conditionId) {
        if (!conditionId) return '';
        const match = conditionsConfig.find(item => item.id === conditionId);
        return match ? match.label : '';
    }

    function resolveConditionIdByLabel(conditionLabel) {
        if (!conditionLabel) return '';
        const match = conditionsConfig.find(item => item.label === conditionLabel);
        return match ? match.id : '';
    }

    async function loadConditions() {
        try {
            const response = await fetch('/static/conditions.json');
            if (!response.ok) throw new Error('Failed to load conditions');
            
            const data = await response.json();
            conditionsConfig = data.conditions;

            if (state.currentConditionId) {
                const label = resolveConditionLabelById(state.currentConditionId);
                if (label) {
                    state.currentCondition = label;
                }
            } else if (state.currentCondition) {
                const id = resolveConditionIdByLabel(state.currentCondition);
                if (id) {
                    state.currentConditionId = id;
                }
            }
            
            // Render condition buttons in the modal
            elements.conditionsGrid.innerHTML = '';
            conditionsConfig.forEach(condition => {
                const btn = document.createElement('button');
                btn.className = 'condition-btn';
                btn.textContent = condition.label;
                btn.style.backgroundColor = condition.color;
                btn.dataset.conditionId = condition.id;
                btn.dataset.conditionLabel = condition.label;
                btn.onclick = () => selectCondition(condition.id, condition.label);
                elements.conditionsGrid.appendChild(btn);
            });
            updateConditionsLayout();
            updateConditionButtonSelection();
        } catch (error) {
            console.error('Load conditions error:', error);
        }
    }

    function updateConditionsLayout() {
        if (!elements.conditionsGrid) return;
        const isMobile = window.innerWidth <= 768;
        const isOdd = conditionsConfig.length % 2 === 1;
        const buttons = elements.conditionsGrid.querySelectorAll('.condition-btn');
        buttons.forEach(btn => btn.classList.remove('span-2'));

        if (isMobile && isOdd) {
            const lastBtn = Array.from(buttons).find(btn => btn.dataset.conditionId === 'last_condition_not_valid');
            if (lastBtn) {
                lastBtn.classList.add('span-2');
            }
        }
    }

    function updateConditionButtonSelection() {
        if (!elements.conditionsGrid) return;
        const buttons = elements.conditionsGrid.querySelectorAll('.condition-btn');
        buttons.forEach(btn => {
            const matchesLabel = btn.dataset.conditionLabel === state.currentCondition;
            const matchesId = btn.dataset.conditionId === state.currentConditionId;
            btn.classList.toggle('selected', matchesLabel || matchesId);
        });
    }
    
    // Open conditions modal
    function openConditionsModal() {
        elements.conditionsModal.classList.add('open');
        // Prevent scrolling on body when modal is open
        document.body.style.overflow = 'hidden';
    }
    
    // Close conditions modal
    function closeConditionsModal() {
        elements.conditionsModal.classList.remove('open');
        document.body.style.overflow = '';
    }
    
    // Show error dialog
    function showErrorDialog(message) {
        elements.errorDialogMessage.textContent = message;
        elements.errorDialog.style.display = 'flex';
    }
    
    // Close error dialog
    function closeErrorDialog() {
        elements.errorDialog.style.display = 'none';
    }
    
    // Handle error dialog ignore
    async function handleErrorIgnore() {
        closeErrorDialog();
        // Keep conditions modal open - don't close it
    }
    
    // Handle error dialog stop acquisition
    async function handleErrorStop() {
        closeErrorDialog();
        closeConditionsModal(); // Close conditions modal and return to control panel
        await stopAcquisition();
    }
    
    // Select a condition
    async function selectCondition(conditionId, conditionLabel) {
        try {
            if (conditionId === state.currentConditionId || conditionLabel === state.currentCondition) {
                return;
            }
            // Update local state immediately
            state.currentCondition = conditionLabel;
            state.currentConditionId = conditionId;
            updateUI();
            updateConditionButtonSelection();
            
            const response = await fetch(`${API_BASE}/save_condition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ condition: conditionLabel, condition_id: conditionId })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Show feedback but don't close modal
                showFeedback(`✓ Condition: ${conditionLabel}`, 'success');
            } else {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }
        } catch (error) {
            console.error('Select condition error:', error);
            showFeedback('✗ Cannot save condition. Check connection.', 'error');
        }
    }
    
    // Toggle eye-tracker connection
    async function toggleEyetracker() {
        const command = state.eyetrackerConnected ? 'pupil_neon_disconnect' : 'pupil_neon_connect';
        
        try {
            const response = await fetch(`${API_BASE}/eyetracker_command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status !== 'success') {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }
            // Don't update UI here - wait for backend message via setEyetrackerStatus()
        } catch (error) {
            console.error('Toggle eye-tracker error:', error);
            showFeedback('✗ Cannot toggle eye-tracker. Check connection.', 'error');
        }
    }
    
    // Update eye-tracker UI
    function updateEyetrackerUI() {
        if (state.eyetrackerConnected) {
            elements.eyetrackerBtn.textContent = 'Disconnect';
            elements.eyetrackerStatus.textContent = 'Connected';
            elements.eyetrackerStatus.style.color = '#10b981';
        } else {
            elements.eyetrackerBtn.textContent = 'Connect';
            elements.eyetrackerStatus.textContent = 'Disconnected';
            elements.eyetrackerStatus.style.color = '#64748b';
        }
    }
    
    // Event listeners
    elements.offsetBtn.addEventListener('click', setOffset);
    elements.toggleConfigBtn.addEventListener('click', toggleConfigPanel);
    elements.toggleCommentsBtn.addEventListener('click', toggleCommentsPanel);
    if (elements.toggleNodeStatusBtn) {
        elements.toggleNodeStatusBtn.addEventListener('click', toggleNodeStatusPanel);
    }
    elements.saveCommentBtn.addEventListener('click', saveComment);
    elements.conditionBtn.addEventListener('click', openConditionsModal);
    elements.closeConditionsBtn.addEventListener('click', closeConditionsModal);
    elements.eyetrackerBtn.addEventListener('click', toggleEyetracker);
    
    // Close modal when clicking outside the modal content
    elements.conditionsModal.addEventListener('click', (e) => {
        if (e.target === elements.conditionsModal) {
            closeConditionsModal();
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.conditionsModal.classList.contains('open')) {
            closeConditionsModal();
        }
    });
    
    elements.startBtn.addEventListener('click', startAcquisition);
    elements.stopBtn.addEventListener('click', stopAcquisition);
    elements.errorDialogIgnore.addEventListener('click', handleErrorIgnore);
    elements.errorDialogStop.addEventListener('click', handleErrorStop);
    
    // Initialize on page load
    checkStatus();
    loadLastTestConfig();
    loadConditions();
    configureStatusPanel();
    loadLastCondition();
    updateUI();
    console.log('🔄 Requesting health status on page load...');
    fetch(`${API_BASE}/health_status`, { method: 'POST' })
        .then(r => {
            console.log(`✅ Health status request sent (${r.status})`);
            return r.json();
        })
        .then(data => console.log('Health status response:', data))
        .catch(e => console.error('❌ Health status error:', e));
    checkNewStatusMessages();
    setInterval(checkNewStatusMessages, 2000);
    
    // Load and update status state periodically
    loadAndUpdateStatusState();
    setInterval(loadAndUpdateStatusState, 3000);
    
})();
