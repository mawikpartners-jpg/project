import './style.css';
import { Device } from '@twilio/voice-sdk';
import { createClient } from '@supabase/supabase-js';

// Check if Twilio is enabled
const isTwilioEnabled = import.meta.env.VITE_ENABLE_TWILIO === 'true';

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

// Hide Twilio-related UI if disabled
if (!isTwilioEnabled) {
  console.log('Twilio wyłączone - ukrywanie interfejsu dzwonienia');
  if (els.phoneInterface) els.phoneInterface.style.display = 'none';
  if (els.recordingsSection) els.recordingsSection.style.display = 'none';

  // Update connection status
  if (els.connectionIndicator && els.connectionText) {
    els.connectionIndicator.className = 'status-indicator ready';
    els.connectionText.textContent = 'Tryb zarządzania (dzwonienie wyłączone)';
  }

  // Keep auth section visible but modify the message
  if (els.authSection) {
    const authHeader = els.authSection.querySelector('.auth-header h2');
    if (authHeader) {
      authHeader.textContent = 'Logowanie do systemu zarządzania';
    }
    const authSubtext = document.createElement('p');
    authSubtext.style.cssText = 'text-align: center; color: #666; margin-top: 10px; font-size: 14px;';
    authSubtext.textContent = 'Funkcja dzwonienia przez Twilio jest wyłączona';
    const authHeaderDiv = els.authSection.querySelector('.auth-header');
    if (authHeaderDiv && !authHeaderDiv.querySelector('p')) {
      authHeaderDiv.appendChild(authSubtext);
    }
    const callerIdGroup = els.authSection.querySelector('label[for="callerId"]')?.parentElement;
    if (callerIdGroup) {
      callerIdGroup.style.display = 'none';
    }
  }
}

