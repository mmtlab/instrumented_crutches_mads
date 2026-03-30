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
        currentConditionId: null,
        datetimeHealthStatusTimeoutId: null
    };

    const HANDLE_OFFSET_GROUPS = [
        { key: 'up', label: 'UP', frontKey: 'up_front', backKey: 'up_back' },
        { key: 'right', label: 'RIGHT', frontKey: 'right_front', backKey: 'right_back' },
        { key: 'down', label: 'DOWN', frontKey: 'down_front', backKey: 'down_back' },
        { key: 'left', label: 'LEFT', frontKey: 'left_front', backKey: 'left_back' }
    ];
    const HANDLE_OFFSET_ORDER = HANDLE_OFFSET_GROUPS.flatMap((group) => [group.frontKey, group.backKey]);
    const offsetClasses = ['offset-indicator-unknown', 'offset-indicator-ok', 'offset-indicator-warning'];
    const handleOffsetItemClasses = ['calibration-handle-item-unknown', 'calibration-handle-item-ok', 'calibration-handle-item-warning'];
    const handleOffsetCells = {
        left: {},
        right: {}
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
        offsetLeftTip: document.getElementById('offset-left-tip'),
        offsetRightTip: document.getElementById('offset-right-tip'),
        errorDialog: document.getElementById('error-dialog'),
        errorDialogMessage: document.getElementById('error-dialog-message'),
        errorDialogIgnore: document.getElementById('error-dialog-ignore'),
        errorDialogStop: document.getElementById('error-dialog-stop'),
        offsetLeftTipIndicator: document.getElementById('offset-left-tip-indicator'),
        offsetRightTipIndicator: document.getElementById('offset-right-tip-indicator'),
        offsetLeftHandleGrid: document.getElementById('offset-left-handle-grid'),
        offsetRightHandleGrid: document.getElementById('offset-right-handle-grid'),
        calibrationLeftTitle: document.getElementById('calibration-left-title'),
        calibrationRightTitle: document.getElementById('calibration-right-title'),
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
        handleLeft: document.getElementById('handle-left'),
        handleRight: document.getElementById('handle-right'),
        ppgLeft: document.getElementById('ppg-left'),
        ppgRight: document.getElementById('ppg-right'),
        tipLeftState: document.getElementById('tip-left-state'),
        tipRightState: document.getElementById('tip-right-state'),
        handleLeftState: document.getElementById('handle-left-state'),
        handleRightState: document.getElementById('handle-right-state'),
        ppgLeftState: document.getElementById('ppg-left-state'),
        ppgRightState: document.getElementById('ppg-right-state'),
        tipLeftValue: document.getElementById('tip-left-value'),
        tipRightValue: document.getElementById('tip-right-value'),
        handleLeftValue: document.getElementById('handle-left-value'),
        handleRightValue: document.getElementById('handle-right-value'),
        ppgLeftValue: document.getElementById('ppg-left-value'),
        ppgRightValue: document.getElementById('ppg-right-value'),
        batteryLeft: document.getElementById('battery-left'),
        batteryRight: document.getElementById('battery-right'),
        batteryLeftValue: document.getElementById('battery-left-value'),
        batteryRightValue: document.getElementById('battery-right-value'),
        batteryLeftFill: document.getElementById('battery-left-fill'),
        batteryRightFill: document.getElementById('battery-right-fill'),
        batteryLeftEta: document.getElementById('battery-left-eta'),
        batteryRightEta: document.getElementById('battery-right-eta'),
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
        toggleCalibrationBtn: document.getElementById('toggle-calibration-btn'),
        datetimeUpdateBtn: document.getElementById('datetime-update-btn'),
        coordinatorLastUpdate: document.getElementById('coordinator-last-update'),
        nodeStatusContent: document.getElementById('node-status-content'),
        calibrationContent: document.getElementById('calibration-content'),
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

    function deriveIndicatorStatus(statusValue) {
        const status = (statusValue || '').toString().trim().toLowerCase();

        if (status === 'startup') return 'live';
        if (status === 'idle') return 'live';
        if (status === 'recording') return 'live';
        if (status === 'connected') return 'live';
        if (status === 'shutdown') return 'dead';
        if (status === 'unreachable') return 'dead';

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
            valueLabel.textContent = 'ready';
            valueLabel.classList.add('node-status-value-ready');
            return;
        }

        if (normalized === 'unreachable') {
            valueLabel.textContent = 'unreachable';
            valueLabel.classList.add('node-status-value-attn');
            return;
        }

        if (normalized === 'recording') {
            valueLabel.textContent = 'recording';
            valueLabel.classList.add('node-status-value-recording');
            return;
        }

        valueLabel.textContent = statusValue;
    }

    function formatStatusTimestamp(timestampRaw) {
        if (!timestampRaw) return '—';
        const parsed = new Date(timestampRaw);
        if (Number.isNaN(parsed.getTime())) {
            return String(timestampRaw);
        }
        return parsed.toLocaleString();
    }

    function updateCoordinatorLastUpdate(timestampRaw) {
        if (!elements.coordinatorLastUpdate) return;
        elements.coordinatorLastUpdate.textContent = formatStatusTimestamp(timestampRaw);
    }

    function buildHandleOffsetGrid(side) {
        const grid = side === 'left' ? elements.offsetLeftHandleGrid : elements.offsetRightHandleGrid;
        if (!grid) return;

        grid.innerHTML = '';
        handleOffsetCells[side] = {};

        HANDLE_OFFSET_GROUPS.forEach((group) => {
            const item = document.createElement('div');
            item.className = 'calibration-handle-item calibration-handle-item-unknown';

            const title = document.createElement('span');
            title.className = 'calibration-handle-item-label';
            title.textContent = group.label;

            const valueWrap = document.createElement('span');
            valueWrap.className = 'calibration-handle-item-value';

            const valueText = document.createElement('span');
            valueText.className = 'calibration-handle-item-value-text';
            valueText.textContent = 'NA / NA';

            const unit = document.createElement('span');
            unit.className = 'calibration-handle-item-unit';
            unit.textContent = 'N';

            valueWrap.appendChild(valueText);
            valueWrap.appendChild(unit);
            item.appendChild(title);
            item.appendChild(valueWrap);
            grid.appendChild(item);

            handleOffsetCells[side][group.key] = { item, valueText };
        });
    }

    function configureCalibrationPanel() {
        const isMasterLeft = masterSide === 'left';
        if (elements.calibrationLeftTitle) {
            elements.calibrationLeftTitle.textContent = `Left Crutch (${isMasterLeft ? 'Master' : 'Slave'})`;
        }
        if (elements.calibrationRightTitle) {
            elements.calibrationRightTitle.textContent = `Right Crutch (${isMasterLeft ? 'Slave' : 'Master'})`;
        }
    }

    function updateOffsetTimestamp(timestamp) {
        if (!elements.offsetTime) return;
        const parsed = timestamp ? new Date(timestamp) : null;
        const value = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
        elements.offsetTime.textContent = value.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function parseOffsetNumberList(valuesText) {
        return valuesText
            .split(',')
            .map((value) => Number.parseFloat(value.trim()));
    }

    function setTipOffsetValue(side, value) {
        const valueLabel = side === 'left' ? elements.offsetLeftTip : elements.offsetRightTip;
        const indicator = side === 'left' ? elements.offsetLeftTipIndicator : elements.offsetRightTipIndicator;
        if (!valueLabel || !indicator || !Number.isFinite(value)) return;

        valueLabel.textContent = value.toFixed(1);
        indicator.classList.remove(...offsetClasses);
        indicator.classList.add(Math.abs(value) > 10 ? 'offset-indicator-warning' : 'offset-indicator-ok');
    }

    function setHandleOffsetValue(side, groupKey, frontValue, backValue) {
        const cell = handleOffsetCells[side] ? handleOffsetCells[side][groupKey] : null;
        if (!cell) return;

        const frontText = Number.isFinite(frontValue) ? frontValue.toFixed(1) : 'NA';
        const backText = Number.isFinite(backValue) ? backValue.toFixed(1) : 'NA';
        cell.valueText.textContent = `${frontText} / ${backText}`;

        const hasAnyValue = Number.isFinite(frontValue) || Number.isFinite(backValue);
        const maxAbs = Math.max(
            Number.isFinite(frontValue) ? Math.abs(frontValue) : 0,
            Number.isFinite(backValue) ? Math.abs(backValue) : 0
        );
        cell.item.classList.remove(...handleOffsetItemClasses);
        if (!hasAnyValue) {
            cell.item.classList.add('calibration-handle-item-unknown');
        } else {
            cell.item.classList.add(maxAbs > 10 ? 'calibration-handle-item-warning' : 'calibration-handle-item-ok');
        }
    }

    function isOffsetFeedbackMessage(message) {
        const text = (message || '').toString();
        return /offset\s*test\s*:/i.test(text);
    }

    function setBatteryStatus(side, batteryInfo) {
        const isLeft = side === 'left';
        const container = isLeft ? elements.batteryLeft : elements.batteryRight;
        const valueLabel = isLeft ? elements.batteryLeftValue : elements.batteryRightValue;
        const fill = isLeft ? elements.batteryLeftFill : elements.batteryRightFill;
        const eta = isLeft ? elements.batteryLeftEta : elements.batteryRightEta;

        if (!container || !valueLabel || !fill || !eta) return;

        // Check if battery is charging
        const isCharging = batteryInfo && batteryInfo.charging === true;
        const hasPercent = batteryInfo && Number.isFinite(Number(batteryInfo.percent));
        const percent = hasPercent ? Math.max(0, Math.min(100, Number(batteryInfo.percent))) : null;
        const remaining = batteryInfo && batteryInfo.remaining_battery_time ? String(batteryInfo.remaining_battery_time) : '--:--';

        if (isCharging) {
            // Show charging state
            valueLabel.textContent = '⚡';
            fill.style.width = '100%';
            eta.textContent = 'Charging';
            container.classList.remove('battery-status-low', 'battery-status-mid', 'battery-status-high');
            container.classList.add('battery-status-high');
            return;
        }

        if (percent === null) {
            // Show unknown state
            valueLabel.textContent = '--.-%';
            fill.style.width = '0%';
            eta.textContent = 'ETA --:--';
            container.classList.remove('battery-status-low', 'battery-status-mid', 'battery-status-high');
            return;
        }
        
        // Normal state with valid percent
        valueLabel.textContent = `${percent.toFixed(1)}%`;
        fill.style.width = `${percent.toFixed(1)}%`;
        eta.textContent = `ETA ${remaining}`;

        container.classList.remove('battery-status-low', 'battery-status-mid', 'battery-status-high');
        if (percent < 25) {
            container.classList.add('battery-status-low');
        } else if (percent < 55) {
            container.classList.add('battery-status-mid');
        } else {
            container.classList.add('battery-status-high');
        }
    }

    async function requestHealthStatus(reason = '') {
        try {
            const response = await fetch(`${API_BASE}/health_status`, { method: 'POST' });
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            const data = await response.json();
            console.log(`✅ Health status requested${reason ? ` (${reason})` : ''}:`, data);
            await loadAndUpdateStatusState();
            await checkNewStatusMessages();
            return data;
        } catch (error) {
            console.error(`❌ Health status request failed${reason ? ` (${reason})` : ''}:`, error);
            return null;
        }
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

    function setHandleStatus(side, status, statusValue) {
        const isLeft = side === 'left';
        const indicator = isLeft ? elements.handleLeft : elements.handleRight;
        const stateLabel = isLeft ? elements.handleLeftState : elements.handleRightState;
        const valueLabel = isLeft ? elements.handleLeftValue : elements.handleRightValue;

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
        
        // Update Status panel
        indicator.classList.remove(...eyetrackerStatusClasses);
        if (isConnected) {
            indicator.classList.add('node-status-connected');
            stateLabel.textContent = 'Connected';;
        } else {
            indicator.classList.add('node-status-disconnected');
            stateLabel.textContent = 'Disconnected';
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
        return getCrutchSideFromSource(sourceRaw);
    }

    function getCrutchSideFromSource(sourceRaw) {
        const sourceValue = (sourceRaw || '').toString().toLowerCase();
        if (sourceValue.includes('tip_loadcell_left')) return 'left';
        if (sourceValue.includes('tip_loadcell_right')) return 'right';
        if (sourceValue.includes('handle_loadcell_left')) return 'left';
        if (sourceValue.includes('handle_loadcell_right')) return 'right';
        if (sourceValue.includes('ppg_left')) return 'left';
        if (sourceValue.includes('ppg_right')) return 'right';
        return '';
    }

    function setPpgStatus(side, status, statusValue) {
        const isLeft = side === 'left';
        const indicator = isLeft ? elements.ppgLeft : elements.ppgRight;
        const stateLabel = isLeft ? elements.ppgLeftState : elements.ppgRightState;
        const valueLabel = isLeft ? elements.ppgLeftValue : elements.ppgRightValue;

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

        applyStatusValue(valueLabel, statusValue);
    }

    function updateSensorStatusFromMessage(msg) {
        const level = (msg.level || '').toString().toLowerCase();
        const text = (msg.message || '').toString().trim().toLowerCase();
        const source = (msg.source || msg.name || msg.agent_id || msg.topic || '').toString();
        const sourceNorm = source.toLowerCase().replace(/\.plugin$/, '');
        const statusValue = (msg.status || '').toString();  // New status field from message
        const isTipSource = sourceNorm.startsWith('tip_loadcell') || sourceNorm === 'loadcell' || sourceNorm.startsWith('loadcell_');
        const isHandleSource = sourceNorm.startsWith('handle_loadcell');
        const isPpgSource = sourceNorm === 'ppg' || sourceNorm.startsWith('ppg_');

        if (sourceNorm === 'coordinator') {
            updateCoordinatorLastUpdate(msg.timestamp || msg.timecode || '');
        }

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
            if (isTipSource && side) {
                setTipStatus(side, 'live', statusValue);
            }
            if (isHandleSource && side) {
                setHandleStatus(side, 'live', statusValue);
            }
            if (isPpgSource && side) {
                setPpgStatus(side, 'live', statusValue);
            }
            // Update master services status
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', 'live', statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'live', statusValue);
            }
        } else if (isShutdown) {
            // Update tip status only if we have a side (loadcell)
            if (isTipSource && side) {
                setTipStatus(side, 'dead', statusValue);
            }
            if (isHandleSource && side) {
                setHandleStatus(side, 'dead', statusValue);
            }
            if (isPpgSource && side) {
                setPpgStatus(side, 'dead', statusValue);
            }
            // Update master services status
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', 'dead', statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', 'dead', statusValue);
            }
        } else if (statusValue) {
            const derivedStatus = deriveIndicatorStatus(statusValue);
            if (isTipSource && side) {
                setTipStatus(side, derivedStatus, statusValue);
            }
            if (isHandleSource && side) {
                setHandleStatus(side, derivedStatus, statusValue);
            }
            if (isPpgSource && side) {
                setPpgStatus(side, derivedStatus, statusValue);
            }
            if (sourceNorm === 'coordinator') {
                setServiceStatus('coordinator', derivedStatus, statusValue);
            } else if (sourceNorm === 'hdf5_writer') {
                setServiceStatus('hdf5_writer', derivedStatus, statusValue);
            }
        }
    }
    
    // Update offset display values
    function updateOffsetDisplay(message, source, side, timestamp) {
        const text = (message || '').toString();
        const sourceNorm = (source || '').toString().toLowerCase().replace(/\.plugin$/, '');
        const targetSide = (side || getCrutchSideFromSource(sourceNorm) || '').toLowerCase();

        if (targetSide !== 'left' && targetSide !== 'right') return;

        const handleTestMatch = text.match(/offset\s*test\s*:\s*\[([^\]]+)\]\s*N/i);
        if (sourceNorm.startsWith('handle_loadcell') || handleTestMatch) {
            if (!handleTestMatch) return;
            const handleValues = parseOffsetNumberList(handleTestMatch[1]);
            const valuesByLabel = {};
            HANDLE_OFFSET_ORDER.forEach((label, index) => {
                valuesByLabel[label] = handleValues[index];
            });
            HANDLE_OFFSET_GROUPS.forEach((group) => {
                setHandleOffsetValue(
                    targetSide,
                    group.key,
                    valuesByLabel[group.frontKey],
                    valuesByLabel[group.backKey]
                );
            });
            updateOffsetTimestamp(timestamp);
            return;
        }

        const testMatch = text.match(/offset\s*test\s*:\s*([-\d.]+)\s*N/i);
        const valueMatch = text.match(/offset\s*value\s*:\s*([-\d.]+)\s*N/i);
        const value = testMatch ? Number.parseFloat(testMatch[1]) : (valueMatch ? Number.parseFloat(valueMatch[1]) : null);

        if (!Number.isFinite(value)) return;
        setTipOffsetValue(targetSide, value);
        updateOffsetTimestamp(timestamp);
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
            } else {
                // Reload offset values immediately after successful calibrate
                // Give backend a small delay to process and update sensors
                setTimeout(() => {
                    loadAndUpdateStatusState();
                }, 500);
            }
        } catch (error) {
            console.error('Set offset error:', error);
            showFeedback('✗ Cannot set offset. Check connection.', 'error');
        }
    }

    async function sendDatetimeUpdate() {
        try {
            const clientDatetime = formatClientDatetimeForRaspi();
            const response = await fetch(`${API_BASE}/datetime_update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    datetime_to_set: clientDatetime
                })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                showFeedback(`✓ Datetime updated (${clientDatetime})`, 'success');
            } else {
                showFeedback(`⚠ ${data.message}`, 'warning');
            }

            if (state.datetimeHealthStatusTimeoutId) {
                clearTimeout(state.datetimeHealthStatusTimeoutId);
            }
            state.datetimeHealthStatusTimeoutId = setTimeout(() => {
                requestHealthStatus('3s after datetime update button').finally(() => {
                    state.datetimeHealthStatusTimeoutId = null;
                });
            }, 3000);
        } catch (error) {
            console.error('Datetime update error:', error);
            showFeedback('✗ Cannot update datetime. Check connection.', 'error');
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

    function toggleCalibrationPanel() {
        if (!elements.calibrationContent || !elements.toggleCalibrationBtn) return;
        elements.calibrationContent.classList.toggle('collapsed');
        elements.toggleCalibrationBtn.classList.toggle('collapsed');
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
        const handleNode = masterCard.querySelector('[id*="handle-"]');

        const coordinatorItem = coordinatorNode ? coordinatorNode.closest('.node-status-item') : null;
        const loggerItem = loggerNode ? loggerNode.closest('.node-status-item') : null;
        const eyetrackerItem = eyetrackerNode ? eyetrackerNode.closest('.node-status-item') : null;
        const separator = leftCard.querySelector('.node-status-separator');
        const tipItem = tipNode ? tipNode.closest('.node-status-item') : null;
        const handleItem = handleNode ? handleNode.closest('.node-status-item') : null;
        const sensorAnchor = handleItem || tipItem;
        
        if (coordinatorItem && loggerItem && eyetrackerItem && separator && sensorAnchor) {
            // Remove from their current location
            coordinatorItem.remove();
            loggerItem.remove();
            eyetrackerItem.remove();
            separator.remove();
            
            // Insert into master card maintaining order: Coordinator, Logger, Eye-tracker, Separator, Handle/Tip block
            sensorAnchor.parentNode.insertBefore(coordinatorItem, sensorAnchor);
            coordinatorItem.parentNode.insertBefore(loggerItem, sensorAnchor);
            loggerItem.parentNode.insertBefore(eyetrackerItem, sensorAnchor);
            eyetrackerItem.parentNode.insertBefore(separator, sensorAnchor);
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
            
            // Show only new messages as feedback
            if (totalCount > lastStatusCount) {
                const newMessages = messages.slice(Math.max(0, lastStatusCount - (totalCount - messages.length)));
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
                    
                    // Check if this is an offset message
                    const isOffsetMessage = isOffsetFeedbackMessage(text);
                    if (isOffsetMessage) {
                        updateOffsetDisplay(text, source, msg.side || msg.topic, msg.timestamp || msg.timecode || '');
                        // Don't show the message as feedback, only update the display
                        return;
                    }
                    
                    // Determine routing: set_offset errors go to offset section, others to start/stop section
                    const isOffsetRelated = isOffsetMessage ||
                                           source?.toLowerCase().includes('set_offset') || 
                                           text?.toLowerCase().includes('set_offset') ||
                                           text?.toLowerCase().includes('calibrat');
                    
                    if (feedbackType === 'error') {
                        // Check if conditions modal is open and this is a critical error
                        const isConditionsModalOpen = elements.conditionsModal.classList.contains('open');
                        const isCriticalError = (level === 'error' || level === 'critical' || level === 'fatal');
                        
                        if (isConditionsModalOpen && isCriticalError) {
                            // Show error dialog instead of persistent message
                            showErrorDialog(messageText);
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
                    } else if (feedbackType === 'warning') {
                        // Transient message (auto-close)
                        showFeedback(messageText, feedbackType);
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

            setBatteryStatus('left', statusState.battery_left);
            setBatteryStatus('right', statusState.battery_right);

            // Update each component's status indicator and value
            if (statusState.coordinator) {
                const {message, status: statusValue, timestamp} = statusState.coordinator;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setServiceStatus('coordinator', sensorStatus, statusValue);
                updateCoordinatorLastUpdate(timestamp);
            }

            if (statusState.hdf5_writer) {
                const {message, status: statusValue} = statusState.hdf5_writer;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setServiceStatus('hdf5_writer', sensorStatus, statusValue);
            }

            if (statusState.tip_loadcell_left) {
                const {message, status: statusValue} = statusState.tip_loadcell_left;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setTipStatus('left', sensorStatus, statusValue);
                const displayMessage = isOffsetFeedbackMessage(message) ? message : (statusState.tip_loadcell_left.last_offset_message || '');
                const displayTimestamp = isOffsetFeedbackMessage(message)
                    ? (statusState.tip_loadcell_left.timestamp || '')
                    : (statusState.tip_loadcell_left.last_offset_timestamp || '');
                if (displayMessage) {
                    updateOffsetDisplay(displayMessage, statusState.tip_loadcell_left.source, statusState.tip_loadcell_left.side, displayTimestamp);
                }
            }

            if (statusState.handle_loadcell_left) {
                const {message, status: statusValue} = statusState.handle_loadcell_left;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setHandleStatus('left', sensorStatus, statusValue);
                const displayMessage = isOffsetFeedbackMessage(message) ? message : (statusState.handle_loadcell_left.last_offset_message || '');
                const displayTimestamp = isOffsetFeedbackMessage(message)
                    ? (statusState.handle_loadcell_left.timestamp || '')
                    : (statusState.handle_loadcell_left.last_offset_timestamp || '');
                if (displayMessage) {
                    updateOffsetDisplay(displayMessage, statusState.handle_loadcell_left.source, statusState.handle_loadcell_left.side, displayTimestamp);
                }
            }

            if (statusState.tip_loadcell_right) {
                const {message, status: statusValue} = statusState.tip_loadcell_right;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setTipStatus('right', sensorStatus, statusValue);
                const displayMessage = isOffsetFeedbackMessage(message) ? message : (statusState.tip_loadcell_right.last_offset_message || '');
                const displayTimestamp = isOffsetFeedbackMessage(message)
                    ? (statusState.tip_loadcell_right.timestamp || '')
                    : (statusState.tip_loadcell_right.last_offset_timestamp || '');
                if (displayMessage) {
                    updateOffsetDisplay(displayMessage, statusState.tip_loadcell_right.source, statusState.tip_loadcell_right.side, displayTimestamp);
                }
            }

            if (statusState.handle_loadcell_right) {
                const {message, status: statusValue} = statusState.handle_loadcell_right;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setHandleStatus('right', sensorStatus, statusValue);
                const displayMessage = isOffsetFeedbackMessage(message) ? message : (statusState.handle_loadcell_right.last_offset_message || '');
                const displayTimestamp = isOffsetFeedbackMessage(message)
                    ? (statusState.handle_loadcell_right.timestamp || '')
                    : (statusState.handle_loadcell_right.last_offset_timestamp || '');
                if (displayMessage) {
                    updateOffsetDisplay(displayMessage, statusState.handle_loadcell_right.source, statusState.handle_loadcell_right.side, displayTimestamp);
                }
            }

            if (statusState.ppg_left) {
                const {status: statusValue} = statusState.ppg_left;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setPpgStatus('left', sensorStatus, statusValue);
            }

            if (statusState.ppg_right) {
                const {status: statusValue} = statusState.ppg_right;
                const sensorStatus = deriveIndicatorStatus(statusValue);
                setPpgStatus('right', sensorStatus, statusValue);
            }

            if (statusState.eye_tracker) {
                const {status: statusValue, source} = statusState.eye_tracker;
                const isConnected = statusValue.toLowerCase() !== 'idle' && statusValue.toLowerCase() !== 'unreachable';
                const isPupilNeon = (source || '').toString().toLowerCase().includes('pupil_neon');
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
    if (elements.toggleCalibrationBtn) {
        elements.toggleCalibrationBtn.addEventListener('click', toggleCalibrationPanel);
    }
    if (elements.datetimeUpdateBtn) {
        elements.datetimeUpdateBtn.addEventListener('click', sendDatetimeUpdate);
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

    function formatClientDatetimeForRaspi(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day} ${hours}:${minutes}:${seconds}`;
    }
    
    // Initialize on page load
    checkStatus();
    loadLastTestConfig();
    loadConditions();
    buildHandleOffsetGrid('left');
    buildHandleOffsetGrid('right');
    configureCalibrationPanel();
    configureStatusPanel();
    loadLastCondition();
    updateUI();
    console.log('🔄 Requesting health status on page load...');
    requestHealthStatus('on page load');
    checkNewStatusMessages();
    setInterval(checkNewStatusMessages, 2000);
    
    // Load and update status state periodically
    loadAndUpdateStatusState();
    setInterval(loadAndUpdateStatusState, 3000);
    
})();
