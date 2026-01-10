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
        loadBtn: document.getElementById('load-btn'),
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
            data.acquisitions.reverse().forEach(acq => {
                const option = document.createElement('option');
                option.value = acq.id;
                const num = acq.id.replace('acq_', '');
                const statusText = acq.status === 'completed' ? 'finished' : acq.status;
                option.textContent = `Recording #${num} (${statusText})`;
                elements.acquisitionSelect.appendChild(option);
            });
            
            const plural = data.acquisitions.length === 1 ? '' : 's';
            showFeedback(`${data.acquisitions.length} recording${plural} available`, 'success');
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
            
            // Render chart with single force trace
            renderForceChart(data.timestamp, data.force);
            
            const num = acquisitionId.replace('acq_', '');
            showFeedback(`✓ Showing recording #${num} (${result.samples} samples)`, 'success');
        } catch (error) {
            console.error('Load data error:', error);
            showFeedback('Cannot load data. Try again.', 'error');
        }
    }

    // Render force chart using Chart.js
    function renderForceChart(timestamps, forceData) {
        // Destroy existing chart if any
        if (charts.force) {
            charts.force.destroy();
        }
        
        const ctx = elements.forceCanvas.getContext('2d');
        
        charts.force = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        label: 'Force',
                        data: forceData,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
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
                        display: true,
                        title: {
                            display: true,
                            text: 'Time (s)'
                        },
                        ticks: {
                            maxTicksLimit: 10
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
    
    // Enable load button when acquisition is selected
    elements.acquisitionSelect.addEventListener('change', () => {
        elements.loadBtn.disabled = !elements.acquisitionSelect.value;
    });
    
    // Load data when button clicked
    elements.loadBtn.addEventListener('click', loadAcquisitionData);
    
    // Initialize - load acquisition list on page load
    loadAcquisitionList();
    
})();
