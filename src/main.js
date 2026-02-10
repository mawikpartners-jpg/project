import './style.css';
import { Device } from '@twilio/voice-sdk';
import { createClient } from '@supabase/supabase-js';

// Enhanced UI elements
const els = {
  number: document.getElementById('number'),
  call: document.getElementById('call'),
  hangup: document.getElementById('hangup'),
  mute: document.getElementById('mute'),
  status: document.getElementById('status'),
  clear: document.getElementById('clear'),
  connectionIndicator: document.getElementById('connection-indicator'),
  connectionText: document.getElementById('connection-text'),
  identity: document.getElementById('identity'),
  login: document.getElementById('login'),
  callerId: document.getElementById('callerId'),
  authSection: document.getElementById('authSection'),
  phoneInterface: document.getElementById('phoneInterface'),
  recordingsSection: document.getElementById('recordingsSection'),
  footerInfo: document.getElementById('footerInfo'),
  loadCalls: document.getElementById('loadCalls'),
  callList: document.getElementById('callList'),
  adminPanel: document.getElementById('adminPanel'),
  managerPanel: document.getElementById('managerPanel'),
  callerPanel: document.getElementById('callerPanel'),
  usersList: document.getElementById('usersList'),
  managerLeadsList: document.getElementById('managerLeadsList'),
  leadsList: document.getElementById('leadsList')
};

// Application state
const state = { 
  device: null, 
  call: null, 
  identity: '', 
  password: '', 
  callerId: '', 
  muted: false,
  userRole: 'caller' // Default role
};

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Konfiguracja Supabase nie znaleziona. Niektóre funkcje mogą nie działać.');
}

// Global users list for dropdowns
let allUsers = [];

// Global function for creating leads (Manager)
window.createLead = async function() {
  const phoneNumber = document.getElementById('leadPhoneNumber').value.trim();
  const leadInfo = document.getElementById('leadInfo').value.trim();
  const assignedTo = document.getElementById('assignToCaller').value.trim();
  
  if (!phoneNumber || !leadInfo) {
    alert('Numer telefonu i informacje o leadzie są wymagane');
    return;
  }
  
  try {
    const response = await fetch('/.netlify/functions/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber, leadInfo, assignedTo, identity: state.identity, password: state.password,
        action: 'create'
      })
    });
    
    if (response.ok) {
      // Clear form
      document.getElementById('leadPhoneNumber').value = '';
      document.getElementById('leadInfo').value = '';
      document.getElementById('assignToCaller').value = '';
      
      // Reload leads
      loadLeads(state.userRole);
      
      alert('Lead utworzony pomyślnie!');
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (e) {
    console.error('Error creating lead:', e);
    alert('Błąd podczas tworzenia leada: ' + e.message);
  }
};

// Global function for updating lead status/notes (Caller)
window.updateLead = async function(leadId, notes, status) {
  try {
    const response = await fetch('/.netlify/functions/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId, notes, status, identity: state.identity, password: state.password,
        action: 'update'
      })
    });
    
    if (response.ok) {
      console.log('Lead zaktualizowany pomyślnie!');
      // Show visual feedback
      const saveBtn = document.querySelector(`[onclick*="${leadId}"].btn-save`);
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Zapisano';
        saveBtn.classList.add('saved');
        setTimeout(() => {
          saveBtn.innerHTML = '<i class="fas fa-save"></i> Zapisz';
          saveBtn.classList.remove('saved');
        }, 2000);
      }
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (e) {
    console.error('Error updating lead:', e);
    alert('Błąd podczas aktualizacji leada: ' + e.message);
  }
};

// Global function for assigning lead (Manager)
window.assignLead = async function(leadId, assignedTo) {
  try {
    const response = await fetch('/.netlify/functions/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId, assignedTo, identity: state.identity, password: state.password,
        action: 'assign'
      })
    });
    
    if (response.ok) {
      console.log('Lead przypisany pomyślnie!');
      loadLeads(state.userRole); // Reload leads to reflect assignment
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (e) {
    console.error('Error assigning lead:', e);
    alert('Błąd podczas przypisania leada: ' + e.message);
  }
};

// Global function for making a call from a lead card
window.callLead = function(phoneNumber) {
  els.number.value = phoneNumber;
  els.call.click();
};

