// Download page - select and download acquisition data

const elements = {
    feedback: document.getElementById('feedback'),
    acquisitionList: document.getElementById('acquisition-list')
};

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

// Load acquisition list
async function loadAcquisitionList() {
    try {
        const response = await fetch('/acquisitions');
        const data = await response.json();
        
        if (!data.acquisitions || data.acquisitions.length === 0) {
            elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No acquisitions available</p>';
            return;
        }
        
        // Sort by start_time descending (most recent first)
        const sorted = data.acquisitions.sort((a, b) => {
            const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
            const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
            return timeB - timeA;
        });
        
        // Filter only completed acquisitions
        const completed = sorted.filter(acq => acq.status === 'completed');
        
        if (completed.length === 0) {
            elements.acquisitionList.innerHTML = '<p style="color: var(--muted);">No completed acquisitions available</p>';
            return;
        }
        
        // Create card for each acquisition
        elements.acquisitionList.innerHTML = '';
        completed.forEach(acq => {
            const card = createAcquisitionCard(acq);
            elements.acquisitionList.appendChild(card);
        });
        
    } catch (error) {
        console.error('Failed to load acquisitions:', error);
        showFeedback('Failed to load acquisition list', 'error');
    }
}

// Create acquisition card
function createAcquisitionCard(acq) {
    const card = document.createElement('div');
    card.className = 'download-card';
    card.style.cssText = `
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        background: var(--panel-bg);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
    `;
    
    // Extract info
    const rawId = acq.id || 'N/A';
    // Remove "acq_" prefix and format as "Acquisition: ID"
    const displayId = rawId.startsWith('acq_') ? `Acquisition: ${rawId.replace('acq_', '')}` : rawId;
    const subjectId = (acq.test_config && acq.test_config.subject_id) ? `Subject ${acq.test_config.subject_id}` : 'Unknown';
    const sessionId = (acq.test_config && acq.test_config.session_id) ? `Session ${acq.test_config.session_id}` : '';
    const dateTime = formatDateTime(acq.start_time);
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1;';
    const sessionInfo = sessionId ? ` - ${sessionId}` : '';
    infoDiv.innerHTML = `
        <strong style="font-size: 16px; color: var(--text);">${displayId}</strong>
        <div style="font-size: 14px; color: var(--muted);">
            <strong style="color: var(--text);">${subjectId}</strong>${sessionInfo} - ${dateTime}
        </div>
    `;
    
    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '⬇ Download';
    downloadBtn.className = 'btn';
    downloadBtn.style.cssText = 'margin: 0; font-size: 14px; padding: 8px 16px; white-space: nowrap;';
    downloadBtn.onclick = () => downloadAllCSV(rawId);
    
    card.appendChild(infoDiv);
    card.appendChild(downloadBtn);
    
    return card;
}

// Download both CSV files
async function downloadAllCSV(acquisitionId) {
    try {
        // Extract just the ID without "acq_" for display
        const displayId = acquisitionId.startsWith('acq_') ? acquisitionId.replace('acq_', '') : acquisitionId;
        showFeedback(`Downloading files for Acquisition ${displayId}...`, 'info');
        
        // Download force CSV
        const forceResponse = await fetch(`/download/force/${acquisitionId}`);
        if (!forceResponse.ok) {
            const error = await forceResponse.json();
            throw new Error(error.detail || 'Force download failed');
        }
        const forceBlob = await forceResponse.blob();
        const forceUrl = window.URL.createObjectURL(forceBlob);
        const forceLink = document.createElement('a');
        forceLink.href = forceUrl;
        forceLink.download = `force_${acquisitionId}.csv`;
        document.body.appendChild(forceLink);
        forceLink.click();
        document.body.removeChild(forceLink);
        window.URL.revokeObjectURL(forceUrl);
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Download info CSV
        const infoResponse = await fetch(`/download/info/${acquisitionId}`);
        if (!infoResponse.ok) {
            const error = await infoResponse.json();
            throw new Error(error.detail || 'Info download failed');
        }
        const infoBlob = await infoResponse.blob();
        const infoUrl = window.URL.createObjectURL(infoBlob);
        const infoLink = document.createElement('a');
        infoLink.href = infoUrl;
        infoLink.download = `info_${acquisitionId}.csv`;
        document.body.appendChild(infoLink);
        infoLink.click();
        document.body.removeChild(infoLink);
        window.URL.revokeObjectURL(infoUrl);
        
        showFeedback(`Downloaded force_${acquisitionId}.csv and info_${acquisitionId}.csv`, 'success');
    } catch (error) {
        console.error('Download failed:', error);
        showFeedback(`Failed to download: ${error.message}`, 'error');
    }
}

// Initialize - load acquisition list on page load
loadAcquisitionList();
