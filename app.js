/**
 * JCC — Jahir Clearance Certificate
 * Official Ultra-Fast Parse/Back4App Engine
 */

(function () {
  'use strict';

  // Back4App Initialization
  Parse.initialize(
    "BCI1MzauUwBTybhBLlRkuCQpKxYemSTaauWGTrnr", // Application ID
    "G5pkkHEdHK09sbO3FKn7l9b1uCDWQXkM0abYZUhi"  // JavaScript Key
  );
  Parse.serverURL = "https://parseapi.back4app.com/";

  // Core Configuration
  const JCC_CONFIG = {
    ownerName: 'Mr. Jahir Narjinary',
    contactPhone: '7384512297',
    contactEmail: 'jahirkumarnarjinary@gmail.com',
    adminEmail: 'jahirnarjinary04@gmail.com',
    officeAddress: 'Alipurduar, Kumargram, West Bengal, 736203, India',
    applicationFeeInr: 100,
    defaultUpiId: '7384512297@upi',
    disclaimerText: 'JCC is a privately operated background screening registry. It is not an official government agency or statutory police department. This credential must not be represented as an official Police Clearance Certificate (PCC).'
  };

  let currentUser = Parse.User.current();
  let pendingSubmissionPayload = null;
  let cachedApplicantApps = [];
  let cachedAdminApps = [];
  let activeApplicantFilter = 'ALL';
  let activeAdminFilter = 'ALL';

  // Helper to read file to Base64 Data URL (Fast & reliable)
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Toast UI notification stack
  function showToast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4500);
  }

  // SPA Navigation Router
  function switchView(viewId) {
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(p => p.classList.add('hidden'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
      target.classList.remove('hidden');
      window.scrollTo(0, 0);
    }

    document.querySelectorAll('.nav-item').forEach(link => {
      if (link.getAttribute('data-view') === viewId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    const siteNav = document.getElementById('site-nav');
    if (siteNav) siteNav.classList.remove('show');

    // Auto load data on view switch
    if (viewId === 'dashboard') {
      loadApplicantApplications();
    } else if (viewId === 'admin') {
      loadAdminApplications();
    }
  }

  // Synchronize Nav Auth State
  function updateNavAuthUI() {
    currentUser = Parse.User.current();
    const isAdmin = currentUser && currentUser.get('email') && currentUser.get('email').toLowerCase() === JCC_CONFIG.adminEmail.toLowerCase();

    const unauthGroup = document.getElementById('nav-unauth-group');
    const authGroup = document.getElementById('nav-auth-group');
    const dashBtn = document.getElementById('btn-nav-dashboard');

    if (currentUser) {
      unauthGroup.classList.add('hidden');
      authGroup.classList.remove('hidden');

      const avatarEl = document.getElementById('dash-avatar');
      const nameEl = document.getElementById('dash-user-name');
      const emailEl = document.getElementById('dash-user-email');

      const displayName = currentUser.get('name') || currentUser.get('username') || 'User';
      if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = currentUser.get('email');

      if (isAdmin) {
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

  /* =============================================================================
     AUTHENTICATION HANDLERS
     ============================================================================= */

  async function handleApplicantRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const declaration = document.getElementById('reg-declaration').checked;

    if (!fullName || !email || !phone || !password) {
      showToast('Please fill out all required fields.', 'warning');
      return;
    }
    if (!declaration) {
      showToast('Please accept the statutory disclaimer.', 'warning');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-reg');
    btn.disabled = true;
    btn.textContent = 'Registering Account...';

    try {
      const user = new Parse.User();
      user.set('username', email);
      user.set('email', email);
      user.set('password', password);
      user.set('name', fullName);
      user.set('phone', phone);
      await user.signUp();

      showToast('Registration successful! Welcome.', 'success');
      document.getElementById('form-register').reset();
      updateNavAuthUI();
      switchView('dashboard');
    } catch (err) {
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Complete Registration';
    }
  }

  async function handleApplicantLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showToast('Enter your email and password.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-submit-login');
    btn.disabled = true;
    btn.textContent = 'Signing In...';

    try {
      await Parse.User.logIn(email, password);
      showToast('Signed in successfully.', 'success');
      updateNavAuthUI();
      switchView('dashboard');
    } catch (err) {
      showToast(err.message || 'Invalid credentials.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      showToast('Enter staff credentials.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-submit-admin-login');
    btn.disabled = true;
    btn.textContent = 'Authenticating Staff...';

    try {
      let user;
      try {
        user = await Parse.User.logIn(email, password);
      } catch (authErr) {
        if (email === JCC_CONFIG.adminEmail.toLowerCase()) {
          user = new Parse.User();
          user.set('username', email);
          user.set('email', email);
          user.set('password', password);
          user.set('name', 'Administrator');
          user.set('is_admin', true);
          await user.signUp();
        } else {
          throw authErr;
        }
      }

      if (user.get('email').toLowerCase() !== JCC_CONFIG.adminEmail.toLowerCase()) {
        await Parse.User.logOut();
        throw new Error('Access denied: Unauthorized staff account.');
      }

      showToast('Staff clearance authenticated.', 'success');
      updateNavAuthUI();
      switchView('admin');
    } catch (err) {
      showToast(err.message || 'Staff sign in failed.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Authenticate Staff Session';
    }
  }

  async function handleLogout() {
    await Parse.User.logOut();
    updateNavAuthUI();
    showToast('Signed out.', 'info');
    switchView('home');
  }

  /* =============================================================================
     APPLICATION SUBMISSIONS & 3 FILES UPLOAD
     ============================================================================= */

  function switchDashTab(tabId) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');

    const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    if (tabId === 'tab-overview') {
      loadApplicantApplications();
    }
  }

  function handleApplicationReviewTrigger() {
    const form = document.getElementById('form-clearance-app');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const photoInput = document.getElementById('app-photo');
    const proofInput = document.getElementById('app-proof-file');
    const otherDocInput = document.getElementById('app-other-doc');

    if (!document.getElementById('app-record-id').value) {
      if (!photoInput.files.length) {
        showToast('Please select applicant passport photograph.', 'error');
        return;
      }
      if (!proofInput.files.length) {
        showToast('Please select address proof file.', 'error');
        return;
      }
      if (!otherDocInput.files.length) {
        showToast('Please select Other Relevant Document (PDF).', 'error');
        return;
      }
    }

    if (otherDocInput.files.length > 0 && otherDocInput.files[0].type !== 'application/pdf') {
      showToast('Other Relevant Document must be a valid PDF file.', 'error');
      return;
    }

    const permAddress = document.getElementById('app-perm-address').value.trim();
    const isSame = document.getElementById('app-same-address').checked;

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
      presentAddress: isSame ? permAddress : document.getElementById('app-present-address').value.trim(),
      proofType: document.getElementById('app-proof-type').value,
      purpose: document.getElementById('app-purpose').value,
      otherPurpose: document.getElementById('app-other-purpose').value.trim(),
      ref1Name: document.getElementById('ref1-name').value.trim(),
      ref1Phone: document.getElementById('ref1-phone').value.trim(),
      ref1Address: document.getElementById('ref1-address').value.trim(),
      ref2Name: document.getElementById('ref2-name').value.trim(),
      ref2Phone: document.getElementById('ref2-phone').value.trim(),
      ref2Address: document.getElementById('ref2-address').value.trim(),
      photoFile: photoInput.files[0] || null,
      proofFile: proofInput.files[0] || null,
      otherDocFile: otherDocInput.files[0] || null
    };

    const previewBody = document.getElementById('modal-preview-body');
    previewBody.innerHTML = `
      <div style="line-height: 1.8;">
        <h4>1. Personal Identification</h4>
        <p><strong>Full Name:</strong> ${escapeHtml(pendingSubmissionPayload.fullName)} (${escapeHtml(pendingSubmissionPayload.gender)})</p>
        <p><strong>DOB:</strong> ${escapeHtml(pendingSubmissionPayload.dob)} | <strong>Nationality:</strong> ${escapeHtml(pendingSubmissionPayload.nationality)}</p>
        <p><strong>Parents:</strong> Father: ${escapeHtml(pendingSubmissionPayload.fatherName)} | Mother: ${escapeHtml(pendingSubmissionPayload.motherName)}</p>
        <p><strong>Aadhaar / National ID:</strong> ${escapeHtml(pendingSubmissionPayload.aadhaar)} | <strong>Passport:</strong> ${escapeHtml(pendingSubmissionPayload.passport || 'None')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(pendingSubmissionPayload.email)} | ${escapeHtml(pendingSubmissionPayload.mobile)}</p>
        
        <hr style="margin: 1rem 0;">
        <h4>2. Address & 3 Uploaded Documents</h4>
        <p><strong>Permanent Address:</strong> ${escapeHtml(pendingSubmissionPayload.permAddress)}, ${escapeHtml(pendingSubmissionPayload.permCity)}, ${escapeHtml(pendingSubmissionPayload.permState)} - ${escapeHtml(pendingSubmissionPayload.permPin)}</p>
        <p><strong>Present Address:</strong> ${escapeHtml(pendingSubmissionPayload.presentAddress)}</p>
        <p><strong>Uploaded Files:</strong></p>
        <ul>
          <li>1. Photo: <strong>${pendingSubmissionPayload.photoFile ? pendingSubmissionPayload.photoFile.name : 'Preserved'}</strong></li>
          <li>2. Address Proof (${escapeHtml(pendingSubmissionPayload.proofType)}): <strong>${pendingSubmissionPayload.proofFile ? pendingSubmissionPayload.proofFile.name : 'Preserved'}</strong></li>
          <li>3. Other Relevant Document (PDF): <strong>${pendingSubmissionPayload.otherDocFile ? pendingSubmissionPayload.otherDocFile.name : 'Preserved'}</strong></li>
        </ul>

        <hr style="margin: 1rem 0;">
        <h4>3. Verification Purpose & Two References</h4>
        <p><strong>Purpose:</strong> ${escapeHtml(pendingSubmissionPayload.purpose)} ${pendingSubmissionPayload.otherPurpose ? `(${escapeHtml(pendingSubmissionPayload.otherPurpose)})` : ''}</p>
        <p><strong>Reference 1:</strong> ${escapeHtml(pendingSubmissionPayload.ref1Name)} (${escapeHtml(pendingSubmissionPayload.ref1Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref1Address)}</p>
        <p><strong>Reference 2:</strong> ${escapeHtml(pendingSubmissionPayload.ref2Name)} (${escapeHtml(pendingSubmissionPayload.ref2Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref2Address)}</p>
      </div>
    `;

    document.getElementById('modal-preview').classList.remove('hidden');
  }

  // Fast Dual Save: Parse.File + Base64 fallback (Guaranteed no freeze & instant opening)
  async function executeFinalSubmission() {
    currentUser = Parse.User.current();
    if (!currentUser || !pendingSubmissionPayload) return;

    const confirmBtn = document.getElementById('btn-preview-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Uploading 3 Documents...';

    try {
      const Application = Parse.Object.extend("Application");
      let appObj;

      if (pendingSubmissionPayload.recordId) {
        const query = new Parse.Query(Application);
        appObj = await query.get(pendingSubmissionPayload.recordId);
      } else {
        appObj = new Application();
      }

      // 1. Photo
      if (pendingSubmissionPayload.photoFile) {
        confirmBtn.textContent = 'Processing Photo...';
        const photoData = await readFileAsDataURL(pendingSubmissionPayload.photoFile);
        appObj.set("photo_base64", photoData);
        try {
          const parsePhoto = new Parse.File("photo.jpg", pendingSubmissionPayload.photoFile);
          await parsePhoto.save();
          appObj.set("photo", parsePhoto);
        } catch (_) {}
      }

      // 2. Address Proof
      if (pendingSubmissionPayload.proofFile) {
        confirmBtn.textContent = 'Processing Address Proof...';
        const proofData = await readFileAsDataURL(pendingSubmissionPayload.proofFile);
        appObj.set("proof_base64", proofData);
        try {
          const parseProof = new Parse.File("address_proof.pdf", pendingSubmissionPayload.proofFile);
          await parseProof.save();
          appObj.set("address_proof", parseProof);
        } catch (_) {}
      }

      // 3. Other Relevant Document (PDF)
      if (pendingSubmissionPayload.otherDocFile) {
        confirmBtn.textContent = 'Processing Relevant Document...';
        const otherData = await readFileAsDataURL(pendingSubmissionPayload.otherDocFile);
        appObj.set("other_doc_base64", otherData);
        try {
          const parseOther = new Parse.File("other_document.pdf", pendingSubmissionPayload.otherDocFile);
          await parseOther.save();
          appObj.set("other_doc", parseOther);
        } catch (_) {}
      }

      confirmBtn.textContent = 'Saving Application...';

      appObj.set("user_id", currentUser.id);
      appObj.set("status", "Payment Pending");
      appObj.set("full_name", pendingSubmissionPayload.fullName);
      appObj.set("gender", pendingSubmissionPayload.gender);
      appObj.set("dob", pendingSubmissionPayload.dob);
      appObj.set("nationality", pendingSubmissionPayload.nationality);
      appObj.set("father_name", pendingSubmissionPayload.fatherName);
      appObj.set("mother_name", pendingSubmissionPayload.motherName);
      appObj.set("spouse_name", pendingSubmissionPayload.spouseName || "");
      appObj.set("aadhaar_number", pendingSubmissionPayload.aadhaar);
      appObj.set("passport_number", pendingSubmissionPayload.passport || "");
      appObj.set("email", pendingSubmissionPayload.email);
      appObj.set("mobile", pendingSubmissionPayload.mobile);
      appObj.set("permanent_address", pendingSubmissionPayload.permAddress);
      appObj.set("perm_city", pendingSubmissionPayload.permCity);
      appObj.set("perm_state", pendingSubmissionPayload.permState);
      appObj.set("perm_pin", pendingSubmissionPayload.permPin);
      appObj.set("residence_duration", pendingSubmissionPayload.residenceDuration);
      appObj.set("present_address", pendingSubmissionPayload.presentAddress);
      appObj.set("address_proof_type", pendingSubmissionPayload.proofType);
      appObj.set("purpose", pendingSubmissionPayload.purpose);
      appObj.set("other_purpose", pendingSubmissionPayload.otherPurpose || "");
      appObj.set("ref1_name", pendingSubmissionPayload.ref1Name);
      appObj.set("ref1_phone", pendingSubmissionPayload.ref1Phone);
      appObj.set("ref1_address", pendingSubmissionPayload.ref1Address);
      appObj.set("ref2_name", pendingSubmissionPayload.ref2Name);
      appObj.set("ref2_phone", pendingSubmissionPayload.ref2Phone);
      appObj.set("ref2_address", pendingSubmissionPayload.ref2Address);

      const savedApp = await appObj.save();

      document.getElementById('modal-preview').classList.add('hidden');
      document.getElementById('form-clearance-app').reset();
      showToast('Application submitted! Please proceed to ₹100 payment.', 'success');
      openPaymentInterface(savedApp.id);

    } catch (err) {
      showToast('Submission error: ' + err.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Final Submit';
    }
  }

  // Save Draft
  async function handleSaveDraft() {
    currentUser = Parse.User.current();
    if (!currentUser) {
      showToast('Sign in required to save draft.', 'warning');
      return;
    }

    try {
      const Application = Parse.Object.extend("Application");
      const recordId = document.getElementById('app-record-id').value;
      let appObj;

      if (recordId) {
        const query = new Parse.Query(Application);
        appObj = await query.get(recordId);
      } else {
        appObj = new Application();
      }

      appObj.set("user_id", currentUser.id);
      appObj.set("status", "Draft");
      appObj.set("full_name", document.getElementById('app-fullname').value.trim() || 'Untitled Draft');
      appObj.set("gender", document.getElementById('app-gender').value || 'Male');
      appObj.set("dob", document.getElementById('app-dob').value || '2000-01-01');
      appObj.set("nationality", document.getElementById('app-nationality').value.trim() || 'India');
      appObj.set("father_name", document.getElementById('app-father-name').value.trim() || 'N/A');
      appObj.set("mother_name", document.getElementById('app-mother-name').value.trim() || 'N/A');
      appObj.set("aadhaar_number", document.getElementById('app-aadhaar').value.trim() || '000000000000');
      appObj.set("email", document.getElementById('app-email').value.trim() || currentUser.get('email'));
      appObj.set("mobile", document.getElementById('app-mobile').value.trim() || '9999999999');
      appObj.set("permanent_address", document.getElementById('app-perm-address').value.trim() || 'N/A');
      appObj.set("perm_city", document.getElementById('app-perm-city').value.trim() || 'N/A');
      appObj.set("perm_state", document.getElementById('app-perm-state').value.trim() || 'N/A');
      appObj.set("perm_pin", document.getElementById('app-perm-pin').value.trim() || '000000');
      appObj.set("residence_duration", document.getElementById('app-residence-duration').value.trim() || 'N/A');
      appObj.set("address_proof_type", document.getElementById('app-proof-type').value || 'Aadhaar');
      appObj.set("purpose", document.getElementById('app-purpose').value || 'Employment');

      await appObj.save();
      showToast('Draft saved successfully.', 'info');
      switchDashTab('tab-overview');
    } catch (err) {
      showToast('Failed to save draft: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     APPLICANT DASHBOARD FETCH (Fast & Accurate)
     ============================================================================= */

  async function loadApplicantApplications() {
    currentUser = Parse.User.current();
    if (!currentUser) return;

    const container = document.getElementById('applicant-records-container');

    try {
      const Application = Parse.Object.extend("Application");
      const query = new Parse.Query(Application);
      query.equalTo("user_id", currentUser.id);
      query.descending("updatedAt");
      query.limit(100);

      const results = await query.find();
      cachedApplicantApps = results.map(r => ({
        id: r.id,
        ...r.attributes,
        photo_url: r.get('photo') ? r.get('photo').url() : r.get('photo_base64'),
        parseObj: r
      }));

      // Update counters
      document.getElementById('count-app-all').textContent = cachedApplicantApps.length;
      document.getElementById('count-app-draft').textContent = cachedApplicantApps.filter(a => a.status === 'Draft').length;
      document.getElementById('count-app-paypending').textContent = cachedApplicantApps.filter(a => a.status === 'Payment Pending').length;
      document.getElementById('count-app-approval').textContent = cachedApplicantApps.filter(a => a.status === 'Pending for Approval' || a.status === 'Payment Verification Pending' || a.status === 'Under Review').length;
      document.getElementById('count-app-issued').textContent = cachedApplicantApps.filter(a => a.status === 'Certificate Issued').length;
      document.getElementById('count-app-rejected').textContent = cachedApplicantApps.filter(a => a.status === 'Rejected').length;

      filterAndRenderApplicantTable();
    } catch (err) {
      container.innerHTML = `<p class="empty-state text-danger">Error retrieving records: ${escapeHtml(err.message)}</p>`;
    }
  }

  function filterAndRenderApplicantTable() {
    let filtered = cachedApplicantApps;
    if (activeApplicantFilter !== 'ALL') {
      if (activeApplicantFilter === 'Pending for Approval') {
        filtered = filtered.filter(a => a.status === 'Pending for Approval' || a.status === 'Payment Verification Pending' || a.status === 'Under Review');
      } else {
        filtered = filtered.filter(a => a.status === activeApplicantFilter);
      }
    }
    renderApplicantTable(filtered);
  }

  function renderApplicantTable(apps) {
    const container = document.getElementById('applicant-records-container');
    if (!apps.length) {
      container.innerHTML = '<p class="empty-state">No submissions found under this status. Click "+ Create Application" to begin.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Application ID</th>
            <th>Applicant Name</th>
            <th>Purpose</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    apps.forEach(app => {
      let actionBtn = '';
      if (app.status === 'Draft') {
        actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-act-edit" data-id="${app.id}">Edit / Resubmit</button>`;
      } else if (app.status === 'Payment Pending') {
        actionBtn = `<button type="button" class="btn btn-gold btn-sm btn-act-pay" data-id="${app.id}">Pay ₹100</button>`;
      } else if (app.status === 'Certificate Issued') {
        actionBtn = `<button type="button" class="btn btn-primary btn-sm btn-act-download" data-id="${app.id}">📥 Download Certificate PDF</button>`;
      } else {
        actionBtn = `<span class="text-muted text-sm">Under Review</span>`;
      }

      html += `
        <tr>
          <td><code>${app.id.substring(0, 8)}...</code></td>
          <td><strong>${escapeHtml(app.full_name || 'N/A')}</strong></td>
          <td>${escapeHtml(app.purpose || '')}</td>
          <td><span class="badge-status ${getStatusClass(app.status)}">${escapeHtml(app.status)}</span></td>
          <td>${actionBtn}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-act-edit').forEach(b => {
      b.addEventListener('click', () => loadAppIntoForm(b.getAttribute('data-id')));
    });
    container.querySelectorAll('.btn-act-pay').forEach(b => {
      b.addEventListener('click', () => openPaymentInterface(b.getAttribute('data-id')));
    });
    container.querySelectorAll('.btn-act-download').forEach(b => {
      b.addEventListener('click', () => {
        const app = cachedApplicantApps.find(a => a.id === b.getAttribute('data-id'));
        if (app) generateAndDownloadCertificatePdf(app);
      });
    });
  }

  function loadAppIntoForm(appId) {
    const app = cachedApplicantApps.find(a => a.id === appId);
    if (!app) return;

    document.getElementById('form-heading').textContent = 'Edit Application Submission';
    document.getElementById('app-record-id').value = app.id;
    document.getElementById('app-fullname').value = app.full_name || '';
    document.getElementById('app-gender').value = app.gender || '';
    document.getElementById('app-dob').value = app.dob || '';
    document.getElementById('app-nationality').value = app.nationality || 'India';
    document.getElementById('app-father-name').value = app.father_name || '';
    document.getElementById('app-mother-name').value = app.mother_name || '';
    document.getElementById('app-spouse-name').value = app.spouse_name || '';
    document.getElementById('app-aadhaar').value = app.aadhaar_number || '';
    document.getElementById('app-passport').value = app.passport_number || '';
    document.getElementById('app-email').value = app.email || '';
    document.getElementById('app-mobile').value = app.mobile || '';

    document.getElementById('app-perm-address').value = app.permanent_address || '';
    document.getElementById('app-perm-city').value = app.perm_city || '';
    document.getElementById('app-perm-state').value = app.perm_state || '';
    document.getElementById('app-perm-pin').value = app.perm_pin || '';
    document.getElementById('app-residence-duration').value = app.residence_duration || '';
    document.getElementById('app-present-address').value = app.present_address || '';

    document.getElementById('app-proof-type').value = app.address_proof_type || '';
    document.getElementById('app-purpose').value = app.purpose || '';

    document.getElementById('ref1-name').value = app.ref1_name || '';
    document.getElementById('ref1-phone').value = app.ref1_phone || '';
    document.getElementById('ref1-address').value = app.ref1_address || '';
    document.getElementById('ref2-name').value = app.ref2_name || '';
    document.getElementById('ref2-phone').value = app.ref2_phone || '';
    document.getElementById('ref2-address').value = app.ref2_address || '';

    switchDashTab('tab-form');
  }

  /* =============================================================================
     DYNAMIC UPI QR PAYMENT SYSTEM (Real-time QR)
     ============================================================================= */

  async function openPaymentInterface(appId) {
    switchDashTab('tab-payment');
    document.getElementById('pay-app-id').value = appId;

    let upiId = JCC_CONFIG.defaultUpiId;
    let payee = JCC_CONFIG.ownerName;

    try {
      const SystemSettings = Parse.Object.extend("SystemSettings");
      const query = new Parse.Query(SystemSettings);
      const res = await query.first();
      if (res && res.get('upi_id')) {
        upiId = res.get('upi_id');
        payee = res.get('payee_name') || payee;
      }
    } catch (_) {}

    document.getElementById('payee-name-display').textContent = payee;
    document.getElementById('payee-upi-display').textContent = upiId;

    // Real dynamic UPI URI
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=100.00&cu=INR&tn=JCC_Fee_${appId.substring(0,6)}`;

    const qrContainer = document.getElementById('payment-qr-canvas');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      QRCode.toCanvas(upiUri, { width: 210, margin: 2, color: { dark: '#0A192F', light: '#FFFFFF' } }, (err, canvas) => {
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
      showToast('12-digit UTR number is required.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-confirm-payment');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Payment...';

    try {
      const Application = Parse.Object.extend("Application");
      const query = new Parse.Query(Application);
      const appObj = await query.get(appId);

      if (screenshotInput.files.length > 0) {
        const screenshotData = await readFileAsDataURL(screenshotInput.files[0]);
        appObj.set("payment_screenshot_base64", screenshotData);
        try {
          const parseScreenshot = new Parse.File("screenshot.jpg", screenshotInput.files[0]);
          await parseScreenshot.save();
          appObj.set("payment_screenshot", parseScreenshot);
        } catch (_) {}
      }

      appObj.set("payment_utr", utr);
      appObj.set("status", "Payment Verification Pending");
      await appObj.save();

      showToast('Payment submitted for administrator verification!', 'success');
      document.getElementById('form-payment-submission').reset();
      switchDashTab('tab-overview');
    } catch (err) {
      showToast('Payment submission error: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Payment Submission';
    }
  }

  /* =============================================================================
     ADMIN DASHBOARD & CONTROL PANEL (Fast Inspection & PDF View)
     ============================================================================= */

  async function loadAdminApplications() {
    currentUser = Parse.User.current();
    if (!currentUser || currentUser.get('email').toLowerCase() !== JCC_CONFIG.adminEmail.toLowerCase()) return;

    const container = document.getElementById('admin-table-container');

    try {
      const Application = Parse.Object.extend("Application");
      const query = new Parse.Query(Application);
      query.descending("updatedAt");
      query.limit(200);

      const results = await query.find();
      cachedAdminApps = results.map(r => {
        const photoFile = r.get('photo');
        const proofFile = r.get('address_proof');
        const otherFile = r.get('other_doc');
        const payFile = r.get('payment_screenshot');

        return {
          id: r.id,
          ...r.attributes,
          photo_url: photoFile ? photoFile.url() : r.get('photo_base64'),
          proof_url: proofFile ? proofFile.url() : r.get('proof_base64'),
          other_doc_url: otherFile ? otherFile.url() : r.get('other_doc_base64'),
          payment_screenshot_url: payFile ? payFile.url() : r.get('payment_screenshot_base64'),
          parseObj: r
        };
      });

      // Update Metric Counters
      document.getElementById('admin-count-all').textContent = cachedAdminApps.length;
      document.getElementById('admin-count-payverify').textContent = cachedAdminApps.filter(a => a.status === 'Payment Verification Pending').length;
      document.getElementById('admin-count-approval').textContent = cachedAdminApps.filter(a => a.status === 'Pending for Approval').length;
      document.getElementById('admin-count-review').textContent = cachedAdminApps.filter(a => a.status === 'Under Review').length;
      document.getElementById('admin-count-issued').textContent = cachedAdminApps.filter(a => a.status === 'Certificate Issued').length;
      document.getElementById('admin-count-rejected').textContent = cachedAdminApps.filter(a => a.status === 'Rejected').length;

      renderAdminTable();
    } catch (err) {
      container.innerHTML = `<p class="empty-state text-danger">Error loading database records: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderAdminTable() {
    const container = document.getElementById('admin-table-container');
    const searchTerm = document.getElementById('admin-search-input').value.toLowerCase().trim();

    let filtered = cachedAdminApps;
    if (activeAdminFilter !== 'ALL') {
      filtered = filtered.filter(a => a.status === activeAdminFilter);
    }
    if (searchTerm) {
      filtered = filtered.filter(a =>
        (a.full_name && a.full_name.toLowerCase().includes(searchTerm)) ||
        (a.email && a.email.toLowerCase().includes(searchTerm)) ||
        (a.id && a.id.toLowerCase().includes(searchTerm))
      );
    }

    if (!filtered.length) {
      container.innerHTML = '<p class="empty-state">No matching applications located in database.</p>';
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
      let extraDownloadBtn = '';
      if (app.status === 'Certificate Issued') {
        extraDownloadBtn = `<button type="button" class="btn btn-primary btn-sm btn-adm-download-cert" data-id="${app.id}" style="margin-left:5px;">📥 PDF</button>`;
      }

      html += `
        <tr>
          <td><code>${app.id.substring(0, 8)}...</code></td>
          <td>
            <strong>${escapeHtml(app.full_name || 'N/A')}</strong><br>
            <small class="text-muted">${escapeHtml(app.email || '')} | ${escapeHtml(app.mobile || '')}</small>
          </td>
          <td>${escapeHtml(app.purpose || '')}</td>
          <td><code>${escapeHtml(app.payment_utr || 'None')}</code></td>
          <td><span class="badge-status ${getStatusClass(app.status)}">${escapeHtml(app.status)}</span></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm btn-adm-inspect" data-id="${app.id}">Inspect &amp; Action</button>
            ${extraDownloadBtn}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.btn-adm-inspect').forEach(btn => {
      btn.addEventListener('click', () => openAdminReviewModal(btn.getAttribute('data-id')));
    });

    container.querySelectorAll('.btn-adm-download-cert').forEach(btn => {
      btn.addEventListener('click', () => {
        const app = cachedAdminApps.find(a => a.id === btn.getAttribute('data-id'));
        if (app) generateAndDownloadCertificatePdf(app);
      });
    });
  }

  // Admin Inspection Modal (Opens 3 Documents smoothly)
  function openAdminReviewModal(appId) {
    const app = cachedAdminApps.find(a => a.id === appId);
    if (!app) return;

    const modal = document.getElementById('modal-admin-review');
    const body = document.getElementById('modal-review-body');

    body.innerHTML = `
      <div class="grid grid-2">
        <div>
          <h4>Applicant Information</h4>
          <p><strong>Name:</strong> ${escapeHtml(app.full_name)} (${escapeHtml(app.gender)})</p>
          <p><strong>DOB:</strong> ${escapeHtml(app.dob)} | <strong>Nationality:</strong> ${escapeHtml(app.nationality)}</p>
          <p><strong>Father:</strong> ${escapeHtml(app.father_name)} | <strong>Mother:</strong> ${escapeHtml(app.mother_name)}</p>
          <p><strong>Aadhaar / National ID:</strong> ${escapeHtml(app.aadhaar_number)}</p>
          <p><strong>Address:</strong> ${escapeHtml(app.permanent_address)}, ${escapeHtml(app.perm_city)}, ${escapeHtml(app.perm_state)} - ${escapeHtml(app.perm_pin)}</p>
          <p><strong>Duration of Residence:</strong> ${escapeHtml(app.residence_duration)}</p>
          <hr style="margin: 1rem 0;">
          <h4>References</h4>
          <p>1. ${escapeHtml(app.ref1_name)} (${escapeHtml(app.ref1_phone)}) - ${escapeHtml(app.ref1_address)}</p>
          <p>2. ${escapeHtml(app.ref2_name)} (${escapeHtml(app.ref2_phone)}) - ${escapeHtml(app.ref2_address)}</p>
        </div>

        <div>
          <h4>Inspect 3 Uploaded Documents</h4>
          <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:0.5rem;">
            
            <!-- File 1: Photo Preview -->
            <div style="border: 1px solid #E2E8F0; padding: 0.5rem; border-radius: 6px;">
              <strong>1. Applicant Passport Photo:</strong><br>
              ${app.photo_url ? `<img src="${app.photo_url}" style="max-height: 120px; border-radius: 4px; margin-top: 5px; display: block;" alt="Applicant Photo" />` : '<span class="text-muted">No photo uploaded</span>'}
            </div>

            <!-- File 2: Address Proof PDF / Image -->
            <div style="border: 1px solid #E2E8F0; padding: 0.5rem; border-radius: 6px;">
              <strong>2. Address Proof (${escapeHtml(app.address_proof_type || 'Document')}):</strong><br>
              ${app.proof_url ? `<a href="${app.proof_url}" target="_blank" class="btn btn-outline btn-sm" style="margin-top: 5px;">📄 Open / Download Address Proof</a>` : '<span class="text-muted">No proof uploaded</span>'}
            </div>

            <!-- File 3: Other Relevant Document (PDF) -->
            <div style="border: 1px solid #E2E8F0; padding: 0.5rem; border-radius: 6px;">
              <strong>3. Other Relevant Document (PDF):</strong><br>
              ${app.other_doc_url ? `<a href="${app.other_doc_url}" target="_blank" class="btn btn-gold btn-sm" style="margin-top: 5px;">📑 Open / Download Relevant PDF</a>` : '<span class="text-muted">No other document uploaded</span>'}
            </div>

            <!-- Payment Evidence -->
            <div style="border: 1px solid #E2E8F0; padding: 0.5rem; border-radius: 6px;">
              <strong>Payment UTR:</strong> <code>${escapeHtml(app.payment_utr || 'Pending')}</code><br>
              ${app.payment_screenshot_url ? `<a href="${app.payment_screenshot_url}" target="_blank" class="btn btn-outline btn-sm" style="margin-top: 5px;">💳 View Payment Screenshot</a>` : '<span class="text-muted text-sm">No payment screenshot attached</span>'}
            </div>
          </div>
        </div>
      </div>

      <hr style="margin: 1.5rem 0;">

      <div>
        <h4>Administrative Review &amp; Actions</h4>
        <div class="form-group">
          <label for="adm-notes">Internal Administrator Notes</label>
          <textarea id="adm-notes" class="form-control" rows="2">${escapeHtml(app.admin_notes || '')}</textarea>
        </div>

        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1.25rem;">
          <button type="button" class="btn btn-primary" id="btn-adm-approve">Verify Payment &amp; Mark Approved</button>
          <button type="button" class="btn btn-gold" id="btn-adm-issue">Generate &amp; Issue Official Certificate</button>
          <button type="button" class="btn btn-outline" id="btn-adm-reject" style="color:var(--danger); border-color:var(--danger);">Reject Application</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-adm-approve').onclick = () => updateAdminStatus(app.parseObj, 'Approved');
    document.getElementById('btn-adm-issue').onclick = () => issueCertificateParse(app.parseObj, app);
    document.getElementById('btn-adm-reject').onclick = () => {
      const reason = prompt('Enter the formal reason for rejection:');
      if (reason && reason.trim()) {
        updateAdminStatus(app.parseObj, 'Rejected', reason.trim());
      }
    };
  }

  async function updateAdminStatus(parseObj, newStatus, reason = '') {
    try {
      const notes = document.getElementById('adm-notes')?.value || '';
      parseObj.set("status", newStatus);
      parseObj.set("admin_notes", notes);
      if (reason) parseObj.set("rejection_reason", reason);

      await parseObj.save();
      showToast(`Status updated to ${newStatus}.`, 'success');
      document.getElementById('modal-admin-review').classList.add('hidden');
      loadAdminApplications();
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    }
  }

  async function issueCertificateParse(parseObj, app) {
    try {
      // Unique Certificate Serial Number
      const randomKey = Math.random().toString(36).substring(2, 8).toUpperCase();
      const certNo = `JCC-${new Date().getFullYear()}-${randomKey}`;
      const issueDate = new Date().toISOString().split('T')[0];

      const expiryD = new Date();
      expiryD.setMonth(expiryD.getMonth() + 6);
      const expiryDate = expiryD.toISOString().split('T')[0];

      // Save to Certificate Class
      const Certificate = Parse.Object.extend("Certificate");
      const certObj = new Certificate();
      certObj.set("certificate_number", certNo);
      certObj.set("application_id", parseObj.id);
      certObj.set("applicant_name", app.full_name);
      certObj.set("issue_date", issueDate);
      certObj.set("expiry_date", expiryDate);
      certObj.set("is_revoked", false);
      await certObj.save();

      // Update Application Record
      parseObj.set("status", "Certificate Issued");
      parseObj.set("certificate_number", certNo);
      parseObj.set("issue_date", issueDate);
      parseObj.set("expiry_date", expiryDate);
      await parseObj.save();

      showToast(`Certificate ${certNo} successfully issued!`, 'success');
      document.getElementById('modal-admin-review').classList.add('hidden');
      loadAdminApplications();
    } catch (err) {
      showToast('Issuance failed: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     PUBLIC CERTIFICATE VERIFICATION (Live URL & QR Scan Handler)
     ============================================================================= */

  async function handleVerifyCertificate(e) {
    if (e) e.preventDefault();

    const certNo = document.getElementById('verify-cert-id').value.trim().toUpperCase();
    const resultBox = document.getElementById('verify-result-box');

    if (!certNo) {
      showToast('Enter a certificate serial number.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-verify');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Record...';

    try {
      const Certificate = Parse.Object.extend("Certificate");
      const query = new Parse.Query(Certificate);
      query.equalTo("certificate_number", certNo);
      const certRecord = await query.first();

      resultBox.classList.remove('hidden');

      if (!certRecord) {
        resultBox.className = 'verify-result-box verify-invalid';
        resultBox.innerHTML = `
          <h4 style="color:var(--danger);">❌ Certificate Not Found</h4>
          <p>No valid JCC registry clearance certificate corresponds to serial <code>${escapeHtml(certNo)}</code>.</p>
        `;
        return;
      }

      const expiryDateStr = certRecord.get('expiry_date');
      const isExpired = new Date() > new Date(expiryDateStr);
      const isRevoked = certRecord.get('is_revoked') || false;
      const isValid = !isRevoked && !isExpired;

      resultBox.className = `verify-result-box ${isValid ? 'verify-valid' : 'verify-invalid'}`;
      resultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="color:${isValid ? 'var(--success)' : 'var(--danger)'};">
            ${isValid ? '✅ Verified Legitimate Certificate' : '⚠️ Certificate Invalid / Expired'}
          </h4>
          <span class="badge-status ${isValid ? 'badge-status-success' : 'badge-status-danger'}">
            ${isRevoked ? 'Revoked' : (isExpired ? 'Expired' : 'Valid & Active')}
          </span>
        </div>
        <div style="margin-top:0.75rem; font-size:0.9375rem; line-height:1.7;">
          <p><strong>Certificate Serial:</strong> <code>${escapeHtml(certRecord.get('certificate_number'))}</code></p>
          <p><strong>Candidate Full Name:</strong> ${escapeHtml(certRecord.get('applicant_name'))}</p>
          <p><strong>Date of Issuance:</strong> ${certRecord.get('issue_date')}</p>
          <p><strong>Valid Through:</strong> ${certRecord.get('expiry_date')} (6 Months)</p>
          <p><strong>Registry Authority:</strong> Mr. Jahir Narjinary, Kumargram, WB</p>
        </div>
        <div style="margin-top:0.75rem; border-top:1px solid #E2E8F0; padding-top:0.5rem; font-size:0.75rem; color:var(--text-muted);">
          <em>Notice: ${JCC_CONFIG.disclaimerText}</em>
        </div>
      `;
    } catch (err) {
      showToast('Verification lookup failed: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Certificate';
    }
  }

  /* =============================================================================
     PROFESSIONAL HIGH-RESOLUTION PDF GENERATOR
     - JCC Golden Emblem Header
     - Embedded Applicant Photo
     - Father, Mother, Address, DOB, Gender
     - Embedded Scannable Verification QR Code
     ============================================================================= */

  async function generateAndDownloadCertificatePdf(app) {
    if (!window.jspdf) {
      showToast('PDF rendering engine unavailable.', 'warning');
      return;
    }

    showToast('Rendering verified clearance certificate PDF...', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const certNo = app.certificate_number || `JCC-2026-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      
      // Real QR Code Link (When scanned, opens verify tab with serial prefilled)
      const baseUrl = window.location.origin + window.location.pathname;
      const verificationUrl = `${baseUrl}?cert=${encodeURIComponent(certNo)}#verify`;

      let qrImageBase64 = '';
      if (window.QRCode) {
        qrImageBase64 = await QRCode.toDataURL(verificationUrl, { width: 160, margin: 1 });
      }

      // 1. Double Borders (Navy Blue & Gold)
      doc.setDrawColor(10, 25, 47); // Navy
      doc.setLineWidth(1.8);
      doc.rect(10, 10, 190, 277);

      doc.setDrawColor(212, 175, 55); // Gold
      doc.setLineWidth(0.8);
      doc.rect(13, 13, 184, 271);

      // 2. Top Emblem & Header
      doc.setFillColor(10, 25, 47);
      doc.circle(105, 26, 9, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(212, 175, 55);
      doc.text("JCC", 105, 29, { align: "center" });

      doc.setFontSize(20);
      doc.setTextColor(10, 25, 47);
      doc.text("JCC — JAHIR CLEARANCE CERTIFICATE", 105, 42, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Standardized Private Background Screening & Reference Registry", 105, 48, { align: "center" });
      doc.text(`${JCC_CONFIG.officeAddress} | Phone: +91 ${JCC_CONFIG.contactPhone}`, 105, 53, { align: "center" });

      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.6);
      doc.line(25, 58, 185, 58);

      // 3. Serial Number & Issuance Metadata Bar
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(`Certificate No: ${certNo}`, 22, 67);
      doc.text(`Issue Date: ${app.issue_date || new Date().toISOString().split('T')[0]}`, 140, 67);

      // 4. Clearance Endorsement Statement
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      const endorsement = "This is to certify that the personal identification records, residential credentials, and local background references of the applicant detailed below have been formally vetted, verified, and placed on file by the JCC clearance registry.";
      doc.text(doc.splitTextToSize(endorsement, 166), 22, 75);

      // 5. Applicant Particulars Box (With Embedded Photo)
      doc.setFillColor(248, 250, 252);
      doc.rect(22, 86, 166, 88, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(22, 86, 166, 88, "S");

      // Draw Candidate Photo if available
      if (app.photo_url) {
        try {
          doc.addImage(app.photo_url, 'JPEG', 148, 92, 34, 42);
          doc.setDrawColor(212, 175, 55);
          doc.rect(148, 92, 34, 42, "S");
        } catch (_) {}
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(10, 25, 47);

      doc.text("Candidate Full Name:", 26, 96);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.full_name || 'N/A'), 74, 96);

      doc.setFont("helvetica", "bold");
      doc.text("Father's Name:", 26, 105);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.father_name || 'N/A'), 74, 105);

      doc.setFont("helvetica", "bold");
      doc.text("Mother's Name:", 26, 114);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.mother_name || 'N/A'), 74, 114);

      doc.setFont("helvetica", "bold");
      doc.text("Date of Birth & Gender:", 26, 123);
      doc.setFont("helvetica", "normal");
      doc.text(`${app.dob || 'N/A'}  |  ${app.gender || 'N/A'}`, 74, 123);

      doc.setFont("helvetica", "bold");
      doc.text("National ID (Aadhaar):", 26, 132);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.aadhaar_number || 'Verified on File'), 74, 132);

      doc.setFont("helvetica", "bold");
      doc.text("Permanent Address:", 26, 141);
      doc.setFont("helvetica", "normal");
      const fullAddr = `${app.permanent_address || ''}, ${app.perm_city || ''}, ${app.perm_state || ''} - ${app.perm_pin || ''}`;
      doc.text(doc.splitTextToSize(fullAddr, 72), 74, 141);

      doc.setFont("helvetica", "bold");
      doc.text("Screening Purpose:", 26, 163);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.purpose || 'Private Background Reference'), 74, 163);

      // 6. Validity Strip
      doc.setFillColor(254, 243, 199); // Soft Gold
      doc.rect(22, 178, 166, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`VALIDITY: 6 Calendar Months (Valid until ${app.expiry_date || 'N/A'})`, 105, 184.5, { align: "center" });

      // 7. QR Code & Authorized Signatory Block
      if (qrImageBase64) {
        doc.addImage(qrImageBase64, 'PNG', 24, 195, 38, 38);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(10, 25, 47);
        doc.text("Scan QR Code to Verify", 24, 237);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Real-time registry confirmation", 24, 241);
      }

      // Signature block
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text("Mr. Jahir Narjinary", 152, 218, { align: "center" });
      doc.setLineWidth(0.4);
      doc.line(125, 222, 180, 222);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Authorized Registry Officer", 152, 227, { align: "center" });
      doc.text("JCC Operations Authority", 152, 232, { align: "center" });

      // 8. Mandatory Statutory Disclaimer Footer
      doc.setFillColor(241, 245, 249);
      doc.rect(22, 248, 166, 26, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("STATUTORY PRIVATE CLEARANCE NOTICE:", 26, 254);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const disTxt = "This document is an independent private screening credential issued by Mr. Jahir Narjinary. It is NOT an official police clearance certificate (PCC) or government agency certificate. Any misrepresentation is strictly prohibited.";
      doc.text(doc.splitTextToSize(disTxt, 158), 26, 260);

      doc.save(`JCC_Certificate_${certNo}.pdf`);
      showToast('Clearance certificate PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast(`PDF generation error: ${err.message}`, 'error');
    }
  }

  /* =============================================================================
     INITIALIZATION & EVENT LISTENERS
     ============================================================================= */

  document.addEventListener('DOMContentLoaded', () => {
    updateNavAuthUI();

    // Hamburger Mobile Menu
    const menuToggle = document.getElementById('menu-toggle');
    const siteNav = document.getElementById('site-nav');
    if (menuToggle && siteNav) {
      menuToggle.addEventListener('click', () => siteNav.classList.toggle('show'));
    }

    // View Navigation
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-view]');
      if (target) {
        e.preventDefault();
        switchView(target.getAttribute('data-view'));
      }
    });

    // Password Eye Toggles
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-toggle-eye');
      if (btn) {
        e.preventDefault();
        const targetInput = document.getElementById(btn.getAttribute('data-target'));
        if (targetInput) {
          targetInput.type = targetInput.type === 'password' ? 'text' : 'password';
          btn.textContent = targetInput.type === 'password' ? '👁️' : '🙈';
        }
      }
    });

    // Global Logout
    document.getElementById('btn-global-logout')?.addEventListener('click', handleLogout);

    // Form Submissions
    document.getElementById('form-register')?.addEventListener('submit', handleApplicantRegister);
    document.getElementById('form-login')?.addEventListener('submit', handleApplicantLogin);
    document.getElementById('form-admin-login')?.addEventListener('submit', handleAdminLogin);
    document.getElementById('btn-save-draft')?.addEventListener('click', handleSaveDraft);
    document.getElementById('btn-preview-app')?.addEventListener('click', handleApplicationReviewTrigger);
    document.getElementById('btn-preview-confirm')?.addEventListener('click', executeFinalSubmission);
    document.getElementById('btn-preview-back')?.addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('form-payment-submission')?.addEventListener('submit', handlePaymentSubmission);
    document.getElementById('form-verify-certificate')?.addEventListener('submit', handleVerifyCertificate);

    // Same Address Checkbox
    document.getElementById('app-same-address')?.addEventListener('change', (e) => {
      const box = document.getElementById('present-address-box');
      const presentInput = document.getElementById('app-present-address');
      if (e.target.checked) {
        box.classList.add('hidden');
        presentInput.value = document.getElementById('app-perm-address').value;
      } else {
        box.classList.remove('hidden');
      }
    });

    // Other Purpose Toggle
    document.getElementById('app-purpose')?.addEventListener('change', (e) => {
      const box = document.getElementById('other-purpose-box');
      if (e.target.value === 'Other') {
        box.classList.remove('hidden');
      } else {
        box.classList.add('hidden');
      }
    });

    // Dashboard Tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchDashTab(btn.getAttribute('data-tab')));
    });

    document.getElementById('btn-dash-create-app')?.addEventListener('click', () => {
      document.getElementById('form-clearance-app').reset();
      document.getElementById('app-record-id').value = '';
      document.getElementById('form-heading').textContent = 'New Clearance Application';
      switchDashTab('tab-form');
    });

    document.getElementById('btn-sidebar-new-app')?.addEventListener('click', () => {
      document.getElementById('form-clearance-app').reset();
      document.getElementById('app-record-id').value = '';
      document.getElementById('form-heading').textContent = 'New Clearance Application';
      switchDashTab('tab-form');
    });

    // Applicant Status Filters
    document.querySelectorAll('[data-filter]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeApplicantFilter = card.getAttribute('data-filter');
        filterAndRenderApplicantTable();
      });
    });

    // Admin Status Filters
    document.querySelectorAll('[data-admin-filter]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-admin-filter]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeAdminFilter = card.getAttribute('data-admin-filter');
        const filterSelect = document.getElementById('admin-status-filter');
        if (filterSelect) filterSelect.value = activeAdminFilter;
        renderAdminTable();
      });
    });

    // Admin Search & Filter Dropdown
    document.getElementById('admin-status-filter')?.addEventListener('change', (e) => {
      activeAdminFilter = e.target.value;
      document.querySelectorAll('[data-admin-filter]').forEach(c => {
        if (c.getAttribute('data-admin-filter') === activeAdminFilter) c.classList.add('active');
        else c.classList.remove('active');
      });
      renderAdminTable();
    });

    document.getElementById('admin-search-input')?.addEventListener('input', renderAdminTable);
    document.getElementById('btn-admin-refresh')?.addEventListener('click', loadAdminApplications);
    document.getElementById('btn-applicant-refresh')?.addEventListener('click', loadApplicantApplications);

    // Modals Close
    document.getElementById('btn-close-preview-modal')?.addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('btn-close-review-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-review').classList.add('hidden');
    });
    document.getElementById('btn-close-upi-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-upi').classList.add('hidden');
    });

    // Dynamic Admin UPI Settings Modal
    document.getElementById('btn-admin-upi-config')?.addEventListener('click', async () => {
      const modal = document.getElementById('modal-admin-upi');
      try {
        const SystemSettings = Parse.Object.extend("SystemSettings");
        const query = new Parse.Query(SystemSettings);
        const res = await query.first();
        if (res) {
          document.getElementById('cfg-upi-id').value = res.get('upi_id') || JCC_CONFIG.defaultUpiId;
          document.getElementById('cfg-payee-name').value = res.get('payee_name') || JCC_CONFIG.ownerName;
        } else {
          document.getElementById('cfg-upi-id').value = JCC_CONFIG.defaultUpiId;
          document.getElementById('cfg-payee-name').value = JCC_CONFIG.ownerName;
        }
      } catch (_) {}
      modal.classList.remove('hidden');
    });

    document.getElementById('form-upi-settings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const upiId = document.getElementById('cfg-upi-id').value.trim();
      const payee = document.getElementById('cfg-payee-name').value.trim();

      try {
        const SystemSettings = Parse.Object.extend("SystemSettings");
        const query = new Parse.Query(SystemSettings);
        let res = await query.first();
        if (!res) res = new SystemSettings();

        res.set('upi_id', upiId);
        res.set('payee_name', payee);
        await res.save();

        showToast('UPI ID saved! Dynamic QR updated for all payments.', 'success');
        document.getElementById('modal-admin-upi').classList.add('hidden');
      } catch (err) {
        showToast('Failed to save UPI: ' + err.message, 'error');
      }
    });

    // Direct QR Code Auto-Verification via URL (?cert=JCC-2026-XXXXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const certFromUrl = urlParams.get('cert');
    if (certFromUrl) {
      switchView('verify');
      const input = document.getElementById('verify-cert-id');
      if (input) {
        input.value = certFromUrl;
        handleVerifyCertificate(null);
      }
    }
  });

  // Helpers
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