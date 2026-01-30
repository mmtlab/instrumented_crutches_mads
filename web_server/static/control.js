// Control page logic - plain JavaScript, no frameworks
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // Configuration - which side is the master (only change on restart)
    const masterSide = 'left';  // Can be 'left' or 'right' - requires restart to change
    
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
        currentCondition: document.getElementById('current-condition'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        feedback: document.getElementById('feedback'),
        offsetBtn: document.getElementById('offset-btn'),
        offsetLeft: document.getElementById('offset-left'),
        offsetRight: document.getElementById('offset-right'),
        offsetLeftIndicator: document.getElementById('offset-left-indicator'),
        offsetRightIndicator: document.getElementById('offset-right-indicator'),
        offsetTime: document.getElementById('offset-time'),
        offsetFeedbackContainer: document.getElementById('offset-feedback-container'),
        startStopFeedbackContainer: document.getElementById('start-stop-feedback-container'),
        patientName: document.getElementById('patient-name'),
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
        statusController: document.getElementById('status-controller'),
        statusControllerState: document.getElementById('status-controller-state'),
        statusHdf5: document.getElementById('status-hdf5'),
        statusHdf5State: document.getElementById('status-hdf5-state'),
        toggleNodeStatusBtn: document.getElementById('toggle-node-status-btn'),
        nodeStatusContent: document.getElementById('node-status-content'),
        conditionBtn: document.getElementById('condition-btn'),
        conditionsModal: document.getElementById('conditions-modal'),
        closeConditionsBtn: document.getElementById('close-conditions-btn'),
        conditionsGrid: document.getElementById('conditions-grid')
    };
    
    // Application state - add current condition
    state.currentCondition = 'walking'; // Default condition;
    
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

    function setServiceStatus(serviceName, status) {
        let indicator, stateLabel;
        
        if (serviceName === 'controller') {
            indicator = elements.statusController;
            stateLabel = elements.statusControllerState;
        } else if (serviceName === 'hdf5_writer') {
            indicator = elements.statusHdf5;
            stateLabel = elements.statusHdf5State;
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
    }

    function setTipStatus(side, status) {
        const isLeft = side === 'left';
        const indicator = isLeft ? elements.tipLeft : elements.tipRight;
        const stateLabel = isLeft ? elements.tipLeftState : elements.tipRightState;

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
    }

    function getCrutchSideFromMessage(msg) {
        const sideRaw = (msg.side || '').toString().toLowerCase();
        if (sideRaw === 'left' || sideRaw === 'right') return sideRaw;

        const sourceRaw = (msg.source || msg.name || msg.agent_id || msg.topic || '').toString().toLowerCase();
        if (sourceRaw.includes('loadcell_left')) return 'left';
        if (sourceRaw.includes('loadcell_right')) return 'right';
        return '';
    }

    function updateTipStatusFromMessage(msg) {
        const side = getCrutchSideFromMessage(msg);
        const level = (msg.level || '').toString().toLowerCase();
        const text = (msg.message || '').toString().trim().toLowerCase();
        const source = (msg.source || msg.name || msg.agent_id || msg.topic || '').toString();

        const isStartup = level === 'info' && text === 'startup';
        const isShutdown = level === 'critical' && (text === 'shutdown' || text.includes('shutdown') || text.includes('shutting down'));

        if (isStartup) {
            // Remove shutdown messages for this source (with or without side)
            removeShutdownMessagesForNode(source, side);
            // Update tip status only if we have a side (loadcell)
            if (side) {
                setTipStatus(side, 'live');
            }
            // Update master services status
            const sourceNorm = source.toLowerCase().replace(/\.plugin$/, '');
            if (sourceNorm === 'controller') {
                setServiceStatus('controller', 'live');
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'live');
            }
        } else if (isShutdown) {
            // Update tip status only if we have a side (loadcell)
            if (side) {
                setTipStatus(side, 'dead');
            }
            // Update master services status
            const sourceNorm = source.toLowerCase().replace(/\.plugin$/, '');
            if (sourceNorm === 'controller') {
                setServiceStatus('controller', 'dead');
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'dead');
            }
        }
    }
    
    // Update offset display values
    function updateOffsetDisplay(message) {
        // Parse message like: "Offset calibration: left=1.23, right=4.56, test_left=7.89, test_right=10.11"
        const testLeftMatch = message.match(/test_left=([\d.-]+)/);
        const testRightMatch = message.match(/test_right=([\d.-]+)/);
        
        const offsetClasses = ['offset-indicator-unknown', 'offset-indicator-ok', 'offset-indicator-warning'];
        
        // Only update left if test_left is present in the message
        if (testLeftMatch) {
            const value = parseFloat(testLeftMatch[1]);
            const absValue = Math.abs(value);
            elements.offsetLeft.textContent = value.toFixed(2);
            if (elements.offsetLeftIndicator) {
                elements.offsetLeftIndicator.classList.remove(...offsetClasses);
                elements.offsetLeftIndicator.classList.add(absValue > 10 ? 'offset-indicator-warning' : 'offset-indicator-ok');
            }
        }
        
        // Only update right if test_right is present in the message
        if (testRightMatch) {
            const value = parseFloat(testRightMatch[1]);
            const absValue = Math.abs(value);
            elements.offsetRight.textContent = value.toFixed(2);
            if (elements.offsetRightIndicator) {
                elements.offsetRightIndicator.classList.remove(...offsetClasses);
                elements.offsetRightIndicator.classList.add(absValue > 10 ? 'offset-indicator-warning' : 'offset-indicator-ok');
            }
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
                patient: elements.patientName.value || null,
                height_cm: elements.heightCm.value ? parseInt(elements.heightCm.value) : null,
                weight_kg: elements.weightKg.value ? parseFloat(elements.weightKg.value) : null,
                crutch_height: elements.crutchHeight.value ? parseInt(elements.crutchHeight.value) : null
            };
            
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
                if (testConfig.patient) elements.patientName.value = testConfig.patient;
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

    let lastStatusCount = 0;
    
    async function checkNewStatusMessages() {
        try {
            const response = await fetch(`${API_BASE}/status`);
            if (!response.ok) return;
            const data = await response.json();
            const messages = data.messages || [];
            
            console.log(`📥 Received ${messages.length} messages from /status (lastStatusCount: ${lastStatusCount})`);
            
            // Show only new messages as feedback
            if (messages.length > lastStatusCount) {
                const newMessages = messages.slice(lastStatusCount);
                console.log(`📨 Showing ${newMessages.length} new messages:`, newMessages);
                newMessages.forEach(msg => {
                    const level = (msg.level || 'info').toString().toLowerCase();
                    const source = msg.source || msg.name || 'system';
                    const side = msg.side ? ` (${msg.side})` : '';
                    const text = msg.message || msg.error || msg.detail || 'Status update';
                    const messageText = `${source}${side}: ${text}`;

                    updateTipStatusFromMessage(msg);
                    
                    // Map level to feedback type
                    let feedbackType = 'info';
                    if (level === 'error' || level === 'fatal' || level === 'critical') {
                        feedbackType = 'error';
                    } else if (level === 'warning') {
                        feedbackType = 'warning';
                    }
                    
                    console.log(`✉️ Processing message: ${messageText} [${feedbackType}]`);
                    
                    // Check if this is an offset calibration message
                    const isOffsetCalibration = text?.toLowerCase().includes('offset calibration');
                    if (isOffsetCalibration) {
                        updateOffsetDisplay(text);
                        // Don't show the message as feedback, only update the display
                        return;
                    }
                    
                    // Determine routing: set_offset errors go to offset section, others to start/stop section
                    const isOffsetRelated = source?.toLowerCase().includes('set_offset') || 
                                           text?.toLowerCase().includes('set_offset') ||
                                           text?.toLowerCase().includes('calibrat');
                    
                    if (feedbackType === 'error' || feedbackType === 'warning') {
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
            lastStatusCount = messages.length;
        } catch (error) {
            console.error('Check status error:', error);
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
                state.currentCondition = 'walking'; // Default
                return;
            }
            
            // Find the most recent acquisition
            const lastAcq = acquisitions[acquisitions.length - 1];
            
            // Try to get the last condition from the most recent acquisition
            const response2 = await fetch(`${API_BASE}/acquisitions/${lastAcq.id}`);
            if (!response2.ok) {
                state.currentCondition = 'walking';
                return;
            }
            
            const acqData = await response2.json();
            
            // Check if there are conditions recorded
            if (acqData.conditions && acqData.conditions.length > 0) {
                const lastCondition = acqData.conditions[acqData.conditions.length - 1];
                state.currentCondition = lastCondition.condition;
            } else {
                state.currentCondition = 'walking'; // Default
            }
            
            updateUI();
        } catch (error) {
            console.error('Load last condition error:', error);
            state.currentCondition = 'walking'; // Default
            updateUI();
        }
    }
    let conditionsConfig = [];
    
    async function loadConditions() {
        try {
            const response = await fetch('/static/conditions.json');
            if (!response.ok) throw new Error('Failed to load conditions');
            
            const data = await response.json();
            conditionsConfig = data.conditions;
            
            // Render condition buttons in the modal
            elements.conditionsGrid.innerHTML = '';
            conditionsConfig.forEach(condition => {
                const btn = document.createElement('button');
                btn.className = 'condition-btn';
                btn.textContent = condition.label;
                btn.style.backgroundColor = condition.color;
                btn.onclick = () => selectCondition(condition.id, condition.label);
                elements.conditionsGrid.appendChild(btn);
            });
        } catch (error) {
            console.error('Load conditions error:', error);
        }
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
    
    // Select a condition
    async function selectCondition(conditionId, conditionLabel) {
        try {
            // Update local state immediately
            state.currentCondition = conditionLabel;
            updateUI();
            
            const response = await fetch(`${API_BASE}/save_condition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ condition: conditionLabel })
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
    
    // Initialize on page load
    checkStatus();
    loadLastTestConfig();
    loadConditions();
    loadLastCondition();
    updateUI();
    checkNewStatusMessages();
    setInterval(checkNewStatusMessages, 2000);
    
})();