// Global function for creating a new user (Admin)
window.createUser = async function() {
  const newIdentity = document.getElementById('newIdentity').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();
  const newRole = document.getElementById('newRole').value.trim();
  const newCallerIds = document.getElementById('newCallerIds').value.trim().split(',').map(id => id.trim()).filter(id => id !== '');

  if (!newIdentity || !newPassword || !newRole) {
    alert('Tożsamość, hasło i rola są wymagane.');
    return;
  }

  try {
    const response = await fetch('/.netlify/functions/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newIdentity, newPassword, role: newRole, callerIds: newCallerIds,
        identity: state.identity, password: state.password,
        action: 'create'
      })
    });

    if (response.ok) {
      alert('Użytkownik utworzony pomyślnie!');
      document.getElementById('newUserForm').reset();
      loadUsers(); // Reload user list
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (e) {
    console.error('Error creating user:', e);
    alert('Błąd podczas tworzenia użytkownika: ' + e.message);
  }
};

// CSV file upload handler
window.handleFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      const [phoneNumber, leadInfo, assignedTo] = line.split(',').map(item => item.trim());
      if (phoneNumber && leadInfo) {
        // Set form values and call createLead
        document.getElementById('leadPhoneNumber').value = phoneNumber;
        document.getElementById('leadInfo').value = leadInfo;
        document.getElementById('assignToCaller').value = assignedTo || '';
        
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between creations
        await window.createLead();
      }
    }
    alert('Leady przesłane pomyślnie!');
    event.target.value = ''; // Clear file input
  };
  reader.readAsText(file);
};

// Enhanced status management
function setStatus(msg) {
  const statusEl = els.status;
  const statusText = statusEl.querySelector('.status-text');
  const statusIcon = statusEl.querySelector('.status-icon');
  
  if (statusText) {
    statusText.textContent = msg;
  } else {
    statusEl.innerHTML = `<i class="fas fa-circle-notch fa-spin status-icon"></i><span class="status-text">${msg}</span>`;
  }
  
  // Update status classes based on message content
  statusEl.className = 'call-status';
  if (msg.includes('Ready')) {
    statusEl.classList.add('ready');
    updateConnectionStatus('connected', 'Gotowy');
  } else if (msg.includes('Calling') || msg.includes('Connecting')) {
    statusEl.classList.add('calling');
    updateConnectionStatus('connecting', 'Dzwonienie...');
  } else if (msg.includes('In call')) {
    statusEl.classList.add('in-call');
    updateConnectionStatus('connected', 'W trakcie rozmowy');
  } else if (msg.includes('error') || msg.includes('failed')) {
    statusEl.classList.add('error');
    updateConnectionStatus('error', 'Błąd połączenia');
  } else {
    statusEl.classList.add('connecting');
    updateConnectionStatus('connecting', 'Łączenie...');
  }
  
  console.log('[status]', msg);
}

function updateConnectionStatus(state, text) {
  if (els.connectionIndicator && els.connectionText) {
    els.connectionIndicator.className = `status-indicator ${state}`;
    els.connectionText.textContent = text;
  }
}

