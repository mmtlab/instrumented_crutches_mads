// Visualization page logic - plain JavaScript with Chart.js
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // API configuration
    const API_BASE = '';
    
    // Chart instances
    const charts = {
        force: null
    };
    
    // DOM elements
    const elements = {
        acquisitionSelect: document.getElementById('acquisition-select'),
        feedback: document.getElementById('feedback'),
        forceCanvas: document.getElementById('force-chart')
    };
    
    // Show feedback message
    function showFeedback(message, type) {
        elements.feedback.textContent = message;
        elements.feedback.className = `feedback feedback-${type}`;
        elements.feedback.style.display = 'block';
        
        setTimeout(() => {
            elements.feedback.style.display = 'none';
        }, 5000);
    }
    
    // Fetch list of acquisitions and populate dropdown
    async function loadAcquisitionList() {
        try {
            const response = await fetch(`${API_BASE}/acquisitions`);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
                const data = await response.json();
            
            // Clear existing options (except first)
            elements.acquisitionSelect.innerHTML = '<option value="">-- Choose a recording --</option>';
            
            if (data.acquisitions.length === 0) {
                showFeedback('No recordings yet. Record some data first.', 'info');
                return;
            }
            
            // Populate dropdown with acquisitions (newest first)
            const sortedAcqs = [...data.acquisitions].reverse();
            sortedAcqs.forEach(acq => {
                const option = document.createElement('option');
                option.value = acq.id;
                const num = acq.id.replace('acq_', '');
                const statusText = acq.status === 'completed' ? 'finished' : acq.status;
                option.textContent = `Recording #${num} (${statusText})`;
                elements.acquisitionSelect.appendChild(option);
            });
            
            // Auto-select and load the most recent acquisition (first in reversed list)
            if (sortedAcqs.length > 0) {
                const mostRecentId = sortedAcqs[0].id;
                elements.acquisitionSelect.value = mostRecentId;
                // Load the most recent acquisition automatically
                await loadAcquisitionData();
            } else {
                showFeedback('No recordings available', 'info');
            }
        } catch (error) {
            console.error('Load acquisitions error:', error);
            showFeedback('Cannot load recordings. Check connection.', 'error');
        }
    }

    // Load and display data for selected acquisition
    async function loadAcquisitionData() {
        const acquisitionId = elements.acquisitionSelect.value;
        
        if (!acquisitionId) {
            showFeedback('Please choose a recording first', 'warning');
            return;
        }
        
        try {
            showFeedback('Loading...', 'info');
            
            const response = await fetch(`${API_BASE}/acquisitions/${acquisitionId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Acquisition not found');
                }
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            const data = result.data;
            
            // Render chart with left and/or right force traces
            renderForceChart(data.ts_left, data.left, data.ts_right, data.right);
            
            const num = acquisitionId.replace('acq_', '');
            showFeedback(`✓ Showing recording #${num} (${result.samples} samples)`, 'success');
        } catch (error) {
            console.error('Load data error:', error);
            showFeedback('Cannot load data. Try again.', 'error');
        }
    }

    // Render force chart using Chart.js
    function renderForceChart(tsLeft, leftData, tsRight, rightData) {
        // Destroy existing chart if any
        if (charts.force) {
            charts.force.destroy();
        }
        
        const ctx = elements.forceCanvas.getContext('2d');
        
        // Build datasets array based on available data
        const datasets = [];
        
        if (leftData && tsLeft) {
            // Create data points array with x (timestamp) and y (value)
            const leftPoints = tsLeft.map((t, i) => ({ x: t, y: leftData[i] }));
            datasets.push({
                label: 'Left Crutch',
                data: leftPoints,
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1,
                showLine: true
            });
        }
        
        if (rightData && tsRight) {
            // Create data points array with x (timestamp) and y (value)
            const rightPoints = tsRight.map((t, i) => ({ x: t, y: rightData[i] }));
            datasets.push({
                label: 'Right Crutch',
                data: rightPoints,
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1,
                showLine: true
            });
        }
        
        charts.force = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        display: true,
                        title: {
                            display: true,
                            text: 'Time (s)'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Force'
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
}
    
    // Auto-load data when acquisition is selected
    elements.acquisitionSelect.addEventListener('change', () => {
        if (elements.acquisitionSelect.value) {
            loadAcquisitionData();
        }
    });
    
    // Initialize - load acquisition list on page load
    loadAcquisitionList();
    
})();