// Edge Function URL helper
const getEdgeFunctionUrl = (functionName) => {
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

// Edge Function headers helper
const getEdgeFunctionHeaders = () => {
  return {
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json'
  };
};

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
    const response = await fetch(getEdgeFunctionUrl('leads'), {
      method: 'POST',
      headers: getEdgeFunctionHeaders(),
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
    const response = await fetch(getEdgeFunctionUrl('leads'), {
      method: 'POST',
      headers: getEdgeFunctionHeaders(),
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
    const response = await fetch(getEdgeFunctionUrl('leads'), {
      method: 'POST',
      headers: getEdgeFunctionHeaders(),
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
    const response = await fetch(getEdgeFunctionUrl('admin-users'), {
      method: 'POST',
      headers: getEdgeFunctionHeaders(),
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
  console.log('[fetchJson] Calling:', url);
  const res = await fetch(url, {
    headers: getEdgeFunctionHeaders()
  });
  console.log('[fetchJson] Response status:', res.status);
  const text = await res.text();
  console.log('[fetchJson] Response text:', text.slice(0, 500));
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log('[fetchJson] Parsed JSON:', json);
    return json;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0,200)}`);
  }
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
    // Skip Twilio initialization if disabled
    if (!isTwilioEnabled) {
      console.log('[Login] Twilio wyłączone - pomijanie inicjalizacji urządzenia');
      state.identity = identity;
      state.password = password;

      // Get user info directly (skip token generation)
      const userInfoUrl = `${getEdgeFunctionUrl('user-info')}?identity=${encodeURIComponent(identity)}&password=${encodeURIComponent(password)}`;
      console.log('[Login] Requesting user info from:', userInfoUrl);
      const userInfo = await fetchJson(userInfoUrl);
      console.log('[Login] User info response:', userInfo);

      if (!userInfo || !userInfo.role) {
        throw new Error('Nie otrzymano informacji o użytkowniku');
      }

      const { role } = userInfo;
      state.userRole = role;

      // Show panels based on role without phone interface
      if (state.userRole === 'admin') {
        els.adminPanel.classList.remove('hidden');
        loadUsers();
      } else if (state.userRole === 'manager') {
        els.managerPanel.classList.remove('hidden');
        loadLeads(state.userRole);
        loadUsersForAssignment();
      } else { // caller
        els.callerPanel.classList.remove('hidden');
        loadLeads(state.userRole);
      }

      console.log('[Login] Zalogowano pomyślnie bez Twilio');
      return;
    }

    setStatus('Pobieranie tokena dostępu...');
    // 1) Token with password
    const tokenUrl = `${getEdgeFunctionUrl('token')}?identity=${encodeURIComponent(identity)}&password=${encodeURIComponent(password)}`;
    console.log('[Login] Requesting token from:', tokenUrl);
    const tokenResponse = await fetchJson(tokenUrl);
    console.log('[Login] Token response:', tokenResponse);

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Nie otrzymano tokena z serwera');
    }

    const { token } = tokenResponse;

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

    // Wire device events with error handling
    let deviceError = null;
    const errorPromise = new Promise((_, reject) => {
      state.device.on('error', e => {
        console.error('[Device] Error event:', e);
        deviceError = e;
        setStatus(`Błąd urządzenia: ${e.message}`);
        reject(e);
      });
    });

    // Register device and race against error event
    try {
      await Promise.race([
        state.device.register().then(() => new Promise(resolve => setTimeout(resolve, 1000))),
        errorPromise
      ]);
    } catch (err) {
      throw err;
    }

    // Check if an error occurred during registration
    if (deviceError) {
      throw deviceError;
    }

    // 3) Get user info (role and caller IDs)
    const userInfoUrl = `${getEdgeFunctionUrl('user-info')}?identity=${encodeURIComponent(identity)}&password=${encodeURIComponent(password)}`;
    console.log('[Login] Requesting user info from:', userInfoUrl);
    const userInfo = await fetchJson(userInfoUrl);
    console.log('[Login] User info response:', userInfo);

    if (!userInfo || !userInfo.role) {
      throw new Error('Nie otrzymano informacji o użytkowniku');
    }

    const { role, callerIds } = userInfo;
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
    console.error('Login error:', e);
    console.error('Error stack:', e?.stack);
    console.error('Error type:', typeof e);

    // Safe error object logging
    if (e !== null && e !== undefined) {
      try {
        console.error('Error object:', JSON.stringify(e, Object.getOwnPropertyNames(e)));
      } catch (jsonError) {
        console.error('Could not stringify error');
      }
    }

    let errorMessage = 'Nieznany błąd';
    if (e && typeof e === 'object') {
      errorMessage = e.message || e.toString() || 'Nieznany błąd';
    } else if (typeof e === 'string') {
      errorMessage = e;
    } else if (e === null || e === undefined) {
      errorMessage = 'Błąd bez szczegółów (sprawdź konsolę)';
    } else {
      errorMessage = String(e);
    }

    setStatus(`Logowanie nieudane: ${errorMessage}`);

    // Run diagnostics
    try {
      const diagUrl = `${getEdgeFunctionUrl('diagnose')}`;
      console.log('[Login] Running diagnostics...');
      const diagResult = await fetchJson(diagUrl);
      console.log('[Login] Diagnostics result:', diagResult);

      // Check if it's a configuration error
      if (!diagResult.allConfigured) {
        const missing = diagResult.missingVariables.join('\n• ');
        alert(`⚠️ Konfiguracja Twilio jest niepełna!\n\nBrakujące zmienne:\n• ${missing}\n\nSkontaktuj się z administratorem, aby skonfigurować zmienne środowiskowe w Supabase Dashboard.`);
      } else if (errorMessage.includes('Twilio configuration missing')) {
        alert(`⚠️ Konfiguracja Twilio brakuje!\n\nMusisz skonfigurować zmienne środowiskowe w Supabase:\n• TWILIO_ACCOUNT_SID\n• TWILIO_API_KEY_SID\n• TWILIO_API_KEY_SECRET\n• TWIML_APP_SID\n\nPrzejdź do: Supabase Dashboard → Project Settings → Edge Functions → Secrets`);
      } else if (errorMessage.includes('Invalid credentials')) {
        alert('Nieprawidłowa nazwa użytkownika lub hasło.');
      } else if (errorMessage.includes('AccessTokenInvalid') || errorMessage.includes('20101')) {
        alert(`⚠️ Token Twilio jest nieprawidłowy (Błąd 20101)\n\nWszystkie zmienne środowiskowe są ustawione, ale Twilio odrzuca token.\n\nMożliwe przyczyny:\n• TWILIO_API_KEY_SID lub TWILIO_API_KEY_SECRET są nieprawidłowe\n• API Key nie należy do tego samego konta co TWILIO_ACCOUNT_SID\n• TWIML_APP_SID nie istnieje lub nie jest skonfigurowany\n• API Key został usunięty lub dezaktywowany w Twilio\n\nSprawdź konfigurację w Twilio Console:\n1. API Keys: https://console.twilio.com/us1/develop/voice/manage/api-keys\n2. TwiML Apps: https://console.twilio.com/us1/develop/voice/manage/twiml-apps\n\nUpewnij się, że wszystkie wartości pochodzą z tego samego konta Twilio.`);
      } else {
        alert(`Logowanie nieudane: ${errorMessage}`);
      }
    } catch (diagError) {
      console.error('Diagnostics error:', diagError);
      // Fallback to basic error message
      if (errorMessage.includes('Twilio configuration missing')) {
        alert(`⚠️ Konfiguracja Twilio brakuje!\n\nMusisz skonfigurować zmienne środowiskowe w Supabase.`);
      } else if (errorMessage.includes('AccessTokenInvalid') || errorMessage.includes('20101')) {
        alert(`⚠️ Token Twilio jest nieprawidłowy (Błąd 20101)\n\nSprawdź konfigurację Twilio API Keys i TwiML App SID.\n\nUpewnij się, że wszystkie klucze pochodzą z tego samego konta Twilio.`);
      } else {
        alert(`Logowanie nieudane: ${errorMessage}`);
      }
    }
  }
});

// Enhanced call functionality with better UI feedback
document.getElementById('call')?.addEventListener('click', async () => {
  if (!isTwilioEnabled) {
    alert('Funkcja dzwonienia jest wyłączona (Twilio nieaktywne)');
    return;
  }

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
    
    const res = await fetch(`${getEdgeFunctionUrl('recordings')}?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&days=30`, {
      headers: getEdgeFunctionHeaders()
    });
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
    const response = await fetch(`${getEdgeFunctionUrl('admin-users')}?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=list`, {
      headers: getEdgeFunctionHeaders()
    });
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
    const response = await fetch(`${getEdgeFunctionUrl('leads')}?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=get`, {
      headers: getEdgeFunctionHeaders()
    });
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
    const response = await fetch(`${getEdgeFunctionUrl('admin-users')}?identity=${encodeURIComponent(state.identity)}&password=${encodeURIComponent(state.password)}&action=list`, {
      headers: getEdgeFunctionHeaders()
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const { users } = await response.json();
    allUsers = users || [];
  } catch (e) {
    console.error('Error loading users for assignment:', e);
    console.error('Błąd ładowania użytkowników do przypisania:', e);
  }
}