// API function
async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${text.slice(0,200)}`); }
}

// Enhanced keypad functionality
function setupKeypad() {
  const keys = document.querySelectorAll('.key[data-digit]');
  keys.forEach(key => {
    key.addEventListener('click', () => {
      const digit = key.dataset.digit;
      const currentValue = els.number.value;
      els.number.value = currentValue + digit;
      
      // Play keypad press sound
      const pressSound = new Audio('/press_button.mp3');
      pressSound.play().catch(e => console.log('Nie można odtworzyć dźwięku klawiatury:', e));
      
      // Add haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      // Visual feedback
      key.style.transform = 'translateY(-1px) scale(1.02)';
      setTimeout(() => {
        key.style.transform = '';
      }, 150);
    });
  });
}

// Clear button functionality
function setupClearButton() {
  if (els.clear) {
    els.clear.addEventListener('click', () => {
      els.number.value = '';
      els.number.focus();
      
      // Visual feedback
      els.clear.style.transform = 'translateY(-50%) scale(0.95)';
      setTimeout(() => {
        els.clear.style.transform = 'translateY(-50%)';
      }, 150);
    });
  }
}

// Enhanced number input formatting
function setupNumberInput() {
  els.number.addEventListener('input', (e) => {
    let value = e.target.value;
    
    // Remove any non-digit characters except + for international format
    value = value.replace(/[^\d+]/g, '');
    
    // Ensure + is only at the beginning
    if (value.includes('+')) {
      const plusIndex = value.indexOf('+');
      if (plusIndex > 0) {
        value = '+' + value.replace(/\+/g, '');
      }
    }
    
    e.target.value = value;
  });
  
  // Add Enter key support for calling
  els.number.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Trigger the call button click
      els.call.click();
    }
  });
  
  // Add focus ring animation
  els.number.addEventListener('focus', () => {
    els.number.parentElement.classList.add('focused');
  });
  
  els.number.addEventListener('blur', () => {
    els.number.parentElement.classList.remove('focused');
  });
}

// Login functionality (updated for Supabase and roles)
els.login?.addEventListener('click', async () => {
  const identity = document.getElementById('identity').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!identity || !password) { 
    alert('Wprowadź tożsamość i hasło'); 
    return;
  }
  
  try {
    setStatus('Pobieranie tokena dostępu...');
    // 1) Token with password
    const { token } = await fetchJson(`/.netlify/functions/token?identity=${encodeURIComponent(identity)}&password=${encodeURIComponent(password)}`);

    // 2) Register Device
    state.identity = identity;
    state.password = password; // Keep password in state for subsequent function calls
    state.device = new Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      sounds: {
        outgoing: '/outgoing.mp3',
        disconnect: '/callend.mp3'
      }
    }); 

    // Wire device events
    state.device.on('error', e => setStatus(`Błąd urządzenia: ${e.message}`));
    await state.device.register();

    // 3) Get user info (role and caller IDs)
    const { role, callerIds } = await fetchJson(`/.netlify/functions/user-info?identity=${encodeURIComponent(identity)}&password=${encodeURIComponent(password)}`);
    state.userRole = role;

    // Populate caller IDs dropdown
    const sel = document.getElementById('callerId');
    sel.innerHTML = (callerIds || []).map(n => `<option value="${n}">${n}</option>`).join('');
    sel.disabled = false;
    state.callerId = callerIds?.[0] || '';
    sel.onchange = () => state.callerId = sel.value;

    // Show/hide panels based on role
    els.authSection.classList.add('hidden');
    els.footerInfo.classList.remove('hidden');
    
    if (state.userRole === 'admin') {
      els.adminPanel.classList.remove('hidden');
      els.phoneInterface.classList.remove('hidden');
      els.recordingsSection.classList.remove('hidden');
      loadUsers();
    } else if (state.userRole === 'manager') {
      els.managerPanel.classList.remove('hidden');
      els.recordingsSection.classList.remove('hidden'); // Managers can see call history
      loadLeads(state.userRole);
      loadUsersForAssignment(); // Load users for assignment dropdown
    } else { // caller
      els.phoneInterface.classList.remove('hidden');
      els.callerPanel.classList.remove('hidden');
      loadLeads(state.userRole);
    }

    // Enable recordings button
    els.loadCalls.disabled = false;

    setStatus(`Gotowy jako ${identity}`);

  } catch (e) {
    console.error(e);
    setStatus(`Logowanie nieudane: ${e.message}`);
    alert(`Logowanie nieudane: ${e.message}`);
  }
});

// Enhanced call functionality with better UI feedback
document.getElementById('call')?.addEventListener('click', async () => {
  const to = document.getElementById('number').value.trim();
  if (!to.startsWith('+')) return setStatus('Wprowadź numer w formacie E.164, np. +15551234567');
  if (!state.device) return setStatus('Najpierw się zaloguj');

  try {
    setStatus('Dzwonienie…');
    const call = await state.device.connect({ params: { To: to, CallerId: state.callerId, Identity: state.identity } });
    state.call = call;
    call.on('accept', () => {
      setStatus('W trakcie rozmowy');
      // Play accepted sound
      const acceptedAudio = new Audio('/accepted.mp3');
      acceptedAudio.play().catch(e => console.log('Nie można odtworzyć dźwięku akceptacji:', e));
    });
    call.on('disconnect', () => { 
      setStatus('Rozmowa zakończona'); 
      resetUI();
    });
    call.on('error', (e) => setStatus(`Błąd połączenia: ${e.message}`));
    
    els.call.disabled = true;
    els.hangup.disabled = false;
    els.mute.disabled = false;
  } catch (e) {
    setStatus(`Nie udało się rozpocząć połączenia: ${e.message}`);
  }
});

// Enhanced hang up with confirmation for active calls
els.hangup.addEventListener('click', () => {
  if (state.call) {
    // Add visual feedback
    els.hangup.style.transform = 'translateY(-1px) scale(1.02)';
    setTimeout(() => {
      els.hangup.style.transform = '';
    }, 150);
    
    state.call.disconnect();
  }
});

// Enhanced mute functionality with visual feedback
els.mute.addEventListener('click', () => {
  if (!state.call) return;
  
  state.muted = !state.muted;
  state.call.mute(state.muted);
  
  const muteText = els.mute.querySelector('span');
  const muteIcon = els.mute.querySelector('i');
  
  if (muteText) muteText.textContent = state.muted ? 'Wyłącz wyciszenie' : 'Wycisz';
  if (muteIcon) muteIcon.className = state.muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  
  els.mute.classList.toggle('muted', state.muted);
  
  // Visual feedback
  els.mute.style.transform = 'translateY(-1px) scale(1.02)';
  setTimeout(() => {
    els.mute.style.transform = '';
  }, 150);
});

function wireCallEvents(call) {
  call.on('accept', () => setStatus('W trakcie rozmowy'));
  call.on('disconnect', () => {
    setStatus('Rozmowa zakończona');
    resetUI();
  });
  call.on('cancel', () => {
    setStatus('Połączenie anulowane');
    resetUI();
  });
  call.on('error', (e) => setStatus(`Błąd połączenia: ${e.message}`));
}

function resetUI() {
  state.call = null;
  state.muted = false;
  els.call.disabled = false;
  els.hangup.disabled = true;
  els.mute.disabled = true;
  
  const muteText = els.mute.querySelector('span');
  const muteIcon = els.mute.querySelector('i');
  
  if (muteText) muteText.textContent = 'Wycisz';
  if (muteIcon) muteIcon.className = 'fas fa-microphone';
  
  els.mute.classList.remove('muted');
  
  updateConnectionStatus('connected', 'Gotowy');
}

// Call history functionality
els.loadCalls.addEventListener('click', async () => {
  if (!state.identity || !state.password) {
    alert('Najpierw się zaloguj');
    return;
  }
  
  try {
    els.loadCalls.disabled = true;
    els.loadCalls.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Ładowanie...</span>';
    els.callList.innerHTML = 'Ładowanie historii połączeń...';
    
    const res = await fetch(`/.netlify/functions/recordings?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&days=30`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const json = await res.json();
    renderCallHistory(json.items || []);
  } catch (e) {
    els.callList.innerHTML = `Błąd ładowania historii połączeń: ${e.message}`;
  } finally {
    els.loadCalls.disabled = false;
    els.loadCalls.innerHTML = '<i class="fas fa-history"></i><span>Załaduj historię połączeń (30 dni)</span>';
  }
});

function renderCallHistory(items) {
  const box = els.callList;
  if (!items.length) { 
    box.innerHTML = '<p>Nie znaleziono połączeń.</p>'; 
    return; 
  }
  
  const formatDuration = (seconds) => {
    if (!seconds) return 'Nieznany';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const truncateCallSid = (sid) => {
    if (!sid) return 'Nieznany';
    return '…' + sid.slice(-8);
  };
  
  box.innerHTML = `
    <table class="call-table">
      <thead>
        <tr>
          <th>Data/Godzina</th>
          <th>Czas trwania</th>
          <th>Od</th>
          <th>Do</th>
          <th>SID połączenia</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td>${new Date(it.startTime).toLocaleString()}</td>
            <td>${formatDuration(it.durationSec)}</td>
            <td>${it.from || 'Nieznany'}</td>
            <td>${it.to || 'Nieznany'}</td>
            <td title="${it.callSid || 'Nieznany'}">${truncateCallSid(it.callSid)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Add CSS for shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
  }
  
  .focused {
    transform: scale(1.02);
  }
