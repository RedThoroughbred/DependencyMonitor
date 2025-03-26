// Global variables
let allDependencies = [];
let projects = [];
let currentProject = 'all';
let filteredDependencies = [];
let filters = {
    status: 'all',
    risk: 'all',
    security: 'all',
    search: ''
};

// Initialize charts
let healthChart = null;
let riskChart = null;
let licenseChart = null;

// License Policy Configuration
const licensePolicy = {
    allowed: ['MIT', 'BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache', 'Apache-2.0', 'Apache 2.0', 'ISC', 'CC0-1.0'],
    reviewRequired: ['LGPL', 'LGPL-2.1', 'LGPL-3.0', 'MPL', 'MPL-2.0', 'Mozilla'],
    restricted: ['AGPL', 'AGPL-3.0', 'GPL', 'GPL-2.0', 'GPL-3.0', 'Proprietary']
};

document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    setupEventListeners();
    initializeDarkMode();
    loadData();
});

function initializeDarkMode() {
    // Check for saved theme preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeIcon').classList.add('hidden');
        document.getElementById('lightModeIcon').classList.remove('hidden');
    }
}

function setupEventListeners() {
    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
    
    // Data management
    document.getElementById('refreshBtn').addEventListener('click', loadData);
    document.getElementById('projectSelector').addEventListener('change', function(e) {
        currentProject = e.target.value;
        updateDashboard();
    });
    
    // Import modal events
    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importModal').classList.remove('hidden');
    });
    
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('importModal').classList.add('hidden');
    });
    
    document.getElementById('cancelImport').addEventListener('click', function() {
        document.getElementById('importModal').classList.add('hidden');
    });
    
    document.getElementById('browseFile').addEventListener('click', function() {
        document.getElementById('requirementsFile').click();
    });
    
    document.getElementById('requirementsFile').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            document.getElementById('fileNameDisplay').value = e.target.files[0].name;
        }
    });
    
    document.getElementById('submitImport').addEventListener('click', importRequirementsFile);
    
    // License modal events
    document.getElementById('closeLicenseModal').addEventListener('click', function() {
        document.getElementById('licenseModal').classList.add('hidden');
    });
    
    // High Risk Dependencies modal events
    document.getElementById('closeHighRiskModal').addEventListener('click', function() {
        document.getElementById('highRiskModal').classList.add('hidden');
    });
    
    document.getElementById('closeHighRiskBtn').addEventListener('click', function() {
        document.getElementById('highRiskModal').classList.add('hidden');
    });
    
    // Filter events
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Search filter typing event
    document.getElementById('searchFilter').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    
    // Update icons
    const darkIcon = document.getElementById('darkModeIcon');
    const lightIcon = document.getElementById('lightModeIcon');
    
    if (document.body.classList.contains('dark-mode')) {
        darkIcon.classList.add('hidden');
        lightIcon.classList.remove('hidden');
        localStorage.theme = 'dark';
    } else {
        darkIcon.classList.remove('hidden');
        lightIcon.classList.add('hidden');
        localStorage.theme = 'light';
    }
    
    // Force repaint on table elements
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        table.style.display = 'none';
        setTimeout(() => table.style.display = 'table', 10);
    });
    
    // Update chart colors
    updateChartsForTheme();
}

function updateChartsForTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    
    // Update chart text colors
    const textColor = isDark ? '#fff' : '#666';
    
    if (healthChart) {
        healthChart.options.plugins.legend.labels.color = textColor;
        healthChart.options.scales.x.ticks.color = textColor;
        healthChart.options.scales.y.ticks.color = textColor;
        healthChart.update();
    }
    
    if (riskChart) {
        riskChart.options.plugins.legend.labels.color = textColor;
        riskChart.update();
    }
    
    if (licenseChart) {
        licenseChart.options.plugins.legend.labels.color = textColor;
        licenseChart.update();
    }
}

