const API_URL = 'https://youtube-analytics-pro.onrender.com/api';

// UI Elements
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');
const currentUserLabel = document.getElementById('currentUser');

const summaryTableBody = document.querySelector('#summaryTable tbody');
const channelTableBody = document.querySelector('#channelTable tbody');

let barChartInstance = null;
let donutChartInstance = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkAuthState();
  
  loginBtn.addEventListener('click', () => handleAuth('login'));
  registerBtn.addEventListener('click', () => handleAuth('register'));
  logoutBtn.addEventListener('click', handleLogout);

  // Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.remove('hidden');
    });
  });
});

// Auth Logic
function checkAuthState() {
  chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (state) => {
    if (state && state.accessToken) {
      showDashboard(state.username, state.accessToken);
    } else {
      showLogin();
    }
  });
}

async function handleAuth(action) {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  
  if (!username || !password) {
    loginError.innerText = 'Username and password required';
    return;
  }

  loginBtn.disabled = true;
  registerBtn.disabled = true;
  loginError.innerText = '';

  try {
    const res = await fetch(`${API_URL}/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      await chrome.storage.local.set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        username: data.username
      });
      showDashboard(data.username, data.accessToken);
    } else {
      loginError.innerText = data.message || 'Authentication failed';
    }
  } catch (error) {
    loginError.innerText = 'Server error. Is the backend running?';
  } finally {
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
}

function handleLogout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showLogin();
  });
}

// UI State Management
function showLogin() {
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
}

function showDashboard(username, accessToken) {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  currentUserLabel.innerText = `Hi, ${username}`;
  
  fetchDashboardStats(accessToken);
}

// Data Fetching and Rendering
let currentDashboardData = null;

async function fetchDashboardStats(token) {
  try {
    const res = await fetch(`${API_URL}/stats/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      currentDashboardData = await res.json();
      renderDashboard(currentDashboardData);
    } else if (res.status === 401) {
      handleLogout(); // Token expired and background script didn't refresh it
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

// Live Update Listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LIVE_TICK' && currentDashboardData) {
    const { delta, channel } = msg.data;
    
    // Update summary stats
    currentDashboardData.summary.today.watchTime += delta;
    currentDashboardData.summary.total.watchTime += delta;
    
    // Update channel stats
    const ch = currentDashboardData.topChannels.find(c => c.channel === channel);
    if (ch) {
      ch.totalWatchTime += delta;
    } else {
      // Add new channel temporarily to top channels for live view
      currentDashboardData.topChannels.push({ channel, totalWatchTime: delta });
    }
    
    // Re-render
    renderDashboard(currentDashboardData);
  }
});

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function renderDashboard(data) {
  renderSummaryTable(data.summary);
  renderChannelTable(data.topChannels);
  renderBarChart(data.dailyStats);
  renderDonutChart(data.topChannels);
}

function renderSummaryTable(summary) {
  summaryTableBody.innerHTML = `
    <tr><td>Today</td><td>${summary.today.videosWatched}</td><td>${formatTime(summary.today.watchTime)}</td></tr>
    <tr><td>Yesterday</td><td>${summary.yesterday.videosWatched}</td><td>${formatTime(summary.yesterday.watchTime)}</td></tr>
    <tr><td>This Week</td><td>${summary.thisWeek.videosWatched}</td><td>${formatTime(summary.thisWeek.watchTime)}</td></tr>
    <tr><td>This Month</td><td>${summary.thisMonth.videosWatched}</td><td>${formatTime(summary.thisMonth.watchTime)}</td></tr>
    <tr><td>Total</td><td>${summary.total.videosWatched}</td><td>${formatTime(summary.total.watchTime)}</td></tr>
  `;
}

function renderChannelTable(channels) {
  channelTableBody.innerHTML = channels.map(c => `
    <tr>
      <td>${c.channel}</td>
      <td>${formatTime(c.totalWatchTime)}</td>
    </tr>
  `).join('');
}

function renderBarChart(dailyStats) {
  const ctx = document.getElementById('barChart').getContext('2d');
  
  // Format for last 7 days
  const labels = dailyStats.map(s => {
    const d = new Date(s.dateString);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  });
  const data = dailyStats.map(s => Math.round(s.totalWatchTime / 60)); // in minutes

  if (barChartInstance) barChartInstance.destroy();
  
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Watch Time (mins)',
        data,
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

function renderDonutChart(channels) {
  const ctx = document.getElementById('donutChart').getContext('2d');
  
  const labels = channels.map(c => c.channel);
  const data = channels.map(c => Math.round(c.totalWatchTime / 60));
  
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  if (donutChartInstance) donutChartInstance.destroy();

  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 }
        }
      }
    }
  });
}