`;
document.head.appendChild(style);

// Initialize enhanced features
setupKeypad();
setupClearButton();
setupNumberInput();

// Admin Panel: Load Users
async function loadUsers() {
  if (state.userRole !== 'admin') return;
  els.usersList.innerHTML = 'Ładowanie użytkowników...';
  try {
    const response = await fetch(`/.netlify/functions/admin-users?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=list`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const { users } = await response.json();
    renderUsers(users);
  } catch (e) {
    console.error('Error loading users:', e);
    els.usersList.innerHTML = `<p class="error-message">Błąd ładowania użytkowników: ${e.message}</p>`;
  }
}

function renderUsers(users) {
  if (!users || users.length === 0) {
    els.usersList.innerHTML = '<p>Nie znaleziono użytkowników.</p>';
    return;
  }
  els.usersList.innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Tożsamość</th>
          <th>Rola</th>
          <th>Identyfikatory dzwoniącego</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(user => `
          <tr>
            <td>${user.identity}</td>
            <td><span class="status-badge status-${user.role}">${user.role}</span></td>
            <td>${user.caller_ids ? user.caller_ids.join(', ') : 'Brak'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Manager/Caller Panel: Load Leads
async function loadLeads(role) {
  if (role !== 'manager' && role !== 'caller') return;
  const targetList = role === 'manager' ? els.managerLeadsList : els.leadsList;
  if (!targetList) return;
  
  targetList.innerHTML = 'Ładowanie leadów...';
  try {
    const response = await fetch(`/.netlify/functions/leads?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=get`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const { leads } = await response.json();
    if (role === 'manager') {
      renderManagerLeads(leads);
    } else {
      renderCallerLeads(leads);
    }
  } catch (e) {
    console.error('Error loading leads:', e);
    targetList.innerHTML = `<p class="error-message">Błąd ładowania leadów: ${e.message}</p>`;
  }
}

function renderManagerLeads(leads) {
  if (!leads || leads.length === 0) {
    els.managerLeadsList.innerHTML = '<p>Nie znaleziono leadów.</p>';
    return;
  }
  els.managerLeadsList.innerHTML = `
    <table class="leads-table">
      <thead>
        <tr>
          <th>Numer telefonu</th>
          <th>Informacje</th>
          <th>Przypisany do</th>
          <th>Status</th>
          <th>Notatki</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${leads.map(lead => `
          <tr>
            <td class="lead-phone">${lead.phone_number}</td>
            <td>${lead.lead_info}</td>
            <td>
              <select onchange="assignLead('${lead.id}', this.value)">
                <option value="">Nieprzypisany</option>
                ${allUsers.filter(user => user.role === 'caller').map(user => `<option value="${user.identity}" ${lead.assigned_to === user.identity ? 'selected' : ''}>${user.identity}</option>`).join('')}
              </select>
            </td>
            <td><span class="status-badge status-${lead.status}">${lead.status}</span></td>
            <td>${lead.notes || 'Brak notatek'}</td>
            <td><button onclick="callLead('${lead.phone_number}')" class="btn-call"><i class="fas fa-phone"></i> Zadzwoń</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCallerLeads(leads) {
  if (!leads || leads.length === 0) {
    els.leadsList.innerHTML = '<p>Brak leadów przypisanych do Ciebie.</p>';
    return;
  }
  els.leadsList.innerHTML = `
    <div class="leads-grid">
      ${leads.map(lead => `
        <div class="lead-card">
          <div class="lead-header">
            <span class="lead-phone">${lead.phone_number}</span>
            <span class="status-badge status-${lead.status}">${lead.status}</span>
          </div>
          <div class="lead-info">
            <strong>Informacje:</strong>
            <p>${lead.lead_info}</p>
          </div>
          <div class="lead-notes">
            <label for="notes-${lead.id}">Notatki:</label>
            <textarea id="notes-${lead.id}" class="lead-notes-input">${lead.notes || ''}</textarea>
          </div>
          <div class="lead-actions">
            <select id="status-${lead.id}" class="status-select">
              <option value="new" ${lead.status === 'new' ? 'selected' : ''}>Nowy</option>
              <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Skontaktowano</option>
              <option value="interested" ${lead.status === 'interested' ? 'selected' : ''}>Zainteresowany</option>
              <option value="not-interested" ${lead.status === 'not-interested' ? 'selected' : ''}>Niezainteresowany</option>
              <option value="callback" ${lead.status === 'callback' ? 'selected' : ''}>Oddzwonić</option>
              <option value="completed" ${lead.status === 'completed' ? 'selected' : ''}>Zakończono</option>
            </select>
            <button onclick="callLead('${lead.phone_number}')" class="btn-call"><i class="fas fa-phone"></i> Zadzwoń</button>
            <button onclick="updateLead('${lead.id}', document.getElementById('notes-${lead.id}').value, document.getElementById('status-${lead.id}').value)" class="btn-save"><i class="fas fa-save"></i> Zapisz</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Load users for assignment dropdown (Manager)
async function loadUsersForAssignment() {
  if (state.userRole !== 'manager') return;
  try {
    const response = await fetch(`/.netlify/functions/admin-users?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=list`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const { users } = await response.json();
    allUsers = users || [];
  } catch (e) {
    console.error('Error loading users for assignment:', e);
    console.error('Błąd ładowania użytkowników do przypisania:', e);
  }
}