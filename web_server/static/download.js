// Download page - select and download acquisition data

const elements = {
    feedback: document.getElementById('feedback'),
    acquisitionList: document.getElementById('acquisition-list'),
    selectedCount: document.getElementById('selected-count'),
    downloadSelectedBtn: document.getElementById('download-selected-btn'),
    clearSelectedBtn: document.getElementById('clear-selected-btn')
};

let allCompletedAcquisitions = [];

// Show feedback message
function showFeedback(message, type = 'info') {
    elements.feedback.textContent = message;
    elements.feedback.className = `feedback feedback-${type}`;
    elements.feedback.style.display = 'block';
    setTimeout(() => {
        elements.feedback.style.display = 'none';
    }, 5000);
}

// Format date/time for display
function formatDateTime(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function isNumeric(value) {
    return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function compareKeys(a, b) {
    const aIsNum = isNumeric(a);
    const bIsNum = isNumeric(b);
    if (aIsNum && bIsNum) {
        return Number(a) - Number(b);
    }
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return String(a).localeCompare(String(b), 'it-IT', { numeric: true, sensitivity: 'base' });
}

function getSubjectIds(subjectsData) {
    return Object.keys(subjectsData || {})
        .map(String)
        .sort((a, b) => Number(a) - Number(b));
}

function getAcqSortValue(acqId) {
    if (!acqId) return Number.MAX_SAFE_INTEGER;
    const match = String(acqId).match(/(\d+)/g);
    if (!match || match.length === 0) return Number.MAX_SAFE_INTEGER;
    return Number(match[match.length - 1]);
}

function getSelectedAcqIds() {
    const checked = elements.acquisitionList.querySelectorAll('.acq-checkbox:checked');
    return Array.from(checked).map((checkbox) => checkbox.dataset.acqId);
}

function updateSelectedCount() {
    const selected = getSelectedAcqIds();
    elements.selectedCount.textContent = String(selected.length);
    elements.downloadSelectedBtn.disabled = selected.length === 0;
    elements.clearSelectedBtn.disabled = selected.length === 0;
}

function updateSessionState(sessionNode) {
    const sessionCheckbox = sessionNode.querySelector('.session-checkbox');
    const acqCheckboxes = sessionNode.querySelectorAll('.acq-checkbox');
    const total = acqCheckboxes.length;
    const checked = sessionNode.querySelectorAll('.acq-checkbox:checked').length;
    const allChecked = total > 0 && checked === total;
    const noneChecked = checked === 0;
    sessionCheckbox.checked = allChecked;
    sessionCheckbox.indeterminate = !allChecked && !noneChecked;
}

function updateSubjectState(subjectNode) {
    const subjectCheckbox = subjectNode.querySelector('.subject-checkbox');
    const acqCheckboxes = subjectNode.querySelectorAll('.acq-checkbox');
    const total = acqCheckboxes.length;
    const checked = subjectNode.querySelectorAll('.acq-checkbox:checked').length;
    const allChecked = total > 0 && checked === total;
    const noneChecked = checked === 0;
    subjectCheckbox.checked = allChecked;
    subjectCheckbox.indeterminate = !allChecked && !noneChecked;
}

function updateAllCheckboxStates() {
    const sessionNodes = elements.acquisitionList.querySelectorAll('.tree-session');
    sessionNodes.forEach((sessionNode) => updateSessionState(sessionNode));
    const subjectNodes = elements.acquisitionList.querySelectorAll('.tree-subject');
    subjectNodes.forEach((subjectNode) => updateSubjectState(subjectNode));
}

// Load acquisition list
async function loadAcquisitionList() {
    try {
        const [acqResponse, subjectResponse] = await Promise.all([
            fetch('/acquisitions'),
            fetch('/subjects')
        ]);
        const data = await acqResponse.json();
        const subjectsData = await subjectResponse.json();
        
        if (!data.acquisitions || data.acquisitions.length === 0) {
            elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No acquisitions available</p>';
            updateSelectedCount();
            return;
        }
        
        // Filter only completed acquisitions
        const completed = data.acquisitions.filter(acq => acq.status === 'completed');
        
        if (completed.length === 0) {
            elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No completed acquisitions available</p>';
            updateSelectedCount();
            return;
        }
        
        allCompletedAcquisitions = completed;
        const subjectIds = getSubjectIds(subjectsData.subjects);
        if (subjectIds.length === 0) {
            elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No subjects found. Record data with a subject ID first.</p>';
            updateSelectedCount();
            return;
        }

        renderAcquisitionTree(completed, subjectIds);
        updateAllCheckboxStates();
        updateSelectedCount();
        
    } catch (error) {
        console.error('Failed to load acquisitions:', error);
        showFeedback('Failed to load acquisition list', 'error');
    }
}

function renderAcquisitionTree(acquisitions, subjectIds) {
    const subjects = new Map();

    acquisitions.forEach((acq) => {
        const subjectKey = acq.test_config && acq.test_config.subject_id !== undefined && acq.test_config.subject_id !== null
            ? String(acq.test_config.subject_id)
            : null;
        if (!subjectKey) {
            return;
        }
        const sessionKey = acq.test_config && acq.test_config.session_id !== undefined && acq.test_config.session_id !== null
            ? String(acq.test_config.session_id)
            : 'Unknown';

        if (!subjects.has(subjectKey)) {
            subjects.set(subjectKey, new Map());
        }
        const sessions = subjects.get(subjectKey);
        if (!sessions.has(sessionKey)) {
            sessions.set(sessionKey, []);
        }
        sessions.get(sessionKey).push(acq);
    });

    const subjectKeys = subjectIds.filter((subjectId) => subjects.has(subjectId));
    elements.acquisitionList.innerHTML = '';
    if (subjectKeys.length === 0) {
        elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No completed acquisitions found for the available subjects.</p>';
        return;
    }

    // Find the subject with the most recent acquisition
    let mostRecentSubjectKey = null;
    let mostRecentTime = -Infinity;
    subjectKeys.forEach((subjectKey) => {
        const sessions = subjects.get(subjectKey);
        sessions.forEach((acqs) => {
            acqs.forEach((acq) => {
                const acqTime = acq.start_time ? new Date(acq.start_time).getTime() : -Infinity;
                if (acqTime > mostRecentTime) {
                    mostRecentTime = acqTime;
                    mostRecentSubjectKey = subjectKey;
                }
            });
        });
    });

    subjectKeys.forEach((subjectKey) => {
        const subjectNode = document.createElement('div');
        subjectNode.className = 'tree-node tree-subject';
        subjectNode.dataset.subject = subjectKey;

        const subjectHeader = document.createElement('div');
        subjectHeader.className = 'tree-header';
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'tree-toggle-btn';
        toggleBtn.type = 'button';
        toggleBtn.textContent = '−';
        toggleBtn.title = 'Collapse/Expand';
        
        const subjectLabel = document.createElement('label');
        subjectLabel.className = 'tree-label';
        const subjectCheckbox = document.createElement('input');
        subjectCheckbox.type = 'checkbox';
        subjectCheckbox.className = 'subject-checkbox';
        const subjectText = document.createElement('span');
        subjectText.textContent = `Subject ${subjectKey}`;
        subjectLabel.appendChild(subjectCheckbox);
        subjectLabel.appendChild(subjectText);
        subjectHeader.appendChild(subjectLabel);

        const sessions = subjects.get(subjectKey);
        const sessionCount = sessions.size;
        const subjectMeta = document.createElement('span');
        subjectMeta.className = 'tree-meta';
        subjectMeta.textContent = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`;
        subjectHeader.appendChild(subjectMeta);
        
        subjectHeader.appendChild(toggleBtn);

        const subjectChildren = document.createElement('div');
        subjectChildren.className = 'tree-children';

        // Determine if this subject should be collapsed (all except the most recent)
        const isMostRecentSubject = subjectKey === mostRecentSubjectKey;
        if (!isMostRecentSubject) {
            subjectChildren.classList.add('collapsed');
            toggleBtn.classList.add('collapsed');
        }

        const sessionKeys = Array.from(sessions.keys()).sort(compareKeys);
        sessionKeys.forEach((sessionKey) => {
            const sessionNode = document.createElement('div');
            sessionNode.className = 'tree-node tree-session';
            sessionNode.dataset.session = sessionKey;

            const sessionHeader = document.createElement('div');
            sessionHeader.className = 'tree-header';
            const sessionLabel = document.createElement('label');
            sessionLabel.className = 'tree-label';
            const sessionCheckbox = document.createElement('input');
            sessionCheckbox.type = 'checkbox';
            sessionCheckbox.className = 'session-checkbox';
            const sessionText = document.createElement('span');
            sessionText.textContent = `Session ${sessionKey}`;
            sessionLabel.appendChild(sessionCheckbox);
            sessionLabel.appendChild(sessionText);
            sessionHeader.appendChild(sessionLabel);

            const acqs = sessions.get(sessionKey);
            const acqCount = acqs.length;
            const sessionMeta = document.createElement('span');
            sessionMeta.className = 'tree-meta';
            sessionMeta.textContent = `${acqCount} acq${acqCount === 1 ? '' : 's'}`;
            sessionHeader.appendChild(sessionMeta);

            const sessionChildren = document.createElement('div');
            sessionChildren.className = 'tree-children';

            const sortedAcqs = acqs.slice().sort((a, b) => {
                return getAcqSortValue(a.id) - getAcqSortValue(b.id);
            });

            sortedAcqs.forEach((acq) => {
                const rawId = acq.id || 'N/A';
                const dateTime = formatDateTime(acq.start_time);
                const leaf = document.createElement('div');
                leaf.className = 'tree-leaf';
                leaf.dataset.acqId = rawId;

                const label = document.createElement('label');
                label.className = 'tree-leaf-label';
                const acqCheckbox = document.createElement('input');
                acqCheckbox.type = 'checkbox';
                acqCheckbox.className = 'acq-checkbox';
                acqCheckbox.dataset.acqId = rawId;
                const textWrap = document.createElement('span');
                textWrap.className = 'tree-leaf-text';
                const primary = document.createElement('span');
                primary.className = 'tree-leaf-primary';
                primary.textContent = dateTime;
                const secondary = document.createElement('span');
                secondary.className = 'tree-leaf-secondary';
                secondary.textContent = rawId;
                textWrap.appendChild(primary);
                textWrap.appendChild(secondary);
                label.appendChild(acqCheckbox);
                label.appendChild(textWrap);

                leaf.appendChild(label);
                sessionChildren.appendChild(leaf);
            });

            sessionNode.appendChild(sessionHeader);
            sessionNode.appendChild(sessionChildren);
            subjectChildren.appendChild(sessionNode);
        });

        subjectNode.appendChild(subjectHeader);
        subjectNode.appendChild(subjectChildren);
        elements.acquisitionList.appendChild(subjectNode);
    });

    // Add toggle functionality after tree is built
    const toggleBtns = elements.acquisitionList.querySelectorAll('.tree-toggle-btn');
    toggleBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const subjectNode = btn.closest('.tree-subject');
            const children = subjectNode.querySelector('.tree-children');
            if (children) {
                children.classList.toggle('collapsed');
                btn.classList.toggle('collapsed');
                btn.textContent = btn.classList.contains('collapsed') ? '+' : '−';
            }
        });
    });
}

// Download all sensors for an acquisition (ZIP if >10MB, otherwise individual files)
async function downloadAllCSV(acquisitionId, options = {}) {
    try {
        const displayId = acquisitionId.replace('acq_', '');
        if (!options.silent) {
            showFeedback(`Downloading Acquisition ${displayId}...`, 'info');
        }
        
        // Call the bundle endpoint which decides ZIP vs individual
        const bundleResponse = await fetch(`/download/sensors/${acquisitionId}`);
        
        if (!bundleResponse.ok) {
            const error = await bundleResponse.json();
            throw new Error(error.detail || 'Bundle download failed');
        }
        
        // Check response type
        const contentType = bundleResponse.headers.get('content-type') || '';
        
        if (contentType.includes('application/zip')) {
            // It's a ZIP file - download directly
            const blob = await bundleResponse.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            // Get filename from Content-Disposition header
            const disposition = bundleResponse.headers.get('content-disposition') || '';
            let filename = `acquisition_${displayId}.zip`;
            const filenameMatch = disposition.match(/filename=([^;]+)/);
            if (filenameMatch) {
                filename = filenameMatch[1].replace(/['"]/g, '');
            }
            
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            if (!options.silent) {
                showFeedback(`✓ Downloaded ${filename}`, 'success');
            }
        } else {
            // It's JSON with individual file list - download individual files
            const bundleData = await bundleResponse.json();
            
            if (bundleData.download_method === 'individual' && bundleData.sensors) {
                const acq = allCompletedAcquisitions.find(a => a.id === acquisitionId);
                if (!acq) {
                    throw new Error('Acquisition not found');
                }
                
                const testConfig = acq.test_config || {};
                const subjectId = testConfig.subject_id || 'unknown';
                const sessionId = testConfig.session_id || 'unknown';
                const acqNum = acquisitionId.replace('acq_', '');
                
                // Download each sensor file
                for (const sensor of bundleData.sensors) {
                    await downloadSensorCSV(acquisitionId, sensor, subjectId, sessionId, acqNum, options.silent);
                }
                
                if (!options.silent) {
                    showFeedback(`✓ Downloaded ${bundleData.sensors.length} files for acquisition ${displayId}`, 'success');
                }
            }
        }
    } catch (error) {
        console.error('Download failed:', error);
        showFeedback(`Failed to download: ${error.message}`, 'error');
    }
}

async function downloadSensorCSV(acquisitionId, sensor, subjectId, sessionId, acqNum, silent = false) {
    let url, filename;
    
    if (sensor === 'info') {
        url = `/download/info/${acquisitionId}`;
        filename = `subject_${subjectId}_session_${sessionId}_acq_${acqNum}_info.csv`;
    } else if (sensor === 'tip_force') {
        url = `/download/force/${acquisitionId}`;
        filename = `subject_${subjectId}_session_${sessionId}_acq_${acqNum}_tip_force.csv`;
    } else if (sensor === 'handle_force') {
        url = `/download/handle-force/${acquisitionId}`;
        filename = `subject_${subjectId}_session_${sessionId}_acq_${acqNum}_handle_force.csv`;
    } else if (sensor === 'cardiac_frequency') {
        url = `/download/cardiac-frequency/${acquisitionId}`;
        filename = `subject_${subjectId}_session_${sessionId}_acq_${acqNum}_cardiac_frequency.csv`;
    } else if (sensor === 'eye_tracker') {
        url = `/download/eye-tracker/${acquisitionId}`;
        filename = `subject_${subjectId}_session_${sessionId}_acq_${acqNum}_eye_tracker.csv`;
    } else {
        // Future sensors can be added here
        return;
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorMsg = `${sensor} download failed`;
            try {
                const error = await response.json();
                errorMsg = error.detail || errorMsg;
            } catch (e) {
                // Response is not JSON, try text
                try {
                    const text = await response.text();
                    errorMsg = text.substring(0, 200);
                } catch (e2) {
                    errorMsg = `HTTP ${response.status}`;
                }
            }
            throw new Error(errorMsg);
        }
        const blob = await response.blob();
        const url_obj = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url_obj;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url_obj);
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
        console.error(`Download ${sensor} failed:`, error);
        if (!silent) {
            showFeedback(`Failed to download ${sensor}: ${error.message}`, 'error');
        }
        throw error;
    }
}

elements.acquisitionList.addEventListener('change', (event) => {
    const target = event.target;
    if (target.classList.contains('subject-checkbox')) {
        const subjectNode = target.closest('.tree-subject');
        const acqCheckboxes = subjectNode.querySelectorAll('.acq-checkbox');
        acqCheckboxes.forEach((checkbox) => {
            checkbox.checked = target.checked;
        });
    }

    if (target.classList.contains('session-checkbox')) {
        const sessionNode = target.closest('.tree-session');
        const acqCheckboxes = sessionNode.querySelectorAll('.acq-checkbox');
        acqCheckboxes.forEach((checkbox) => {
            checkbox.checked = target.checked;
        });
    }

    updateAllCheckboxStates();
    updateSelectedCount();
});

elements.downloadSelectedBtn.addEventListener('click', async () => {
    const selected = getSelectedAcqIds();
    if (selected.length === 0) {
        showFeedback('No acquisitions selected', 'info');
        return;
    }

    elements.downloadSelectedBtn.disabled = true;
    elements.clearSelectedBtn.disabled = true;
    showFeedback(`Downloading ${selected.length} acquisition${selected.length === 1 ? '' : 's'}...`, 'info');

    for (const acqId of selected) {
        await downloadAllCSV(acqId, { silent: true });
    }

    showFeedback(`Downloaded ${selected.length} acquisition${selected.length === 1 ? '' : 's'}`, 'success');
    updateSelectedCount();
});

elements.clearSelectedBtn.addEventListener('click', () => {
    const acqCheckboxes = elements.acquisitionList.querySelectorAll('.acq-checkbox');
    acqCheckboxes.forEach((checkbox) => {
        checkbox.checked = false;
    });
    updateAllCheckboxStates();
    updateSelectedCount();
});

// Initialize - load acquisition list on page load
loadAcquisitionList();