function initCharts() {
    // Health score distribution chart
    const healthCtx = document.getElementById('healthChart').getContext('2d');
    healthChart = new Chart(healthCtx, {
        type: 'bar',
        data: {
            labels: ['0-20', '21-40', '41-60', '61-80', '81-100'],
            datasets: [{
                label: 'Dependencies',
                data: [0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(234, 179, 8, 0.7)',
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(16, 185, 129, 0.7)'
                ],
                borderColor: [
                    'rgb(239, 68, 68)',
                    'rgb(249, 115, 22)',
                    'rgb(234, 179, 8)',
                    'rgb(34, 197, 94)',
                    'rgb(16, 185, 129)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Risk assessment chart
    const riskCtx = document.getElementById('riskChart').getContext('2d');
    riskChart = new Chart(riskCtx, {
        type: 'doughnut',
        data: {
            labels: ['Low', 'Medium', 'High', 'Critical'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(234, 179, 8, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(239, 68, 68, 0.7)'
                ],
                borderColor: [
                    'rgb(16, 185, 129)',
                    'rgb(234, 179, 8)',
                    'rgb(249, 115, 22)',
                    'rgb(239, 68, 68)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // License chart
    const licenseCtx = document.getElementById('licenseChart').getContext('2d');
    licenseChart = new Chart(licenseCtx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(234, 179, 8, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(79, 70, 229, 0.7)',
                    'rgba(219, 39, 119, 0.7)',
                    'rgba(107, 114, 128, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'right',
                    align: 'start'
                }
            }
        }
    });
}

async function loadData() {
    try {
        // In a real implementation, this would load from your API
        const response = await fetch('reports/dependencies.json');
        if (!response.ok) {
            throw new Error('Failed to load dependency data');
        }
        
        allDependencies = await response.json();
        
        // Check for dependencies with issues
        checkDependencyIssues();
        
        // Extract unique projects
        projects = ['all', ...new Set(allDependencies.map(dep => dep.project))];
        
        // Update project selector
        const projectSelector = document.getElementById('projectSelector');
        projectSelector.innerHTML = '';
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            option.textContent = project === 'all' ? 'All Projects' : project;
            projectSelector.appendChild(option);
        });
        
        // Load report content
        await loadReport();
        
        // Update the dashboard with the loaded data
        filteredDependencies = allDependencies;
        updateDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('Error', 'Failed to load dependency data. Using sample data instead.', 'error');
        
        // For demonstration, load with sample data
        loadSampleData();
    }
}

function checkDependencyIssues() {
    // Check for vulnerabilities, high-risk, or outdated dependencies
    const vulnerableDeps = allDependencies.filter(dep => dep.has_vulnerabilities === true);
    const highRiskDeps = allDependencies.filter(dep => 
        dep.abandonment_risk === 'High' || dep.abandonment_risk === 'Critical'
    );
    const outdatedDeps = allDependencies.filter(dep => dep.needs_update === true);
    
    if (vulnerableDeps.length > 0) {
        showNotification(
            'Security Alert', 
            `Found ${vulnerableDeps.length} dependencies with vulnerabilities.`, 
            'error',
            vulnerableDeps[0]
        );
    } else if (highRiskDeps.length > 0) {
        showNotification(
            'Risk Alert', 
            `Found ${highRiskDeps.length} dependencies with high abandonment risk.`, 
            'warning',
            highRiskDeps[0]
        );
    } else if (outdatedDeps.length > 0) {
        showNotification(
            'Update Alert', 
            `Found ${outdatedDeps.length} dependencies that need updates.`, 
            'info',
            outdatedDeps[0]
        );
    }
}

function showNotification(title, message, type = 'info', packageInfo = null) {
    const notification = document.getElementById('notification');
    const notificationTitle = document.getElementById('notification-title');
    const notificationContent = document.getElementById('notification-content');
    const notificationIcon = document.getElementById('notification-icon');
    const notificationActions = document.getElementById('notification-actions');
    
    // Set notification content
    notificationTitle.textContent = title;
    notificationContent.textContent = message;
    
    // Clear previous actions
    notificationActions.innerHTML = '';
    
    // Add action buttons if packageInfo is provided
    if (packageInfo) {
        const viewDetailsBtn = document.createElement('button');
        viewDetailsBtn.className = 'px-3 py-1 bg-indigo-600 text-white rounded-md text-sm';
        viewDetailsBtn.textContent = 'View Details';
        viewDetailsBtn.onclick = () => viewAlertDetails(packageInfo.package_name, packageInfo.project);
        notificationActions.appendChild(viewDetailsBtn);
    }
    
    // Set notification type
    notification.classList.remove('border-indigo-500', 'border-yellow-500', 'border-red-500', 'border-green-500');
    notificationIcon.classList.remove('text-indigo-500', 'text-yellow-500', 'text-red-500', 'text-green-500');
    
    if (type === 'error') {
        notification.classList.add('border-red-500');
        notificationIcon.classList.add('text-red-500');
    } else if (type === 'warning') {
        notification.classList.add('border-yellow-500');
        notificationIcon.classList.add('text-yellow-500');
    } else if (type === 'success') {
        notification.classList.add('border-green-500');
        notificationIcon.classList.add('text-green-500');
    } else {
        notification.classList.add('border-indigo-500');
        notificationIcon.classList.add('text-indigo-500');
    }
    
    // Show notification
    notification.classList.add('show');
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 8000);
}

function closeNotification() {
    document.getElementById('notification').classList.remove('show');
}

function viewAlertDetails(packageName, projectName) {
    // When called from a vulnerability alert, go to the details page of that specific dependency
    if (allDependencies.find(dep => dep.package_name === packageName && dep.has_vulnerabilities)) {
        window.location.href = `/details.html?package=${packageName}&project=${projectName}`;
        return;
    }
    
    // Check if this is a high risk alert
    const highRiskDeps = allDependencies.filter(dep => 
        dep.abandonment_risk === 'High' || dep.abandonment_risk === 'Critical'
    );
    
    if (highRiskDeps.length > 0) {
        // Show high risk dependencies modal
        showHighRiskDependenciesModal(highRiskDeps);
        return;
    }
    
    // Default fallback if not a special case
    window.location.href = `/details.html?package=${packageName}&project=${projectName}`;
}

function showHighRiskDependenciesModal(dependencies) {
    // Populate the high risk dependencies table
    const tableBody = document.getElementById('highRiskTableBody');
    tableBody.innerHTML = '';
    
    dependencies.forEach(dep => {
        // Create health badge
        let healthBadge;
        const score = dep.health_score;
        if (score > 80) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">${score}</span>`;
        } else if (score > 60) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">${score}</span>`;
        } else if (score > 40) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">${score}</span>`;
        } else if (score > 20) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">${score}</span>`;
        } else {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">${score}</span>`;
        }
        
        // Create risk badge
        let riskBadge;
        const risk = dep.abandonment_risk;
        if (risk === 'Low') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Low</span>`;
        } else if (risk === 'Medium') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Medium</span>`;
        } else if (risk === 'High') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">High</span>`;
        } else {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Critical</span>`;
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${dep.package_name}</div>
                <div class="text-sm text-gray-500">${dep.project}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${dep.version || 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${healthBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${riskBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${dep.last_updated ? new Date(dep.last_updated).toLocaleDateString() : 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <a href="/details.html?package=${dep.package_name}&project=${dep.project}" class="text-indigo-600 hover:text-indigo-900">View Details</a>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    // Show the modal
    document.getElementById('highRiskModal').classList.remove('hidden');
}

function loadSampleData() {
    // Sample data for demonstration
    allDependencies = [
        { project: 'Frontend', package_name: 'react', version: '17.0.2', latest_version: '18.2.0', health_score: 95, abandonment_risk: 'Low', last_updated: '2023-01-15', has_vulnerabilities: false, license: 'MIT' },
        { project: 'Frontend', package_name: 'redux', version: '4.1.0', latest_version: '4.2.1', health_score: 88, abandonment_risk: 'Low', last_updated: '2023-03-22', has_vulnerabilities: false, license: 'MIT' },
        { project: 'Frontend', package_name: 'lodash', version: '4.17.20', latest_version: '4.17.21', health_score: 92, abandonment_risk: 'Low', last_updated: '2022-11-10', has_vulnerabilities: true, vulnerability_count: 1, vulnerability_details: [{ severity: 'Medium', summary: 'Prototype pollution in _.merge' }], safe_upgrade_version: '4.17.21', license: 'MIT' },
        { project: 'Backend', package_name: 'express', version: '4.17.1', latest_version: '4.18.2', health_score: 90, abandonment_risk: 'Low', last_updated: '2023-02-05', has_vulnerabilities: false, license: 'MIT' },
        { project: 'Backend', package_name: 'mongoose', version: '5.12.3', latest_version: '6.10.0', health_score: 85, abandonment_risk: 'Low', last_updated: '2023-01-20', has_vulnerabilities: false, license: 'MIT' },
        { project: 'Backend', package_name: 'outdated-pkg', version: '1.0.0', latest_version: '2.3.0', health_score: 45, abandonment_risk: 'High', last_updated: '2021-06-15', has_vulnerabilities: true, vulnerability_count: 2, vulnerability_details: [{ severity: 'Critical', summary: 'Remote code execution vulnerability' }, { severity: 'High', summary: 'Information disclosure' }], safe_upgrade_version: '2.3.0', license: 'GPL-3.0' }
    ];
    
    projects = ['all', 'Frontend', 'Backend'];
    
    // Update project selector
    const projectSelector = document.getElementById('projectSelector');
    projectSelector.innerHTML = '';
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project === 'all' ? 'All Projects' : project;
        projectSelector.appendChild(option);
    });
    
    // Create sample report
    document.getElementById('reportContent').innerHTML = `
        <h1>Dependency Health Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        
        <h2>Summary</h2>
        <ul>
            <li>Total Dependencies: 6</li>
            <li>Dependencies Needing Updates: 4</li>
            <li>Dependencies at High/Critical Risk: 1</li>
            <li>Healthy Dependencies: 4</li>
        </ul>
        
        <h2>High Risk Dependencies</h2>
        <ul>
            <li><strong>outdated-pkg</strong> (1.0.0): High risk, Health Score: 45</li>
        </ul>
    `;
    
    filteredDependencies = allDependencies;
    updateDashboard();
}

async function loadReport() {
    try {
        const response = await fetch('reports/dependency_report.md');
        if (!response.ok) {
            throw new Error('Failed to load report');
        }
        
        const markdown = await response.text();
        const html = DOMPurify.sanitize(marked.parse(markdown));
        document.getElementById('reportContent').innerHTML = html;
    } catch (error) {
        console.error('Error loading report:', error);
        document.getElementById('reportContent').innerHTML = '<p>Error loading report. Please try again later.</p>';
    }
}

function updateDashboard() {
    // Filter dependencies based on current project and filters
    applyFilters();
    
    // Update summary cards
    document.getElementById('totalDeps').textContent = filteredDependencies.length;
    
    const needsUpdate = filteredDependencies.filter(dep => 
        dep.needs_update === true
    ).length;
    document.getElementById('needsUpdateDeps').textContent = needsUpdate;
    
    const vulnerable = filteredDependencies.filter(dep => 
        dep.has_vulnerabilities === true
    ).length;
    document.getElementById('vulnerableDeps').textContent = vulnerable;
    
    const highRisk = filteredDependencies.filter(dep => 
        dep.abandonment_risk === 'High' || dep.abandonment_risk === 'Critical'
    ).length;
    document.getElementById('highRiskDeps').textContent = highRisk;
    
    const avgHealth = filteredDependencies.length > 0 
        ? Math.round(filteredDependencies.reduce((sum, dep) => sum + dep.health_score, 0) / filteredDependencies.length) 
        : 0;
    document.getElementById('avgHealth').textContent = avgHealth;
    
    // Update health distribution chart
    const healthDistribution = [0, 0, 0, 0, 0];
    filteredDependencies.forEach(dep => {
        const score = dep.health_score;
        if (score <= 20) healthDistribution[0]++;
        else if (score <= 40) healthDistribution[1]++;
        else if (score <= 60) healthDistribution[2]++;
        else if (score <= 80) healthDistribution[3]++;
        else healthDistribution[4]++;
    });
    
    healthChart.data.datasets[0].data = healthDistribution;
    healthChart.update();
    
    // Update risk assessment chart
    const riskDistribution = [0, 0, 0, 0]; // Low, Medium, High, Critical
    filteredDependencies.forEach(dep => {
        const risk = dep.abandonment_risk;
        if (risk === 'Low') riskDistribution[0]++;
        else if (risk === 'Medium') riskDistribution[1]++;
        else if (risk === 'High') riskDistribution[2]++;
        else if (risk === 'Critical') riskDistribution[3]++;
    });
    
    riskChart.data.datasets[0].data = riskDistribution;
    riskChart.update();
    
    // Update license chart
    updateLicenseChart();
    
    // Update dependencies table
    updateDependenciesTable();
}

function updateLicenseChart() {
    // Count licenses
    const licenseCounts = {};
    filteredDependencies.forEach(dep => {
        const license = dep.license || 'Unknown';
        const simpleLicense = simplifyLicense(license);
        licenseCounts[simpleLicense] = (licenseCounts[simpleLicense] || 0) + 1;
    });
    
    // Prepare data for chart
    const labels = Object.keys(licenseCounts);
    const data = Object.values(licenseCounts);
    
    // Update chart
    licenseChart.data.labels = labels;
    licenseChart.data.datasets[0].data = data;
    licenseChart.update();
    
    // Update license issues list
    updateLicenseIssues();
}

function simplifyLicense(license) {
    // Extract the main license name from potentially complex license strings
    if (!license) return 'Unknown';
    
    const lowerLicense = license.toLowerCase();
    
    if (lowerLicense.includes('mit')) return 'MIT';
    if (lowerLicense.includes('apache')) return 'Apache';
    if (lowerLicense.includes('bsd')) return 'BSD';
    if (lowerLicense.includes('isc')) return 'ISC';
    if (lowerLicense.includes('mpl') || lowerLicense.includes('mozilla')) return 'Mozilla';
    if (lowerLicense.includes('lgpl')) return 'LGPL';
    if (lowerLicense.includes('gpl') && !lowerLicense.includes('lgpl') && !lowerLicense.includes('agpl')) return 'GPL';
    if (lowerLicense.includes('agpl')) return 'AGPL';
    
    // Return first part of license string (up to first space or 20 chars)
    const firstPart = license.split(' ')[0];
    return firstPart.length > 20 ? firstPart.substring(0, 20) + '...' : firstPart;
}

function updateLicenseIssues() {
    const licenseIssuesElement = document.getElementById('licenseIssues');
    licenseIssuesElement.innerHTML = '';
    
    // Find packages with restricted or review-required licenses
    const restrictedLicensePackages = filteredDependencies.filter(dep => {
        const simpleLicense = simplifyLicense(dep.license);
        return licensePolicy.restricted.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase()));
    });
    
    const reviewRequiredPackages = filteredDependencies.filter(dep => {
        const simpleLicense = simplifyLicense(dep.license);
        return licensePolicy.reviewRequired.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase())) &&
               !licensePolicy.restricted.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase()));
    });
    
    if (restrictedLicensePackages.length > 0 || reviewRequiredPackages.length > 0) {
        licenseIssuesElement.innerHTML = '<h4 class="font-medium text-gray-700 mb-2">License Issues</h4>';
        
        if (restrictedLicensePackages.length > 0) {
            const restrictedList = document.createElement('div');
            restrictedList.className = 'mb-3';
            restrictedList.innerHTML = `
                <p class="text-sm font-medium text-red-600 mb-1">Restricted Licenses (${restrictedLicensePackages.length}):</p>
                <ul class="text-sm text-gray-700 list-disc pl-5">
                    ${restrictedLicensePackages.map(dep => `
                        <li>${dep.package_name} (${simplifyLicense(dep.license)})</li>
                    `).join('')}
                </ul>
            `;
            licenseIssuesElement.appendChild(restrictedList);
        }
        
        if (reviewRequiredPackages.length > 0) {
            const reviewList = document.createElement('div');
            reviewList.innerHTML = `
                <p class="text-sm font-medium text-yellow-600 mb-1">Review Required (${reviewRequiredPackages.length}):</p>
                <ul class="text-sm text-gray-700 list-disc pl-5">
                    ${reviewRequiredPackages.map(dep => `
                        <li>${dep.package_name} (${simplifyLicense(dep.license)})</li>
                    `).join('')}
                </ul>
            `;
            licenseIssuesElement.appendChild(reviewList);
        }
    } else {
        licenseIssuesElement.innerHTML = `
            <div class="p-4 bg-green-50 text-green-700 rounded">
                <p>No license issues detected. All packages comply with the license policy.</p>
            </div>
        `;
    }
}

function updateDependenciesTable() {
    const tableBody = document.getElementById('dependenciesTable');
    
    if (filteredDependencies.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="px-6 py-4 text-center text-sm text-gray-500">
                    No dependencies found matching the current filters.
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = '';
    filteredDependencies.forEach(dep => {
        const needsUpdate = dep.version !== dep.latest_version;
        
        // Create health badge
        let healthBadge;
        const score = dep.health_score;
        if (score > 80) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">${score}</span>`;
        } else if (score > 60) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">${score}</span>`;
        } else if (score > 40) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">${score}</span>`;
        } else if (score > 20) {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">${score}</span>`;
        } else {
            healthBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">${score}</span>`;
        }
        
        // Create risk badge
        let riskBadge;
        const risk = dep.abandonment_risk;
        if (risk === 'Low') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Low</span>`;
        } else if (risk === 'Medium') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Medium</span>`;
        } else if (risk === 'High') {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">High</span>`;
        } else {
            riskBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Critical</span>`;
        }
        
        // Create security badge
        let securityBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Secure</span>`;
        
        if (dep.has_vulnerabilities) {
            const vulnCount = dep.vulnerability_count || 0;
            let severityClass = "bg-yellow-100 text-yellow-800";
            
            // Check for critical or high severity vulnerabilities
            if (dep.vulnerability_details && dep.vulnerability_details.some(v => v.severity === "Critical")) {
                severityClass = "bg-red-100 text-red-800 font-bold";
            } else if (dep.vulnerability_details && dep.vulnerability_details.some(v => v.severity === "High")) {
                severityClass = "bg-red-100 text-red-800";
            } else if (dep.vulnerability_details && dep.vulnerability_details.some(v => v.severity === "Medium")) {
                severityClass = "bg-orange-100 text-orange-800";
            }
            
            securityBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${severityClass}">
                ${vulnCount} ${vulnCount === 1 ? 'vulnerability' : 'vulnerabilities'}
            </span>`;
            
            // Add safe version recommendation if available
            if (dep.safe_upgrade_version) {
                securityBadge += `<div class="mt-1 text-xs text-green-600">Fix in v${dep.safe_upgrade_version}</div>`;
            }
        }
        
        // Create license badge
        const license = dep.license || 'Unknown';
        const simpleLicense = simplifyLicense(license);
        
        let licenseClass = 'bg-gray-100 text-gray-800';
        if (licensePolicy.restricted.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase()))) {
            licenseClass = 'bg-red-100 text-red-800';
        } else if (licensePolicy.reviewRequired.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase()))) {
            licenseClass = 'bg-yellow-100 text-yellow-800';
        } else if (licensePolicy.allowed.some(l => simpleLicense.toLowerCase().includes(l.toLowerCase()))) {
            licenseClass = 'bg-green-100 text-green-800';
        }
        
        // Replace the licenseBadge creation code with this more compact version
const licenseBadge = `
<span class="px-2 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${licenseClass}">
    ${simpleLicense}
    <button class="ml-1 focus:outline-none" onclick="showLicenseModal('${dep.package_name}', '${escape(license)}')">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
    </button>
</span>
`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${dep.package_name}</div>
                <div class="text-sm text-gray-500">${dep.project}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${dep.version || 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm ${needsUpdate ? 'font-semibold text-yellow-600' : 'text-gray-500'}">
                    ${dep.latest_version || 'Unknown'}
                    ${needsUpdate ? '<span class="ml-1">→</span>' : ''}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${securityBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${healthBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${riskBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap license-cell">
                ${licenseBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${dep.last_updated ? new Date(dep.last_updated).toLocaleDateString() : 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <a href="/details.html?package=${dep.package_name}&project=${dep.project}" class="text-indigo-600 hover:text-indigo-900">Details</a>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function showLicenseDetails(license) {
    // Use modal instead of tooltip for very long licenses
    if (license.length > 500) {
        document.getElementById('licenseContent').textContent = license;
        document.getElementById('licenseModal').classList.remove('hidden');
        return;
    }
    
    // Create a tooltip for shorter licenses
    let tooltip = document.getElementById('licenseTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'licenseTooltip';
        tooltip.className = 'license-tooltip';
        document.body.appendChild(tooltip);
    }
    
    tooltip.textContent = license;
    tooltip.style.display = 'block';
    
    // Position the tooltip near cursor
    document.addEventListener('mousemove', positionTooltip);
    
    // Hide tooltip when clicking elsewhere
    document.addEventListener('click', hideTooltip);
}

function positionTooltip(e) {
    const tooltip = document.getElementById('licenseTooltip');
    if (!tooltip) return;
    
    // Position tooltip near the cursor
    const x = e.clientX + 10;
    const y = e.clientY + 10;
    
    // Adjust position to keep tooltip within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    
    // Adjust horizontal position
    const actualX = x + tooltipWidth > viewportWidth 
        ? Math.max(0, viewportWidth - tooltipWidth - 10) 
        : x;
    
    // Adjust vertical position
    const actualY = y + tooltipHeight > viewportHeight 
        ? Math.max(0, viewportHeight - tooltipHeight - 10) 
        : y;
    
    tooltip.style.left = actualX + 'px';
    tooltip.style.top = actualY + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('licenseTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
        document.removeEventListener('mousemove', positionTooltip);
        document.removeEventListener('click', hideTooltip);
    }
}

function applyFilters() {
    // Get filter values
    filters.status = document.getElementById('statusFilter').value;
    filters.risk = document.getElementById('riskFilter').value;
    filters.security = document.getElementById('securityFilter').value;
    filters.search = document.getElementById('searchFilter').value.toLowerCase();
    
    // Filter dependencies based on project selection
    let deps = allDependencies;
    if (currentProject !== 'all') {
        deps = deps.filter(dep => dep.project === currentProject);
    }
    
    // Apply status filter
    if (filters.status === 'upToDate') {
        deps = deps.filter(dep => !dep.needs_update);
    } else if (filters.status === 'needsUpdate') {
        deps = deps.filter(dep => dep.needs_update);
    }
    
    // Apply risk filter
    if (filters.risk !== 'all') {
        deps = deps.filter(dep => dep.abandonment_risk === filters.risk);
    }
    
    // Apply security filter
    if (filters.security === 'vulnerable') {
        deps = deps.filter(dep => dep.has_vulnerabilities);
    } else if (filters.security === 'secure') {
        deps = deps.filter(dep => !dep.has_vulnerabilities);
    }
    
    // Apply search filter
    if (filters.search) {
        deps = deps.filter(dep => 
            (dep.package_name && dep.package_name.toLowerCase().includes(filters.search)) ||
            (dep.license && dep.license.toLowerCase().includes(filters.search)) ||
            (dep.repository_url && dep.repository_url.toLowerCase().includes(filters.search))
        );
    }
    
    filteredDependencies = deps;
    updateDependenciesTable();
    
    // Update metrics based on filtered data
    updateChartData();
}

function resetFilters() {
    // Reset filter form
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('riskFilter').value = 'all';
    document.getElementById('securityFilter').value = 'all';
    document.getElementById('searchFilter').value = '';
    
    // Apply filters (which will reset to original state)
    applyFilters();
}

function updateChartData() {
    // Update health distribution chart
    const healthDistribution = [0, 0, 0, 0, 0];
    filteredDependencies.forEach(dep => {
        const score = dep.health_score;
        if (score <= 20) healthDistribution[0]++;
        else if (score <= 40) healthDistribution[1]++;
        else if (score <= 60) healthDistribution[2]++;
        else if (score <= 80) healthDistribution[3]++;
        else healthDistribution[4]++;
    });
    
    healthChart.data.datasets[0].data = healthDistribution;
    healthChart.update();
    
    // Update risk assessment chart
    const riskDistribution = [0, 0, 0, 0]; // Low, Medium, High, Critical
    filteredDependencies.forEach(dep => {
        const risk = dep.abandonment_risk;
        if (risk === 'Low') riskDistribution[0]++;
        else if (risk === 'Medium') riskDistribution[1]++;
        else if (risk === 'High') riskDistribution[2]++;
        else if (risk === 'Critical') riskDistribution[3]++;
    });
    
    riskChart.data.datasets[0].data = riskDistribution;
    riskChart.update();
    
    // Update license chart
    updateLicenseChart();
}

async function importRequirementsFile() {
    const fileInput = document.getElementById('requirementsFile');
    const projectName = document.getElementById('projectName').value;
    
    if (!fileInput.files.length) {
        showNotification('Error', 'Please select a file to upload.', 'error');
        return;
    }
    
    if (!projectName) {
        showNotification('Error', 'Please enter a project name.', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Read the file
    const reader = new FileReader();
    reader.onload = async function(e) {
        const content = e.target.result;
        const packages = parseRequirementsFile(content);
        
        // Upload to server (in a real implementation)
        try {
            /* In a real implementation, this would call the API:
            const response = await fetch('/api/import_requirements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    project: projectName,
                    packages: packages
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to import requirements file');
            }
            
            const result = await response.json();
            */
            
            // Simulated success
            // Close modal
            document.getElementById('importModal').classList.add('hidden');
            
            // Show success notification
            showNotification('Success', `Imported ${packages.length} packages from requirements.txt. Processing...`, 'success');
            
            // Reload data (in a real implementation)
            setTimeout(() => {
                showNotification('Import Complete', 'Successfully processed imported dependencies.', 'success');
            }, 2000);
            
        } catch (error) {
            console.error('Error importing requirements:', error);
            showNotification('Error', 'Failed to import requirements file. Please try again.', 'error');
        }
    };
    
    reader.readAsText(file);
}



function parseRequirementsFile(content) {
    // Basic parsing of requirements.txt file
    const lines = content.split('\n');
    const packages = [];
    
    for (let line of lines) {
        // Remove comments
        line = line.split('#')[0].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Skip constraint lines
        if (line.startsWith('-c') || 
            line.startsWith('--constraint') || 
            line.startsWith('-r') || 
            line.startsWith('--requirement')) {
            continue;
        }
        
        // Handle different package formats
        let packageName, version;
        
        // Format: package==version
        if (line.includes('==')) {
            [packageName, version] = line.split('==');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '=='
            });
        }
        // Format: package>=version
        else if (line.includes('>=')) {
            [packageName, version] = line.split('>=');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '>='
            });
        }
        // Format: package<=version
        else if (line.includes('<=')) {
            [packageName, version] = line.split('<=');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '<='
            });
        }
        // Format: package>version
        else if (line.includes('>')) {
            [packageName, version] = line.split('>');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '>'
            });
        }
        // Format: package<version
        else if (line.includes('<')) {
            [packageName, version] = line.split('<');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '<'
            });
        }
        // Format: package~=version
        else if (line.includes('~=')) {
            [packageName, version] = line.split('~=');
            packages.push({
                name: packageName.trim(),
                version: version.trim(),
                constraint: '~='
            });
        }
        // Format: package[extras]
        else if (line.includes('[') && line.includes(']')) {
            const basePackage = line.split('[')[0].trim();
            packages.push({
                name: basePackage,
                version: null,
                constraint: null
            });
        }
        // Format: just a package name
        else {
            packages.push({
                name: line.trim(),
                version: null,
                constraint: null
            });
        }
    }
    
    return packages;
}
