/**
 * JCC — Jahir Clearance Certificate
 * Complete Application Logic, State Management, and Verification Engine
 */

(function () {
  'use strict';

  // Core Configuration & Identity
  const BUSINESS_CONFIG = {
    portalName: 'JCC — Jahir Clearance Certificate',
    ownerName: 'Mr. Jahir Narjinary',
    contactPhone: '7384512297',
    contactEmail: 'jahirkumarnarjinary@gmail.com',
    adminTargetEmail: 'jahirnarjinary04@gmail.com',
    officeAddress: 'Alipurduar, Kumargram, West Bengal, 736203, India',
    applicationFeeInr: 100,
    defaultUpiId: '7384512297@upi',
    disclaimerText: 'JCC is a privately operated application assistance service. It is not an official government department, police department, or statutory clearance authority. Any certificate issued must not be represented as an official Police Clearance Certificate.'
  };

  // Local Storage Ledger Keys
  const STORAGE_KEYS = {
    USERS: 'jcc_users_registry',
    APPLICATIONS: 'jcc_applications_registry',
    CERTIFICATES: 'jcc_certificates_registry',
    SESSION: 'jcc_active_session',
    SETTINGS: 'jcc_system_settings',
    AUDIT: 'jcc_audit_trail',
    MESSAGES: 'jcc_contact_messages',
    ADMIN_AUTH: 'jcc_admin_credential'
  };

  // Runtime State
  let activeSession = null;
  let cachedApplicantApps = [];
  let cachedAdminApps = [];
  let pendingSubmissionPayload = null;

  // Cryptographic Helper: SHA-256 Digest
  async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Convert File Object to Base64
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Toast Notification
  function showToast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4500);
  }

  // View Navigation Switcher
  function switchView(viewId) {
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(p => p.classList.add('hidden'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
      target.classList.remove('hidden');
      window.scrollTo(0, 0);
    }

    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-view') === viewId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    const siteNav = document.getElementById('site-nav');
    if (siteNav) siteNav.classList.remove('show');
  }

  // Synchronize Navigation State
  function updateNavAuthDisplay() {
    const unauthGroup = document.getElementById('nav-unauth-group');
    const authGroup = document.getElementById('nav-auth-group');
    const dashBtn = document.getElementById('btn-nav-dashboard');

    if (activeSession) {
      unauthGroup.classList.add('hidden');
      authGroup.classList.remove('hidden');
      if (activeSession.isAdmin) {
        dashBtn.setAttribute('data-view', 'admin');
        dashBtn.textContent = 'Staff Workspace';
      } else {
        dashBtn.setAttribute('data-view', 'dashboard');
        dashBtn.textContent = 'My Dashboard';
      }
    } else {
      unauthGroup.classList.remove('hidden');
      authGroup.classList.add('hidden');
    }
  }

  // Session Restoration
  function restoreSession() {
    const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION);
    if (raw) {
      try {
        activeSession = JSON.parse(raw);
        hydrateDashboardSidebar();
      } catch (e) {
        activeSession = null;
      }
    }
    updateNavAuthDisplay();
  }

  function hydrateDashboardSidebar() {
    if (!activeSession) return;
    const avatarEl = document.getElementById('dash-avatar');
    const nameEl = document.getElementById('dash-user-name');
    const idEl = document.getElementById('dash-user-id');

    if (avatarEl) avatarEl.textContent = (activeSession.fullName || activeSession.userId).charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = activeSession.fullName || activeSession.userId;
    if (idEl) idEl.textContent = activeSession.userId;
  }

  // Append Audit Entry
  function recordAuditLog(action, details) {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT) || '[]');
    logs.unshift({
      timestamp: new Date().toISOString(),
      performedBy: activeSession ? activeSession.userId : 'Anonymous/System',
      action: action,
      details: details
    });
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(logs.slice(0, 100)));
  }

  // Calculate 6 Calendar Months with End-of-Month Snapping
  function calculateSixMonthExpiry(dateStr) {
    const d = new Date(dateStr);
    const startDay = d.getDate();
    d.setMonth(d.getMonth() + 6);
    if (d.getDate() !== startDay) {
      d.setDate(0);
    }
    return d.toISOString().split('T')[0];
  }

  /* =============================================================================
     AUTHENTICATION HANDLERS
     ============================================================================= */

  async function handleRegister(e) {
    e.preventDefault();
    const userId = document.getElementById('reg-userid').value.trim().toLowerCase();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const declaration = document.getElementById('reg-declaration').checked;

    if (!userId || !fullName || !email || !phone || !password) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(userId)) {
      showToast('User ID must be 4–20 alphanumeric characters or underscores.', 'warning');
      return;
    }
    if (!declaration) {
      showToast('You must acknowledge the statutory disclaimer.', 'warning');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters long.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    const existing = users.find(u => u.userId === userId || u.email === email);
    if (existing) {
      showToast('An account with this User ID or email already exists.', 'error');
      return;
    }

    const passwordHash = await hashString(password);
    const newUser = {
      userId,
      fullName,
      email,
      phone,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

    recordAuditLog('APPLICANT_REGISTER', `New user registered: ${userId}`);
    showToast('Registration successful! You may now sign in.', 'success');
    document.getElementById('form-register').reset();
    switchView('login');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-userid').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
      showToast('Enter your User ID and password.', 'warning');
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    const user = users.find(u => u.userId === identifier || u.email === identifier);

    if (!user) {
      showToast('Invalid credentials. Please verify your User ID or password.', 'error');
      return;
    }

    const hashedInput = await hashString(password);
    if (user.passwordHash !== hashedInput) {
      showToast('Invalid credentials. Please verify your User ID or password.', 'error');
      return;
    }

    activeSession = {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      isAdmin: false
    };

    sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(activeSession));
    hydrateDashboardSidebar();
    updateNavAuthDisplay();
    recordAuditLog('APPLICANT_LOGIN', `User signed in: ${user.userId}`);
    showToast('Signed in successfully.', 'success');
    switchView('dashboard');
    loadApplicantApplications();
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-userid').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      showToast('Enter your staff email and password.', 'warning');
      return;
    }

    if (email !== BUSINESS_CONFIG.adminTargetEmail) {
      showToast('Access denied: Unauthorized administrative account.', 'error');
      return;
    }

    const inputHash = await hashString(password);
    const storedAdminHash = localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);

    // Initial administrative password setup on first run
    if (!storedAdminHash) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, inputHash);
      showToast('Administrative credentials initialized on this browser.', 'info');
    } else if (storedAdminHash !== inputHash) {
      showToast('Staff authentication rejected. Invalid password.', 'error');
      return;
    }

    activeSession = {
      userId: BUSINESS_CONFIG.adminTargetEmail,
      fullName: 'Administrator (JCC)',
      email: BUSINESS_CONFIG.adminTargetEmail,
      isAdmin: true
    };

    sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(activeSession));
    updateNavAuthDisplay();
    recordAuditLog('ADMIN_LOGIN', 'Administrator signed into staff operations');
    showToast('Administrator clearance authenticated.', 'success');
    switchView('admin');
    loadAdminApplications();
  }

  function handleLogout() {
    if (activeSession) {
      recordAuditLog('LOGOUT', `Session closed: ${activeSession.userId}`);
    }
    activeSession = null;
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    updateNavAuthDisplay();
    showToast('Signed out successfully.', 'info');
    switchView('home');
  }

  /* =============================================================================
     APPLICANT WORKFLOW & DASHBOARD
     ============================================================================= */

  function switchDashTab(tabId) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const activeTab = document.getElementById(tabId);
    if (activeTab) activeTab.classList.remove('hidden');

    const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-overview') {
      loadApplicantApplications();
    }
  }

  function loadApplicantApplications() {
    if (!activeSession) return;
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    cachedApplicantApps = allApps.filter(a => a.userId === activeSession.userId);

    // Update Counts
    document.getElementById('count-app-all').textContent = cachedApplicantApps.length;
    document.getElementById('count-app-draft').textContent = cachedApplicantApps.filter(a => a.status === 'Draft').length;
    document.getElementById('count-app-paypending').textContent = cachedApplicantApps.filter(a => a.status === 'Payment Pending').length;
    document.getElementById('count-app-approval').textContent = cachedApplicantApps.filter(a => a.status === 'Pending for Approval').length;
    document.getElementById('count-app-issued').textContent = cachedApplicantApps.filter(a => a.status === 'Certificate Issued').length;
    document.getElementById('count-app-rejected').textContent = cachedApplicantApps.filter(a => a.status === 'Rejected').length;

    renderApplicantTable(cachedApplicantApps);
  }

  function renderApplicantTable(apps) {
    const container = document.getElementById('applicant-records-container');
    if (!apps.length) {
      container.innerHTML = '<p class="empty-state">No applications found. Click "+ Create Application" to begin.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Application ID</th>
            <th>Purpose</th>
            <th>Status</th>
            <th>Submitted On</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    apps.forEach(app => {
      let actionMarkup = '';
      if (app.status === 'Draft' || app.status === 'Additional Information Required') {
        actionMarkup = `<button type="button" class="btn btn-outline btn-sm btn-act-edit" data-id="${app.id}">Edit / Resubmit</button>`;
      } else if (app.status === 'Payment Pending') {
        actionMarkup = `<button type="button" class="btn btn-gold btn-sm btn-act-pay" data-id="${app.id}">Pay ₹100</button>`;
      } else if (app.status === 'Certificate Issued' && app.certificate) {
        actionMarkup = `<button type="button" class="btn btn-primary btn-sm btn-act-download" data-id="${app.id}">Download PDF</button>`;
      } else {
        actionMarkup = `<span class="text-muted text-sm">Under Review</span>`;
      }

      html += `
        <tr>
          <td><code>${app.id.substring(0, 10)}...</code></td>
          <td>${escapeHtml(app.purpose)}</td>
          <td><span class="badge-status ${getStatusClass(app.status)}">${escapeHtml(app.status)}</span></td>
          <td>${new Date(app.createdAt).toLocaleDateString()}</td>
          <td>${actionMarkup}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-act-edit').forEach(btn => {
      btn.addEventListener('click', () => loadAppForEditing(btn.getAttribute('data-id')));
    });
    container.querySelectorAll('.btn-act-pay').forEach(btn => {
      btn.addEventListener('click', () => openPaymentInterface(btn.getAttribute('data-id')));
    });
    container.querySelectorAll('.btn-act-download').forEach(btn => {
      btn.addEventListener('click', () => {
        const app = cachedApplicantApps.find(a => a.id === btn.getAttribute('data-id'));
        if (app && app.certificate) {
          generateCertificatePdf(app, app.certificate);
        }
      });
    });
  }

  // Pre-Submission Verification & Preview
  async function handleApplicationPreviewTrigger() {
    const form = document.getElementById('form-clearance-app');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const photoInput = document.getElementById('app-photo');
    const proofInput = document.getElementById('app-proof-file');
    const supportInput = document.getElementById('app-support-file');

    if (photoInput.files.length > 0 && photoInput.files[0].size > 200 * 1024) {
      showToast('Applicant photo exceeds maximum size of 200 KB.', 'error');
      return;
    }
    if (proofInput.files.length > 0 && proofInput.files[0].size > 250 * 1024) {
      showToast('Address proof exceeds maximum size of 250 KB.', 'error');
      return;
    }
    if (supportInput.files.length > 0 && supportInput.files[0].size > 2 * 1024 * 1024) {
      showToast('Supporting document exceeds maximum size of 2 MB.', 'error');
      return;
    }

    let photoData = null;
    let proofData = null;
    let supportData = null;

    if (photoInput.files.length > 0) {
      photoData = await readFileAsBase64(photoInput.files[0]);
    }
    if (proofInput.files.length > 0) {
      proofData = await readFileAsBase64(proofInput.files[0]);
    }
    if (supportInput.files.length > 0) {
      supportData = await readFileAsBase64(supportInput.files[0]);
    }

    const permAddress = document.getElementById('app-perm-address').value.trim();
    const isSameAddress = document.getElementById('app-same-address').checked;
    const presentAddress = isSameAddress ? permAddress : document.getElementById('app-present-address').value.trim();

    pendingSubmissionPayload = {
      recordId: document.getElementById('app-record-id').value,
      fullName: document.getElementById('app-fullname').value.trim(),
      gender: document.getElementById('app-gender').value,
      dob: document.getElementById('app-dob').value,
      nationality: document.getElementById('app-nationality').value.trim(),
      fatherName: document.getElementById('app-father-name').value.trim(),
      motherName: document.getElementById('app-mother-name').value.trim(),
      spouseName: document.getElementById('app-spouse-name').value.trim(),
      aadhaar: document.getElementById('app-aadhaar').value.trim(),
      passport: document.getElementById('app-passport').value.trim(),
      email: document.getElementById('app-email').value.trim(),
      mobile: document.getElementById('app-mobile').value.trim(),
      permAddress: permAddress,
      permCity: document.getElementById('app-perm-city').value.trim(),
      permState: document.getElementById('app-perm-state').value.trim(),
      permPin: document.getElementById('app-perm-pin').value.trim(),
      residenceDuration: document.getElementById('app-residence-duration').value.trim(),
      presentAddress: presentAddress,
      proofType: document.getElementById('app-proof-type').value,
      purpose: document.getElementById('app-purpose').value,
      otherPurpose: document.getElementById('app-other-purpose').value.trim(),
      ref1Name: document.getElementById('ref1-name').value.trim(),
      ref1Phone: document.getElementById('ref1-phone').value.trim(),
      ref1Address: document.getElementById('ref1-address').value.trim(),
      ref2Name: document.getElementById('ref2-name').value.trim(),
      ref2Phone: document.getElementById('ref2-phone').value.trim(),
      ref2Address: document.getElementById('ref2-address').value.trim(),
      photoData: photoData,
      proofData: proofData,
      supportData: supportData,
      photoName: photoInput.files[0] ? photoInput.files[0].name : '',
      proofName: proofInput.files[0] ? proofInput.files[0].name : '',
      supportName: supportInput.files[0] ? supportInput.files[0].name : ''
    };

    const modalBody = document.getElementById('modal-preview-body');
    modalBody.innerHTML = `
      <div style="line-height: 1.8;">
        <h4>1. Personal Identification</h4>
        <p><strong>Full Name:</strong> ${escapeHtml(pendingSubmissionPayload.fullName)} (${escapeHtml(pendingSubmissionPayload.gender)})</p>
        <p><strong>DOB:</strong> ${escapeHtml(pendingSubmissionPayload.dob)} | <strong>Nationality:</strong> ${escapeHtml(pendingSubmissionPayload.nationality)}</p>
        <p><strong>Parents:</strong> Father: ${escapeHtml(pendingSubmissionPayload.fatherName)} | Mother: ${escapeHtml(pendingSubmissionPayload.motherName)}</p>
        <p><strong>Aadhaar:</strong> [Aadhaar Redacted] | <strong>Passport:</strong> ${escapeHtml(pendingSubmissionPayload.passport || 'None')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(pendingSubmissionPayload.email)} | ${escapeHtml(pendingSubmissionPayload.mobile)}</p>

        <hr style="margin: 1rem 0;">
        <h4>2. Address Details</h4>
        <p><strong>Permanent Address:</strong> ${escapeHtml(pendingSubmissionPayload.permAddress)}, ${escapeHtml(pendingSubmissionPayload.permCity)}, ${escapeHtml(pendingSubmissionPayload.permState)} - ${escapeHtml(pendingSubmissionPayload.permPin)}</p>
        <p><strong>Residence Duration:</strong> ${escapeHtml(pendingSubmissionPayload.residenceDuration)}</p>
        <p><strong>Present Address:</strong> ${escapeHtml(pendingSubmissionPayload.presentAddress)}</p>
        <p><strong>Address Proof Type:</strong> ${escapeHtml(pendingSubmissionPayload.proofType)}</p>

        <hr style="margin: 1rem 0;">
        <h4>3. Purpose &amp; References</h4>
        <p><strong>Purpose:</strong> ${escapeHtml(pendingSubmissionPayload.purpose)} ${pendingSubmissionPayload.otherPurpose ? `(${escapeHtml(pendingSubmissionPayload.otherPurpose)})` : ''}</p>
        <p><strong>Reference 1:</strong> ${escapeHtml(pendingSubmissionPayload.ref1Name)} (${escapeHtml(pendingSubmissionPayload.ref1Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref1Address)}</p>
        <p><strong>Reference 2:</strong> ${escapeHtml(pendingSubmissionPayload.ref2Name)} (${escapeHtml(pendingSubmissionPayload.ref2Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref2Address)}</p>

        <hr style="margin: 1rem 0;">
        <h4>4. Document Upload Status</h4>
        <p><strong>Photo:</strong> ${pendingSubmissionPayload.photoName ? `Selected (${escapeHtml(pendingSubmissionPayload.photoName)})` : 'Existing/None'}</p>
        <p><strong>Address Proof:</strong> ${pendingSubmissionPayload.proofName ? `Selected (${escapeHtml(pendingSubmissionPayload.proofName)})` : 'Existing/None'}</p>
        <p><strong>Supporting Doc:</strong> ${pendingSubmissionPayload.supportName ? `Selected (${escapeHtml(pendingSubmissionPayload.supportName)})` : 'None'}</p>
      </div>
    `;

    document.getElementById('modal-preview').classList.remove('hidden');
  }

  // Final Form Submission
  function executeFinalSubmission() {
    if (!activeSession || !pendingSubmissionPayload) return;

    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    let targetApp = pendingSubmissionPayload.recordId ? allApps.find(a => a.id === pendingSubmissionPayload.recordId) : null;

    const now = new Date().toISOString();

    if (!targetApp) {
      targetApp = {
        id: 'JCC-APP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        userId: activeSession.userId,
        createdAt: now,
        statusHistory: []
      };
      allApps.unshift(targetApp);
    }

    targetApp.fullName = pendingSubmissionPayload.fullName;
    targetApp.gender = pendingSubmissionPayload.gender;
    targetApp.dob = pendingSubmissionPayload.dob;
    targetApp.nationality = pendingSubmissionPayload.nationality;
    targetApp.fatherName = pendingSubmissionPayload.fatherName;
    targetApp.motherName = pendingSubmissionPayload.motherName;
    targetApp.spouseName = pendingSubmissionPayload.spouseName;
    targetApp.aadhaar = pendingSubmissionPayload.aadhaar;
    targetApp.passport = pendingSubmissionPayload.passport;
    targetApp.email = pendingSubmissionPayload.email;
    targetApp.mobile = pendingSubmissionPayload.mobile;
    targetApp.permAddress = pendingSubmissionPayload.permAddress;
    targetApp.permCity = pendingSubmissionPayload.permCity;
    targetApp.permState = pendingSubmissionPayload.permState;
    targetApp.permPin = pendingSubmissionPayload.permPin;
    targetApp.residenceDuration = pendingSubmissionPayload.residenceDuration;
    targetApp.presentAddress = pendingSubmissionPayload.presentAddress;
    targetApp.proofType = pendingSubmissionPayload.proofType;
    targetApp.purpose = pendingSubmissionPayload.purpose;
    targetApp.otherPurpose = pendingSubmissionPayload.otherPurpose;
    targetApp.ref1Name = pendingSubmissionPayload.ref1Name;
    targetApp.ref1Phone = pendingSubmissionPayload.ref1Phone;
    targetApp.ref1Address = pendingSubmissionPayload.ref1Address;
    targetApp.ref2Name = pendingSubmissionPayload.ref2Name;
    targetApp.ref2Phone = pendingSubmissionPayload.ref2Phone;
    targetApp.ref2Address = pendingSubmissionPayload.ref2Address;

    if (pendingSubmissionPayload.photoData) targetApp.photoData = pendingSubmissionPayload.photoData;
    if (pendingSubmissionPayload.proofData) targetApp.proofData = pendingSubmissionPayload.proofData;
    if (pendingSubmissionPayload.supportData) targetApp.supportData = pendingSubmissionPayload.supportData;

    targetApp.status = 'Payment Pending';
    targetApp.updatedAt = now;
    targetApp.statusHistory.push({
      status: 'Payment Pending',
      timestamp: now,
      note: 'Application verified and formally submitted by candidate'
    });

    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(allApps));
    recordAuditLog('APPLICATION_SUBMITTED', `Application ${targetApp.id} submitted by ${activeSession.userId}`);

    document.getElementById('modal-preview').classList.add('hidden');
    document.getElementById('form-clearance-app').reset();
    showToast('Application successfully submitted! Please remit the processing fee.', 'success');
    openPaymentInterface(targetApp.id);
  }

  // Save Draft (Without Upload Requirement)
  function handleSaveDraft() {
    if (!activeSession) {
      showToast('You must be signed in to save a draft.', 'warning');
      return;
    }

    const recordId = document.getElementById('app-record-id').value;
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    let targetApp = recordId ? allApps.find(a => a.id === recordId) : null;

    const now = new Date().toISOString();

    if (!targetApp) {
      targetApp = {
        id: 'JCC-APP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        userId: activeSession.userId,
        createdAt: now,
        statusHistory: []
      };
      allApps.unshift(targetApp);
    }

    targetApp.fullName = document.getElementById('app-fullname').value.trim() || 'Untitled Draft';
    targetApp.gender = document.getElementById('app-gender').value;
    targetApp.dob = document.getElementById('app-dob').value;
    targetApp.nationality = document.getElementById('app-nationality').value.trim();
    targetApp.fatherName = document.getElementById('app-father-name').value.trim();
    targetApp.motherName = document.getElementById('app-mother-name').value.trim();
    targetApp.spouseName = document.getElementById('app-spouse-name').value.trim();
    targetApp.aadhaar = document.getElementById('app-aadhaar').value.trim();
    targetApp.passport = document.getElementById('app-passport').value.trim();
    targetApp.email = document.getElementById('app-email').value.trim() || activeSession.email;
    targetApp.mobile = document.getElementById('app-mobile').value.trim();
    targetApp.permAddress = document.getElementById('app-perm-address').value.trim();
    targetApp.permCity = document.getElementById('app-perm-city').value.trim();
    targetApp.permState = document.getElementById('app-perm-state').value.trim();
    targetApp.permPin = document.getElementById('app-perm-pin').value.trim();
    targetApp.residenceDuration = document.getElementById('app-residence-duration').value.trim();
    targetApp.presentAddress = document.getElementById('app-present-address').value.trim();
    targetApp.proofType = document.getElementById('app-proof-type').value;
    targetApp.purpose = document.getElementById('app-purpose').value;
    targetApp.otherPurpose = document.getElementById('app-other-purpose').value.trim();
    targetApp.ref1Name = document.getElementById('ref1-name').value.trim();
    targetApp.ref1Phone = document.getElementById('ref1-phone').value.trim();
    targetApp.ref1Address = document.getElementById('ref1-address').value.trim();
    targetApp.ref2Name = document.getElementById('ref2-name').value.trim();
    targetApp.ref2Phone = document.getElementById('ref2-phone').value.trim();
    targetApp.ref2Address = document.getElementById('ref2-address').value.trim();
    targetApp.status = 'Draft';
    targetApp.updatedAt = now;

    targetApp.statusHistory.push({
      status: 'Draft',
      timestamp: now,
      note: 'Draft saved by candidate'
    });

    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(allApps));
    recordAuditLog('DRAFT_SAVED', `Draft saved: ${targetApp.id}`);
    showToast('Application draft saved.', 'info');
    switchDashTab('tab-overview');
  }

  function loadAppForEditing(appId) {
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    const app = allApps.find(a => a.id === appId);
    if (!app) return;

    document.getElementById('form-heading').textContent = 'Edit Application Submission';
    document.getElementById('app-record-id').value = app.id;
    document.getElementById('app-fullname').value = app.fullName || '';
    document.getElementById('app-gender').value = app.gender || '';
    document.getElementById('app-dob').value = app.dob || '';
    document.getElementById('app-nationality').value = app.nationality || 'India';
    document.getElementById('app-father-name').value = app.fatherName || '';
    document.getElementById('app-mother-name').value = app.motherName || '';
    document.getElementById('app-spouse-name').value = app.spouseName || '';
    document.getElementById('app-aadhaar').value = app.aadhaar || '';
    document.getElementById('app-passport').value = app.passport || '';
    document.getElementById('app-email').value = app.email || '';
    document.getElementById('app-mobile').value = app.mobile || '';

    document.getElementById('app-perm-address').value = app.permAddress || '';
    document.getElementById('app-perm-city').value = app.permCity || '';
    document.getElementById('app-perm-state').value = app.permState || '';
    document.getElementById('app-perm-pin').value = app.permPin || '';
    document.getElementById('app-residence-duration').value = app.residenceDuration || '';
    document.getElementById('app-present-address').value = app.presentAddress || '';

    document.getElementById('app-proof-type').value = app.proofType || '';
    document.getElementById('app-purpose').value = app.purpose || '';

    document.getElementById('ref1-name').value = app.ref1Name || '';
    document.getElementById('ref1-phone').value = app.ref1Phone || '';
    document.getElementById('ref1-address').value = app.ref1Address || '';
    document.getElementById('ref2-name').value = app.ref2Name || '';
    document.getElementById('ref2-phone').value = app.ref2Phone || '';
    document.getElementById('ref2-address').value = app.ref2Address || '';

    switchDashTab('tab-form');
  }

  /* =============================================================================
     PAYMENT GATEWAY (₹100 UPI)
     ============================================================================= */

  function openPaymentInterface(appId) {
    switchDashTab('tab-payment');
    document.getElementById('pay-app-id').value = appId;

    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
    const upiId = settings.upiId || BUSINESS_CONFIG.defaultUpiId;
    const payeeName = settings.payeeName || BUSINESS_CONFIG.ownerName;

    document.getElementById('payee-name-display').textContent = payeeName;
    document.getElementById('payee-upi-display').textContent = upiId;

    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=100.00&cu=INR&tn=JCC_Fee`;

    const qrContainer = document.getElementById('payment-qr-canvas');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      QRCode.toCanvas(upiUri, { width: 200, margin: 2 }, (err, canvas) => {
        if (!err && canvas) qrContainer.appendChild(canvas);
      });
    }
  }

  async function handlePaymentSubmission(e) {
    e.preventDefault();
    const appId = document.getElementById('pay-app-id').value;
    const utr = document.getElementById('pay-utr').value.trim();
    const screenshotInput = document.getElementById('pay-screenshot');

    if (!appId || !utr) {
      showToast('12-digit transaction UTR is required.', 'warning');
      return;
    }

    if (!/^[a-zA-Z0-9]{8,24}$/.test(utr)) {
      showToast('Please enter a valid transaction reference / UTR.', 'warning');
      return;
    }

    let screenshotData = null;
    if (screenshotInput.files.length > 0) {
      const file = screenshotInput.files[0];
      if (file.size > 2 * 1024 * 1024) {
        showToast('Payment screenshot exceeds maximum size of 2 MB.', 'error');
        return;
      }
      screenshotData = await readFileAsBase64(file);
    }

    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    const app = allApps.find(a => a.id === appId);
    if (!app) {
      showToast('Application not found.', 'error');
      return;
    }

    const now = new Date().toISOString();
    app.paymentUtr = utr;
    if (screenshotData) app.paymentScreenshot = screenshotData;
    app.status = 'Payment Verification Pending';
    app.statusHistory.push({
      status: 'Payment Verification Pending',
      timestamp: now,
      note: `Payment evidence submitted (UTR: ${utr})`
    });

    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(allApps));
    recordAuditLog('PAYMENT_SUBMISSION', `Payment submitted for ${app.id} (UTR: ${utr})`);

    showToast('Payment evidence submitted for administrator manual review.', 'success');
    document.getElementById('form-payment-submission').reset();
    switchDashTab('tab-overview');
  }

  /* =============================================================================
     ADMIN CONTROL PANEL
     ============================================================================= */

  function loadAdminApplications() {
    if (!activeSession || !activeSession.isAdmin) return;
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    cachedAdminApps = allApps;

    document.getElementById('admin-count-all').textContent = cachedAdminApps.length;
    document.getElementById('admin-count-payverify').textContent = cachedAdminApps.filter(a => a.status === 'Payment Verification Pending').length;
    document.getElementById('admin-count-approval').textContent = cachedAdminApps.filter(a => a.status === 'Pending for Approval').length;
    document.getElementById('admin-count-review').textContent = cachedAdminApps.filter(a => a.status === 'Under Review').length;
    document.getElementById('admin-count-issued').textContent = cachedAdminApps.filter(a => a.status === 'Certificate Issued').length;
    document.getElementById('admin-count-rejected').textContent = cachedAdminApps.filter(a => a.status === 'Rejected').length;

    renderAdminTable();
  }

  function renderAdminTable() {
    const container = document.getElementById('admin-table-container');
    const statusFilter = document.getElementById('admin-status-filter').value;
    const searchTerm = document.getElementById('admin-search-input').value.toLowerCase().trim();

    let filtered = cachedAdminApps;
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (searchTerm) {
      filtered = filtered.filter(a =>
        (a.fullName && a.fullName.toLowerCase().includes(searchTerm)) ||
        (a.email && a.email.toLowerCase().includes(searchTerm)) ||
        (a.id && a.id.toLowerCase().includes(searchTerm))
      );
    }

    if (!filtered.length) {
      container.innerHTML = '<p class="empty-state">No matching applications located.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>App ID</th>
            <th>Applicant Details</th>
            <th>Purpose</th>
            <th>UTR Reference</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(app => {
      html += `
        <tr>
          <td><code>${app.id}</code></td>
          <td>
            <strong>${escapeHtml(app.fullName || 'N/A')}</strong><br>
            <small class="text-muted">${escapeHtml(app.email || '')} | ${escapeHtml(app.mobile || '')}</small>
          </td>
          <td>${escapeHtml(app.purpose || '')}</td>
          <td><code>${escapeHtml(app.paymentUtr || 'None')}</code></td>
          <td><span class="badge-status ${getStatusClass(app.status)}">${escapeHtml(app.status)}</span></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm btn-adm-inspect" data-id="${app.id}">Inspect &amp; Action</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-adm-inspect').forEach(btn => {
      btn.addEventListener('click', () => openAdminReviewModal(btn.getAttribute('data-id')));
    });
  }

  function openAdminReviewModal(appId) {
    const app = cachedAdminApps.find(a => a.id === appId);
    if (!app) return;

    const modal = document.getElementById('modal-admin-review');
    const body = document.getElementById('modal-review-body');

    body.innerHTML = `
      <div class="grid grid-2">
        <div>
          <h4>Applicant Particulars</h4>
          <p><strong>Name:</strong> ${escapeHtml(app.fullName || '')} (${escapeHtml(app.gender || '')})</p>
          <p><strong>DOB:</strong> ${escapeHtml(app.dob || '')} | <strong>Nationality:</strong> ${escapeHtml(app.nationality || '')}</p>
          <p><strong>Parents:</strong> Father: ${escapeHtml(app.fatherName || '')} | Mother: ${escapeHtml(app.motherName || '')}</p>
          <p><strong>Permanent Address:</strong> ${escapeHtml(app.permAddress || '')}, ${escapeHtml(app.permCity || '')}, ${escapeHtml(app.permState || '')} - ${escapeHtml(app.permPin || '')}</p>
          <p><strong>Duration of Stay:</strong> ${escapeHtml(app.residenceDuration || '')}</p>
          <hr style="margin: 1rem 0;">
          <h4>References</h4>
          <p>1. ${escapeHtml(app.ref1Name || '')} (${escapeHtml(app.ref1Phone || '')}) - ${escapeHtml(app.ref1Address || '')}</p>
          <p>2. ${escapeHtml(app.ref2Name || '')} (${escapeHtml(app.ref2Phone || '')}) - ${escapeHtml(app.ref2Address || '')}</p>
        </div>

        <div>
          <h4>Uploaded Media</h4>
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
            ${app.photoData ? `<a href="${app.photoData}" target="_blank" class="btn btn-outline btn-sm">📷 View Applicant Photo</a>` : '<span class="text-muted">No photo uploaded</span>'}
            ${app.proofData ? `<a href="${app.proofData}" target="_blank" class="btn btn-outline btn-sm">📄 View Address Proof (${escapeHtml(app.proofType || '')})</a>` : '<span class="text-muted">No address proof uploaded</span>'}
            ${app.paymentScreenshot ? `<a href="${app.paymentScreenshot}" target="_blank" class="btn btn-outline btn-sm">💳 View Payment Screenshot</a>` : '<span class="text-muted">No payment screenshot</span>'}
          </div>
          <p style="margin-top:1rem;"><strong>UTR Reference:</strong> <code>${escapeHtml(app.paymentUtr || 'None')}</code></p>
        </div>
      </div>

      <hr style="margin: 1.5rem 0;">

      <div>
        <h4>Administrative Actions</h4>
        <div class="form-group">
          <label for="adm-notes">Internal Administrator Notes</label>
          <textarea id="adm-notes" class="form-control" rows="2">${escapeHtml(app.adminNotes || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="adm-msg">Applicant-Visible Notification</label>
          <textarea id="adm-msg" class="form-control" rows="2">${escapeHtml(app.applicantMessage || '')}</textarea>
        </div>

        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1.25rem;">
          <button type="button" class="btn btn-primary" id="btn-adm-approve">Verify &amp; Approve</button>
          <button type="button" class="btn btn-gold" id="btn-adm-issue">Issue Official Certificate</button>
          <button type="button" class="btn btn-outline" id="btn-adm-reqinfo">Request More Info</button>
          <button type="button" class="btn btn-outline" id="btn-adm-reject" style="color:var(--danger); border-color:var(--danger);">Reject Application</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-adm-approve').onclick = () => updateApplicationStatus(app.id, 'Approved');
    document.getElementById('btn-adm-issue').onclick = () => issueClearanceCertificate(app.id);
    document.getElementById('btn-adm-reqinfo').onclick = () => updateApplicationStatus(app.id, 'Additional Information Required');
    document.getElementById('btn-adm-reject').onclick = () => {
      const reason = prompt('Mandatory: Enter the formal reason for rejection:');
      if (reason && reason.trim()) {
        updateApplicationStatus(app.id, 'Rejected', reason.trim());
      } else {
        showToast('Rejection reason cannot be empty.', 'warning');
      }
    };
  }

  function updateApplicationStatus(appId, newStatus, rejectionReason = '') {
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    const app = allApps.find(a => a.id === appId);
    if (!app) return;

    const notes = document.getElementById('adm-notes')?.value || '';
    const msg = document.getElementById('adm-msg')?.value || '';
    const now = new Date().toISOString();

    app.status = newStatus;
    app.adminNotes = notes;
    app.applicantMessage = msg;
    if (rejectionReason) app.rejectionReason = rejectionReason;
    app.updatedAt = now;

    app.statusHistory.push({
      status: newStatus,
      timestamp: now,
      note: rejectionReason ? `Rejection reason: ${rejectionReason}` : `Status updated to ${newStatus}`
    });

    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(allApps));
    recordAuditLog('STATUS_TRANSITION', `Application ${app.id} transitioned to ${newStatus}`);

    showToast(`Application transitioned to ${newStatus}.`, 'success');
    document.getElementById('modal-admin-review').classList.add('hidden');
    loadAdminApplications();
  }

  function issueClearanceCertificate(appId) {
    const allApps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS) || '[]');
    const app = allApps.find(a => a.id === appId);
    if (!app) return;

    if (app.status !== 'Approved' && app.status !== 'Pending for Approval' && app.status !== 'Under Review') {
      showToast('Application must be approved prior to certificate issuance.', 'warning');
      return;
    }

    const issueDate = new Date().toISOString().split('T')[0];
    const expiryDate = calculateSixMonthExpiry(issueDate);
    const certNumber = 'JCC-' + new Date().getFullYear() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const certRecord = {
      certificateNumber: certNumber,
      applicationId: app.id,
      applicantName: app.fullName,
      issueDate: issueDate,
      expiryDate: expiryDate,
      isRevoked: false,
      createdAt: new Date().toISOString()
    };

    app.certificate = certRecord;
    app.status = 'Certificate Issued';
    app.statusHistory.push({
      status: 'Certificate Issued',
      timestamp: new Date().toISOString(),
      note: `Certificate issued with serial ${certNumber}`
    });

    const certs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CERTIFICATES) || '[]');
    certs.unshift(certRecord);
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certs));

    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(allApps));
    recordAuditLog('CERTIFICATE_ISSUED', `Certificate ${certNumber} issued for application ${app.id}`);

    showToast(`Certificate ${certNumber} successfully registered!`, 'success');
    document.getElementById('modal-admin-review').classList.add('hidden');
    loadAdminApplications();
  }

  /* =============================================================================
     PUBLIC CERTIFICATE VERIFICATION & PDF GENERATION
     ============================================================================= */

  function handleVerifyCertificate(e) {
    e.preventDefault();
    const certNo = document.getElementById('verify-cert-id').value.trim().toUpperCase();
    const resultBox = document.getElementById('verify-result-box');

    if (!certNo) {
      showToast('Enter a certificate serial number.', 'warning');
      return;
    }

    const certs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CERTIFICATES) || '[]');
    const cert = certs.find(c => c.certificateNumber.toUpperCase() === certNo);

    resultBox.classList.remove('hidden');

    if (!cert) {
      resultBox.className = 'verify-result-box verify-invalid';
      resultBox.innerHTML = `
        <h4 style="color:var(--danger);">❌ Certificate Not Found</h4>
        <p>No valid JCC registry clearance certificate corresponds to serial <code>${escapeHtml(certNo)}</code>.</p>
      `;
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const isExpired = today > cert.expiryDate;
    const isRevoked = Boolean(cert.isRevoked);

    let statusLabel = 'Valid & Active';
    if (isRevoked) statusLabel = 'Revoked';
    else if (isExpired) statusLabel = 'Expired';

    const isValid = statusLabel === 'Valid & Active';
    resultBox.className = `verify-result-box ${isValid ? 'verify-valid' : 'verify-invalid'}`;
    resultBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="color:${isValid ? 'var(--success)' : 'var(--danger)'};">
          ${isValid ? '✅ Verified Legitimate Certificate' : '⚠️ Certificate ' + statusLabel}
        </h4>
        <span class="badge-status ${isValid ? 'badge-status-success' : 'badge-status-danger'}">${statusLabel}</span>
      </div>
      <div style="margin-top:0.75rem; font-size:0.9375rem; line-height:1.7;">
        <p><strong>Certificate Serial:</strong> <code>${escapeHtml(cert.certificateNumber)}</code></p>
        <p><strong>Candidate Name:</strong> ${escapeHtml(cert.applicantName)}</p>
        <p><strong>Date of Issuance:</strong> ${cert.issueDate}</p>
        <p><strong>Valid Through:</strong> ${cert.expiryDate}</p>
      </div>
      <div style="margin-top:0.75rem; border-top:1px solid #E2E8F0; padding-top:0.5rem; font-size:0.75rem; color:var(--text-muted);">
        <em>Notice: ${BUSINESS_CONFIG.disclaimerText}</em>
      </div>
    `;
  }

  async function generateCertificatePdf(app, cert) {
    if (!window.jspdf) {
      showToast('PDF rendering engine unavailable.', 'warning');
      return;
    }

    showToast('Rendering official certificate PDF...', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const verificationUrl = `${window.location.origin}${window.location.pathname}?cert=${cert.certificateNumber}#verify`;

      let qrImageBase64 = '';
      if (window.QRCode) {
        qrImageBase64 = await QRCode.toDataURL(verificationUrl, { width: 140, margin: 1 });
      }

      // Outer Navy Border
      doc.setDrawColor(10, 25, 47);
      doc.setLineWidth(1.8);
      doc.rect(10, 10, 190, 277);

      // Inner Gold Border
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.6);
      doc.rect(13, 13, 184, 271);

      // Header Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(10, 25, 47);
      doc.text("JAHIR CLEARANCE CERTIFICATE", 105, 32, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Independent Private Background Record Screening Registry", 105, 38, { align: "center" });
      doc.text(`${BUSINESS_CONFIG.officeAddress} | Phone: +91 ${BUSINESS_CONFIG.contactPhone}`, 105, 43, { align: "center" });

      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.5);
      doc.line(30, 48, 180, 48);

      // Serial & Dates
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(`Registry Serial: ${cert.certificateNumber}`, 22, 58);
      doc.text(`Issue Date: ${cert.issueDate}`, 144, 58);

      // Certification Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const statement = "This clearance document confirms that the identity records, address proofs, and local references provided by the applicant identified below have been screened and cataloged in accordance with the established private verification procedures of JCC.";
      doc.text(doc.splitTextToSize(statement, 166), 22, 70);

      // Particulars Box
      doc.setFillColor(248, 250, 252);
      doc.rect(22, 85, 166, 75, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(22, 85, 166, 75, "S");

      doc.setFont("helvetica", "bold");
      doc.text("Candidate Legal Name:", 26, 95);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.fullName || ''), 78, 95);

      doc.setFont("helvetica", "bold");
      doc.text("Parent / Guardian Name:", 26, 105);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.fatherName || ''), 78, 105);

      doc.setFont("helvetica", "bold");
      doc.text("DOB & Gender:", 26, 115);
      doc.setFont("helvetica", "normal");
      doc.text(`${app.dob || ''} | ${app.gender || ''}`, 78, 115);

      doc.setFont("helvetica", "bold");
      doc.text("Verified Address:", 26, 125);
      doc.setFont("helvetica", "normal");
      const addressLine = `${app.permAddress || ''}, ${app.permCity || ''}, ${app.permState || ''} - ${app.permPin || ''}`;
      doc.text(doc.splitTextToSize(addressLine, 106), 78, 125);

      doc.setFont("helvetica", "bold");
      doc.text("Screening Purpose:", 26, 145);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.purpose || ''), 78, 145);

      // Expiry Notice
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 83, 9);
      doc.text(`Validity Period: 6 Calendar Months (Valid through ${cert.expiryDate})`, 22, 172);

      // Embedded QR Code
      if (qrImageBase64) {
        doc.addImage(qrImageBase64, 'PNG', 24, 185, 40, 40);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Scan QR code to access live registry confirmation", 22, 230);
      }

      // Owner Signature Block
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(BUSINESS_CONFIG.ownerName, 142, 215);
      doc.setFont("helvetica", "normal");
      doc.text("Authorized Registry Officer", 136, 220);
      doc.text("JCC Operations Authority", 138, 225);
      doc.setLineWidth(0.4);
      doc.line(130, 210, 186, 210);

      // Statutory Disclaimer
      doc.setFillColor(254, 243, 199);
      doc.rect(22, 246, 166, 26, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(146, 64, 14);
      doc.text("MANDATORY PRIVATE SERVICE DISCLAIMER:", 26, 253);
      doc.setFont("helvetica", "normal");
      const disclaimerPara = "This certificate is a private credentialing document. It does NOT represent an official police clearance certificate (PCC) or government agency authorization. It cannot replace statutory state criminal record inquiries.";
      doc.text(doc.splitTextToSize(disclaimerPara, 158), 26, 259);

      doc.save(`JCC_Certificate_${cert.certificateNumber}.pdf`);
      showToast('Clearance certificate PDF downloaded.', 'success');
    } catch (err) {
      showToast(`PDF generation error: ${err.message}`, 'error');
    }
  }

  /* =============================================================================
     CONTACT US & INQUIRIES
     ============================================================================= */

  function handleContactSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !email || !subject || !message) {
      showToast('Please fill out all contact fields.', 'warning');
      return;
    }

    const messages = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
    messages.push({
      name,
      email,
      subject,
      message,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

    showToast('Your message has been stored in our registry desk.', 'success');
    document.getElementById('form-contact').reset();
  }

  /* =============================================================================
     INITIALIZATION & DOM EVENT BINDING
     ============================================================================= */

  document.addEventListener('DOMContentLoaded', () => {
    restoreSession();

    // Mobile Hamburger
    const menuToggle = document.getElementById('menu-toggle');
    const siteNav = document.getElementById('site-nav');
    if (menuToggle && siteNav) {
      menuToggle.addEventListener('click', () => {
        siteNav.classList.toggle('show');
      });
    }

    // Navigation Delegations
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-view]');
      if (target) {
        e.preventDefault();
        const view = target.getAttribute('data-view');
        switchView(view);
      }
    });

    // Password Visibility Eye Toggles
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.btn-toggle-eye');
      if (toggleBtn) {
        e.preventDefault();
        const targetId = toggleBtn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            toggleBtn.textContent = '🙈';
          } else {
            input.type = 'password';
            toggleBtn.textContent = '👁️';
          }
        }
      }
    });

    // Global Logout Trigger
    const logoutBtn = document.getElementById('btn-global-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Form Event Submissions
    const formReg = document.getElementById('form-register');
    if (formReg) formReg.addEventListener('submit', handleRegister);

    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.addEventListener('submit', handleLogin);

    const formAdminLogin = document.getElementById('form-admin-login');
    if (formAdminLogin) formAdminLogin.addEventListener('submit', handleAdminLogin);

    const btnDraft = document.getElementById('btn-save-draft');
    if (btnDraft) btnDraft.addEventListener('click', handleSaveDraft);

    const btnPreview = document.getElementById('btn-preview-app');
    if (btnPreview) btnPreview.addEventListener('click', handleApplicationPreviewTrigger);

    const btnConfirmSubmit = document.getElementById('btn-preview-confirm');
    if (btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', executeFinalSubmission);

    const btnPreviewBack = document.getElementById('btn-preview-back');
    if (btnPreviewBack) {
      btnPreviewBack.addEventListener('click', () => {
        document.getElementById('modal-preview').classList.add('hidden');
      });
    }

    const formPayment = document.getElementById('form-payment-submission');
    if (formPayment) formPayment.addEventListener('submit', handlePaymentSubmission);

    const formVerify = document.getElementById('form-verify-certificate');
    if (formVerify) formVerify.addEventListener('submit', handleVerifyCertificate);

    const formContact = document.getElementById('form-contact');
    if (formContact) formContact.addEventListener('submit', handleContactSubmit);

    // Address Mirroring Checkbox
    const sameAddressCb = document.getElementById('app-same-address');
    if (sameAddressCb) {
      sameAddressCb.addEventListener('change', (e) => {
        const container = document.getElementById('present-address-box');
        const presentInput = document.getElementById('app-present-address');
        if (e.target.checked) {
          container.classList.add('hidden');
          presentInput.value = document.getElementById('app-perm-address').value;
        } else {
          container.classList.remove('hidden');
        }
      });
    }

    // Purpose Other Conditional Toggle
    const purposeSelect = document.getElementById('app-purpose');
    if (purposeSelect) {
      purposeSelect.addEventListener('change', (e) => {
        const otherBox = document.getElementById('other-purpose-box');
        if (e.target.value === 'Other') {
          otherBox.classList.remove('hidden');
        } else {
          otherBox.classList.add('hidden');
        }
      });
    }

    // Dashboard Tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchDashTab(btn.getAttribute('data-tab')));
    });

    const btnCreateApp = document.getElementById('btn-dash-create-app');
    if (btnCreateApp) {
      btnCreateApp.addEventListener('click', () => {
        document.getElementById('form-clearance-app').reset();
        document.getElementById('app-record-id').value = '';
        document.getElementById('form-heading').textContent = 'New Clearance Application';
        switchDashTab('tab-form');
      });
    }

    const btnSidebarNew = document.getElementById('btn-sidebar-new-app');
    if (btnSidebarNew) {
      btnSidebarNew.addEventListener('click', () => {
        document.getElementById('form-clearance-app').reset();
        document.getElementById('app-record-id').value = '';
        document.getElementById('form-heading').textContent = 'New Clearance Application';
        switchDashTab('tab-form');
      });
    }

    // Modal Close Triggers
    document.getElementById('btn-close-preview-modal')?.addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('btn-close-review-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-review').classList.add('hidden');
    });
    document.getElementById('btn-close-upi-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-upi').classList.add('hidden');
    });

    // Admin Search & Filter
    document.getElementById('admin-status-filter')?.addEventListener('change', renderAdminTable);
    document.getElementById('admin-search-input')?.addEventListener('input', renderAdminTable);
    document.getElementById('btn-admin-refresh')?.addEventListener('click', loadAdminApplications);

    // Admin UPI Config Modal
    document.getElementById('btn-admin-upi-config')?.addEventListener('click', () => {
      const modal = document.getElementById('modal-admin-upi');
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
      document.getElementById('cfg-upi-id').value = settings.upiId || BUSINESS_CONFIG.defaultUpiId;
      document.getElementById('cfg-payee-name').value = settings.payeeName || BUSINESS_CONFIG.ownerName;
      modal.classList.remove('hidden');
    });

    document.getElementById('form-upi-settings')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const upiId = document.getElementById('cfg-upi-id').value.trim();
      const payeeName = document.getElementById('cfg-payee-name').value.trim();
      if (!upiId || !payeeName) {
        showToast('Please fill out all UPI settings fields.', 'warning');
        return;
      }
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ upiId, payeeName, fee: 100 }));
      recordAuditLog('UPI_SETTINGS_UPDATE', `Updated UPI ID: ${upiId}, Payee: ${payeeName}`);
      showToast('UPI payment configuration saved.', 'success');
      document.getElementById('modal-admin-upi').classList.add('hidden');
    });

    // URL Query Auto-Verification (?cert=JCC-2026-XXXXXX)
    const queryParams = new URLSearchParams(window.location.search);
    const certParam = queryParams.get('cert');
    if (certParam) {
      switchView('verify');
      const input = document.getElementById('verify-cert-id');
      if (input) {
        input.value = certParam;
        document.getElementById('btn-submit-verify').click();
      }
    }
  });

  // UI Helpers
  function getStatusClass(status) {
    switch (status) {
      case 'Certificate Issued': return 'badge-status-success';
      case 'Payment Pending':
      case 'Payment Verification Pending': return 'badge-status-gold';
      case 'Pending for Approval':
      case 'Under Review': return 'badge-status-info';
      case 'Rejected': return 'badge-status-danger';
      default: return 'badge-status-info';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

})();