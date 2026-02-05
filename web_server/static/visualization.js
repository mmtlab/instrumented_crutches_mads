// Visualization page logic - plain JavaScript with Chart.js
// Simple and readable for embedded systems

(function() {
    'use strict';
    
    // API configuration
    const API_BASE = '';
    
    // Chart instances
    const charts = {
        force: null,
        pwb: null
    };
    
    // DOM elements
    const elements = {
        acquisitionSelect: document.getElementById('acquisition-select'),
        feedback: document.getElementById('feedback'),
        forceCanvas: document.getElementById('force-chart'),
        toggleChartBtn: document.getElementById('toggle-chart-btn'),
        chartContent: document.getElementById('chart-content'),
        pwbCanvas: document.getElementById('pwb-chart'),
        togglePwbBtn: document.getElementById('toggle-pwb-btn'),
        pwbContent: document.getElementById('pwb-content')
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
            
            // Determine if data is in % body weight or Newtons
            const hasBodyWeight = result.body_weight_kg != null;
            const yAxisLabel = hasBodyWeight ? 'Force (% Body Weight)' : 'Force (N)';
            
            // Render chart with left and/or right force traces
            renderForceChart(data.ts_left, data.left, data.ts_right, data.right, yAxisLabel, hasBodyWeight);
            
            // Render PWB chart if data is in % body weight
            if (hasBodyWeight && data.ts_left && data.ts_right && data.left && data.right) {
                renderPWBChart(data.ts_left, data.left, data.ts_right, data.right);
            }
            
            const num = acquisitionId.replace('acq_', '');
            const weightInfo = hasBodyWeight ? ` (${result.body_weight_kg} kg)` : '';
            showFeedback(`✓ Showing recording #${num}${weightInfo} (${result.samples} samples)`, 'success');
        } catch (error) {
            console.error('Load data error:', error);
            showFeedback('Cannot load data. Try again.', 'error');
        }
    }

    // Render force chart using Chart.js
    function renderForceChart(tsLeft, leftData, tsRight, rightData, yAxisLabel, hasBodyWeight) {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded. Ensure /static/chart.umd.min.js is available.');
            showFeedback('Chart.js non caricato. Verifica /static/chart.umd.min.js.', 'error');
            return;
        }
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
        
        // Configure Y axis based on data type
        const yAxisConfig = {
            display: true,
            title: {
                display: true,
                text: yAxisLabel || 'Force'
            }
        };
        
        // If data is in % body weight, force fixed axis from -20 to 120
        const isPercentAxis = hasBodyWeight || (typeof yAxisLabel === 'string' && yAxisLabel.includes('%'));
        if (isPercentAxis) {
            yAxisConfig.min = -20;
            yAxisConfig.max = 120;
            yAxisConfig.grace = 0;
        } else {
            yAxisConfig.beginAtZero = true;
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
                        display: window.innerWidth > 768,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: true,
                        mode: window.innerWidth > 768 ? 'index' : 'nearest',
                        intersect: window.innerWidth <= 768
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
                    y: yAxisConfig
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
}
    
    // Linear interpolation helper
    function interpolate(x, x0, y0, x1, y1) {
        if (x1 === x0) return y0;
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    
    // Synchronize left and right data on common timestamps using interpolation
    function synchronizeData(tsLeft, leftData, tsRight, rightData) {
        // Combine all timestamps and sort them
        const allTimestamps = [...new Set([...tsLeft, ...tsRight])].sort((a, b) => a - b);
        
        const syncedLeft = [];
        const syncedRight = [];
        const syncedTs = [];
        
        let leftIdx = 0;
        let rightIdx = 0;
        
        for (const t of allTimestamps) {
            // Find left value at time t (interpolate if needed)
            while (leftIdx < tsLeft.length - 1 && tsLeft[leftIdx + 1] <= t) {
                leftIdx++;
            }
            
            let leftValue;
            if (leftIdx < tsLeft.length - 1) {
                // Interpolate between leftIdx and leftIdx+1
                leftValue = interpolate(t, tsLeft[leftIdx], leftData[leftIdx], 
                                       tsLeft[leftIdx + 1], leftData[leftIdx + 1]);
            } else {
                // Use last available value
                leftValue = leftData[leftData.length - 1];
            }
            
            // Find right value at time t (interpolate if needed)
            while (rightIdx < tsRight.length - 1 && tsRight[rightIdx + 1] <= t) {
                rightIdx++;
            }
            
            let rightValue;
            if (rightIdx < tsRight.length - 1) {
                // Interpolate between rightIdx and rightIdx+1
                rightValue = interpolate(t, tsRight[rightIdx], rightData[rightIdx], 
                                        tsRight[rightIdx + 1], rightData[rightIdx + 1]);
            } else {
                // Use last available value
                rightValue = rightData[rightData.length - 1];
            }
            
            syncedTs.push(t);
            syncedLeft.push(leftValue);
            syncedRight.push(rightValue);
        }
        
        return { ts: syncedTs, left: syncedLeft, right: syncedRight };
    }
    
    // Calculate PWB (Partial Weight Bearing)
    function calculatePWB(tsLeft, leftData, tsRight, rightData) {
        // Synchronize data on common timestamps
        const synced = synchronizeData(tsLeft, leftData, tsRight, rightData);
        
        // Calculate PWB = 1 - (left + right) / 100
        // left and right are already in % body weight, so BW = 100%
        const pwbData = [];
        for (let i = 0; i < synced.ts.length; i++) {
            const totalCrutchForce = synced.left[i] + synced.right[i];
            const pwb = (1 - totalCrutchForce / 100) * 100; // Convert to percentage
            pwbData.push(pwb);
        }
        
        return { ts: synced.ts, pwb: pwbData };
    }
    
    // Render PWB chart
    function renderPWBChart(tsLeft, leftData, tsRight, rightData) {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded. Ensure /static/chart.umd.min.js is available.');
            showFeedback('Chart.js non caricato. Verifica /static/chart.umd.min.js.', 'error');
            return;
        }
        // Destroy existing chart if any
        if (charts.pwb) {
            charts.pwb.destroy();
        }
        
        // Calculate PWB
        const pwbResult = calculatePWB(tsLeft, leftData, tsRight, rightData);
        
        const ctx = elements.pwbCanvas.getContext('2d');
        
        // Create data points array
        const pwbPoints = pwbResult.ts.map((t, i) => ({ x: t, y: pwbResult.pwb[i] }));
        
        charts.pwb = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'PWB',
                    data: pwbPoints,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    showLine: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    legend: {
                        display: window.innerWidth > 768,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: true,
                        mode: window.innerWidth > 768 ? 'index' : 'nearest',
                        intersect: window.innerWidth <= 768,
                        callbacks: {
                            label: function(context) {
                                return `PWB: ${context.parsed.y.toFixed(1)}%`;
                            }
                        }
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
                            text: 'PWB (% Body Weight)'
                        },
                        min: -20,
                        max: 120,
                        grace: 0
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
    
    // Toggle chart panel
    function toggleChartPanel() {
        elements.chartContent.classList.toggle('collapsed');
        elements.toggleChartBtn.classList.toggle('collapsed');
    }
    
    // Toggle PWB panel
    function togglePwbPanel() {
        elements.pwbContent.classList.toggle('collapsed');
        elements.togglePwbBtn.classList.toggle('collapsed');
    }
    
    // Auto-load data when acquisition is selected
    elements.acquisitionSelect.addEventListener('change', () => {
        if (elements.acquisitionSelect.value) {
            loadAcquisitionData();
        }
    });
    
    // Toggle chart button
    elements.toggleChartBtn.addEventListener('click', toggleChartPanel);
    elements.togglePwbBtn.addEventListener('click', togglePwbPanel);
    
    // Initialize - load acquisition list on page load
    loadAcquisitionList();
    
})();
