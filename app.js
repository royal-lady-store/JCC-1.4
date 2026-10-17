/**
 * JCC — Jahir Clearance Certificate
 * Official Firebase Backend Engine (Firestore + Auth + Cloud Storage)
 */

(function () {
  'use strict';

  // Your verified Firebase Configuration
  const firebaseConfig = {
    apiKey: "AIzaSyBWAjCpj_FMBHeC6UhkxiNZ6eWfpDZ1GxA",
    authDomain: "jc-clearence.firebaseapp.com",
    projectId: "jc-clearence",
    storageBucket: "jc-clearence.firebasestorage.app",
    messagingSenderId: "793099295258",
    appId: "1:793099295258:web:a5a2c3a0ca9f91d01b4fa3",
    measurementId: "G-W2TL0M2YGC"
  };

  // Core Business Metadata
  const JCC_CONFIG = {
    ownerName: 'Mr. Jahir Narjinary',
    contactPhone: '7384512297',
    contactEmail: 'jahirkumarnarjinary@gmail.com',
    adminEmail: 'jahirnarjinary04@gmail.com',
    officeAddress: 'Alipurduar, Kumargram, West Bengal, 736203, India',
    applicationFeeInr: 100,
    defaultUpiId: '7384512297@upi',
    disclaimerText: 'JCC is a privately operated application assistance service. It is not an official government department, police department, or statutory clearance authority. Any certificate issued must not be represented as an official Police Clearance Certificate.'
  };

  // Initialize Firebase Services
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // State Management Variables
  let activeSessionUser = null;
  let isUserAdmin = false;
  let pendingSubmissionPayload = null;
  let cachedApplicantApps = [];
  let cachedAdminApps = [];

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

  // Single Page Application Navigation Router
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
  }

  // Synchronize Nav Auth State
  function updateNavAuthUI() {
    const unauthGroup = document.getElementById('nav-unauth-group');
    const authGroup = document.getElementById('nav-auth-group');
    const dashBtn = document.getElementById('btn-nav-dashboard');

    if (activeSessionUser) {
      unauthGroup.classList.add('hidden');
      authGroup.classList.remove('hidden');
      if (isUserAdmin) {
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

  // Auth State Listener
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      activeSessionUser = user;
      isUserAdmin = (user.email && user.email.toLowerCase() === JCC_CONFIG.adminEmail.toLowerCase());

      const avatarEl = document.getElementById('dash-avatar');
      const nameEl = document.getElementById('dash-user-name');
      const emailEl = document.getElementById('dash-user-email');

      const displayName = user.displayName || user.email;
      if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = user.email;

      updateNavAuthUI();
    } else {
      activeSessionUser = null;
      isUserAdmin = false;
      updateNavAuthUI();
    }
  });

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
      showToast('You must acknowledge the statutory disclaimer.', 'warning');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters in Firebase.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-reg');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering Account...';

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: fullName });

      // Save user record to Firestore 'profiles' collection
      await db.collection('profiles').doc(cred.user.uid).set({
        full_name: fullName,
        email: email,
        phone: phone,
        is_admin: (email === JCC_CONFIG.adminEmail),
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast('Account registered successfully! Welcome to JCC.', 'success');
      document.getElementById('form-register').reset();
      switchView('dashboard');
      loadApplicantApplications();
    } catch (err) {
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Complete Registration';
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

    const submitBtn = document.getElementById('btn-submit-login');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing In...';

    try {
      await auth.signInWithEmailAndPassword(email, password);
      showToast('Signed in successfully.', 'success');
      switchView('dashboard');
      loadApplicantApplications();
    } catch (err) {
      showToast(err.message || 'Invalid credentials.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault();

    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      showToast('Enter your staff credentials.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-admin-login');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating Staff...';

    try {
      let userCred;
      try {
        userCred = await auth.signInWithEmailAndPassword(email, password);
      } catch (authErr) {
        // If admin account doesn't exist yet in Firebase, auto-create it with provided credentials
        if (email === JCC_CONFIG.adminEmail.toLowerCase() && authErr.code === 'auth/user-not-found') {
          userCred = await auth.createUserWithEmailAndPassword(email, password);
          await userCred.user.updateProfile({ displayName: 'Administrator' });
          await db.collection('profiles').doc(userCred.user.uid).set({
            full_name: 'Administrator',
            email: email,
            is_admin: true,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          throw authErr;
        }
      }

      if (email !== JCC_CONFIG.adminEmail.toLowerCase()) {
        await auth.signOut();
        throw new Error('Access denied: Unauthorized staff account.');
      }

      isUserAdmin = true;
      showToast('Staff clearance authenticated.', 'success');
      switchView('admin');
      loadAdminApplications();
      subscribeToLiveApplications();
    } catch (err) {
      showToast(err.message || 'Staff sign in failed.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Authenticate Staff Session';
    }
  }

  async function handleLogout() {
    await auth.signOut();
    activeSessionUser = null;
    isUserAdmin = false;
    updateNavAuthUI();
    showToast('Signed out.', 'info');
    switchView('home');
  }

  /* =============================================================================
     DOCUMENT SUBMISSIONS WITH FORM PREVIEW
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
    const supportInput = document.getElementById('app-support-file');

    if (photoInput.files.length > 0 && photoInput.files[0].size > 200 * 1024) {
      showToast('Photograph must not exceed 200 KB.', 'error');
      return;
    }
    if (proofInput.files.length > 0 && proofInput.files[0].size > 250 * 1024) {
      showToast('Address proof must not exceed 250 KB.', 'error');
      return;
    }
    if (supportInput.files.length > 0 && supportInput.files[0].size > 2 * 1024 * 1024) {
      showToast('Supporting document must not exceed 2 MB.', 'error');
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
      supportFile: supportInput.files[0] || null
    };

    const previewBody = document.getElementById('modal-preview-body');
    previewBody.innerHTML = `
      <div style="line-height: 1.8;">
        <h4>1. Personal Identification</h4>
        <p><strong>Full Name:</strong> ${escapeHtml(pendingSubmissionPayload.fullName)} (${escapeHtml(pendingSubmissionPayload.gender)})</p>
        <p><strong>DOB:</strong> ${escapeHtml(pendingSubmissionPayload.dob)} | <strong>Nationality:</strong> ${escapeHtml(pendingSubmissionPayload.nationality)}</p>
        <p><strong>Parents:</strong> Father: ${escapeHtml(pendingSubmissionPayload.fatherName)} | Mother: ${escapeHtml(pendingSubmissionPayload.motherName)}</p>
        <p><strong>National ID:</strong> [Aadhaar Redacted] | <strong>Passport:</strong> ${escapeHtml(pendingSubmissionPayload.passport || 'None')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(pendingSubmissionPayload.email)} | ${escapeHtml(pendingSubmissionPayload.mobile)}</p>
        
        <hr style="margin: 1rem 0;">
        <h4>2. Address & Residence Particulars</h4>
        <p><strong>Permanent Address:</strong> ${escapeHtml(pendingSubmissionPayload.permAddress)}, ${escapeHtml(pendingSubmissionPayload.permCity)}, ${escapeHtml(pendingSubmissionPayload.permState)} - ${escapeHtml(pendingSubmissionPayload.permPin)}</p>
        <p><strong>Residence Duration:</strong> ${escapeHtml(pendingSubmissionPayload.residenceDuration)}</p>
        <p><strong>Present Address:</strong> ${escapeHtml(pendingSubmissionPayload.presentAddress)}</p>
        <p><strong>Proof Document Type:</strong> ${escapeHtml(pendingSubmissionPayload.proofType)}</p>

        <hr style="margin: 1rem 0;">
        <h4>3. Clearance Purpose & Two References</h4>
        <p><strong>Purpose:</strong> ${escapeHtml(pendingSubmissionPayload.purpose)} ${pendingSubmissionPayload.otherPurpose ? `(${escapeHtml(pendingSubmissionPayload.otherPurpose)})` : ''}</p>
        <p><strong>Reference 1:</strong> ${escapeHtml(pendingSubmissionPayload.ref1Name)} (${escapeHtml(pendingSubmissionPayload.ref1Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref1Address)}</p>
        <p><strong>Reference 2:</strong> ${escapeHtml(pendingSubmissionPayload.ref2Name)} (${escapeHtml(pendingSubmissionPayload.ref2Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref2Address)}</p>
      </div>
    `;

    document.getElementById('modal-preview').classList.remove('hidden');
  }

  // Upload Files to Firebase Storage & Store in Firestore
  async function executeFinalSubmission() {
    if (!activeSessionUser || !pendingSubmissionPayload) return;

    const confirmBtn = document.getElementById('btn-preview-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Uploading Documents...';

    try {
      let photoUrl = '';
      let proofUrl = '';
      let supportUrl = '';

      // Upload Photo
      if (pendingSubmissionPayload.photoFile) {
        const pRef = storage.ref(`photos/${activeSessionUser.uid}_${Date.now()}`);
        const pSnap = await pRef.put(pendingSubmissionPayload.photoFile);
        photoUrl = await pSnap.ref.getDownloadURL();
      }

      // Upload Address Proof
      if (pendingSubmissionPayload.proofFile) {
        const aRef = storage.ref(`proofs/${activeSessionUser.uid}_${Date.now()}`);
        const aSnap = await aRef.put(pendingSubmissionPayload.proofFile);
        proofUrl = await aSnap.ref.getDownloadURL();
      }

      // Upload Support File
      if (pendingSubmissionPayload.supportFile) {
        const sRef = storage.ref(`support/${activeSessionUser.uid}_${Date.now()}`);
        const sSnap = await sRef.put(pendingSubmissionPayload.supportFile);
        supportUrl = await sSnap.ref.getDownloadURL();
      }

      confirmBtn.textContent = 'Saving Application...';

      const appData = {
        user_id: activeSessionUser.uid,
        status: 'Payment Pending',
        full_name: pendingSubmissionPayload.fullName,
        gender: pendingSubmissionPayload.gender,
        dob: pendingSubmissionPayload.dob,
        nationality: pendingSubmissionPayload.nationality,
        father_name: pendingSubmissionPayload.fatherName,
        mother_name: pendingSubmissionPayload.motherName,
        spouse_name: pendingSubmissionPayload.spouseName || null,
        aadhaar_number: pendingSubmissionPayload.aadhaar,
        passport_number: pendingSubmissionPayload.passport || null,
        email: pendingSubmissionPayload.email,
        mobile: pendingSubmissionPayload.mobile,
        permanent_address: pendingSubmissionPayload.permAddress,
        perm_city: pendingSubmissionPayload.permCity,
        perm_state: pendingSubmissionPayload.permState,
        perm_pin: pendingSubmissionPayload.permPin,
        residence_duration: pendingSubmissionPayload.residenceDuration,
        present_address: pendingSubmissionPayload.presentAddress,
        address_proof_type: pendingSubmissionPayload.proofType,
        purpose: pendingSubmissionPayload.purpose,
        other_purpose: pendingSubmissionPayload.otherPurpose || null,
        ref1_name: pendingSubmissionPayload.ref1Name,
        ref1_phone: pendingSubmissionPayload.ref1Phone,
        ref1_address: pendingSubmissionPayload.ref1Address,
        ref2_name: pendingSubmissionPayload.ref2Name,
        ref2_phone: pendingSubmissionPayload.ref2Phone,
        ref2_address: pendingSubmissionPayload.ref2Address,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (photoUrl) appData.photo_url = photoUrl;
      if (proofUrl) appData.address_proof_url = proofUrl;
      if (supportUrl) appData.supporting_doc_url = supportUrl;

      let savedId = pendingSubmissionPayload.recordId;

      if (savedId) {
        await db.collection('applications').doc(savedId).update(appData);
      } else {
        appData.created_at = firebase.firestore.FieldValue.serverTimestamp();
        const docRef = await db.collection('applications').add(appData);
        savedId = docRef.id;
      }

      document.getElementById('modal-preview').classList.add('hidden');
      document.getElementById('form-clearance-app').reset();
      showToast('Application submitted! Please proceed to payment.', 'success');
      openPaymentInterface(savedId);

    } catch (err) {
      showToast('Submission failed: ' + err.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Final Submit';
    }
  }

  // Save Draft in Firestore
  async function handleSaveDraft() {
    if (!activeSessionUser) {
      showToast('Sign in required to save draft.', 'warning');
      return;
    }

    try {
      const recordId = document.getElementById('app-record-id').value;
      const draftData = {
        user_id: activeSessionUser.uid,
        status: 'Draft',
        full_name: document.getElementById('app-fullname').value.trim() || 'Untitled Draft',
        gender: document.getElementById('app-gender').value || 'Male',
        dob: document.getElementById('app-dob').value || '2000-01-01',
        nationality: document.getElementById('app-nationality').value.trim() || 'India',
        father_name: document.getElementById('app-father-name').value.trim() || 'N/A',
        mother_name: document.getElementById('app-mother-name').value.trim() || 'N/A',
        aadhaar_number: document.getElementById('app-aadhaar').value.trim() || '000000000000',
        email: document.getElementById('app-email').value.trim() || activeSessionUser.email,
        mobile: document.getElementById('app-mobile').value.trim() || '9999999999',
        permanent_address: document.getElementById('app-perm-address').value.trim() || 'N/A',
        perm_city: document.getElementById('app-perm-city').value.trim() || 'N/A',
        perm_state: document.getElementById('app-perm-state').value.trim() || 'N/A',
        perm_pin: document.getElementById('app-perm-pin').value.trim() || '000000',
        residence_duration: document.getElementById('app-residence-duration').value.trim() || 'N/A',
        address_proof_type: document.getElementById('app-proof-type').value || 'Aadhaar',
        purpose: document.getElementById('app-purpose').value || 'Employment',
        ref1_name: document.getElementById('ref1-name').value.trim() || 'N/A',
        ref1_phone: document.getElementById('ref1-phone').value.trim() || '9999999999',
        ref1_address: document.getElementById('ref1-address').value.trim() || 'N/A',
        ref2_name: document.getElementById('ref2-name').value.trim() || 'N/A',
        ref2_phone: document.getElementById('ref2-phone').value.trim() || '9999999999',
        ref2_address: document.getElementById('ref2-address').value.trim() || 'N/A',
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (recordId) {
        await db.collection('applications').doc(recordId).update(draftData);
      } else {
        draftData.created_at = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('applications').add(draftData);
      }

      showToast('Draft saved to online account.', 'info');
      switchDashTab('tab-overview');
    } catch (err) {
      showToast('Failed to save draft: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     APPLICANT DASHBOARD FETCH
     ============================================================================= */

  async function loadApplicantApplications() {
    if (!activeSessionUser) return;
    const container = document.getElementById('applicant-records-container');

    try {
      const snap = await db.collection('applications')
        .where('user_id', '==', activeSessionUser.uid)
        .get();

      cachedApplicantApps = [];
      snap.forEach(doc => {
        cachedApplicantApps.push({ id: doc.id, ...doc.data() });
      });

      // Update Metric Counters
      document.getElementById('count-app-all').textContent = cachedApplicantApps.length;
      document.getElementById('count-app-draft').textContent = cachedApplicantApps.filter(a => a.status === 'Draft').length;
      document.getElementById('count-app-paypending').textContent = cachedApplicantApps.filter(a => a.status === 'Payment Pending').length;
      document.getElementById('count-app-approval').textContent = cachedApplicantApps.filter(a => a.status === 'Pending for Approval').length;
      document.getElementById('count-app-issued').textContent = cachedApplicantApps.filter(a => a.status === 'Certificate Issued').length;
      document.getElementById('count-app-rejected').textContent = cachedApplicantApps.filter(a => a.status === 'Rejected').length;

      renderApplicantTable(cachedApplicantApps);
    } catch (err) {
      container.innerHTML = `<p class="empty-state text-danger">Error retrieving records: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderApplicantTable(apps) {
    const container = document.getElementById('applicant-records-container');
    if (!apps.length) {
      container.innerHTML = '<p class="empty-state">No submissions found. Click "+ Create Application" to begin.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Application ID</th>
            <th>Purpose</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    apps.forEach(app => {
      let actionBtn = '';
      if (app.status === 'Draft' || app.status === 'Additional Information Required') {
        actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-act-edit" data-id="${app.id}">Edit / Resubmit</button>`;
      } else if (app.status === 'Payment Pending') {
        actionBtn = `<button type="button" class="btn btn-gold btn-sm btn-act-pay" data-id="${app.id}">Pay ₹100</button>`;
      } else if (app.status === 'Certificate Issued') {
        actionBtn = `<button type="button" class="btn btn-primary btn-sm btn-act-download" data-id="${app.id}">Download PDF</button>`;
      } else {
        actionBtn = `<span class="text-muted text-sm">Under Review</span>`;
      }

      html += `
        <tr>
          <td><code>${app.id.substring(0, 8)}...</code></td>
          <td>${escapeHtml(app.purpose)}</td>
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
        if (app) downloadCertificatePdf(app);
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
     PAYMENT GATEWAY (₹100 UPI)
     ============================================================================= */

  async function openPaymentInterface(appId) {
    switchDashTab('tab-payment');
    document.getElementById('pay-app-id').value = appId;

    let upiId = JCC_CONFIG.defaultUpiId;
    let payee = JCC_CONFIG.ownerName;

    try {
      const cfgSnap = await db.collection('system_settings').doc('general').get();
      if (cfgSnap.exists) {
        const cfg = cfgSnap.data();
        upiId = cfg.upi_id || upiId;
        payee = cfg.payee_name || payee;
      }
    } catch (_) {}

    document.getElementById('payee-name-display').textContent = payee;
    document.getElementById('payee-upi-display').textContent = upiId;

    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=100.00&cu=INR&tn=JCC_Fee`;

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
      showToast('UTR reference number is required.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-confirm-payment');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading Proof...';

    try {
      let screenshotUrl = '';
      if (screenshotInput.files.length > 0) {
        const file = screenshotInput.files[0];
        const sRef = storage.ref(`payments/${activeSessionUser.uid}_${Date.now()}`);
        const snap = await sRef.put(file);
        screenshotUrl = await snap.ref.getDownloadURL();
      }

      const updatePayload = {
        payment_utr: utr,
        status: 'Payment Verification Pending',
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (screenshotUrl) updatePayload.payment_screenshot_url = screenshotUrl;

      await db.collection('applications').doc(appId).update(updatePayload);

      showToast('Payment submitted for administrator review.', 'success');
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
     ADMIN DASHBOARD & REALTIME SUBSCRIPTIONS
     ============================================================================= */

  async function loadAdminApplications() {
    if (!isUserAdmin) return;
    const container = document.getElementById('admin-table-container');

    try {
      const snap = await db.collection('applications').get();
      cachedAdminApps = [];
      snap.forEach(doc => {
        cachedAdminApps.push({ id: doc.id, ...doc.data() });
      });

      document.getElementById('admin-count-all').textContent = cachedAdminApps.length;
      document.getElementById('admin-count-payverify').textContent = cachedAdminApps.filter(a => a.status === 'Payment Verification Pending').length;
      document.getElementById('admin-count-approval').textContent = cachedAdminApps.filter(a => a.status === 'Pending for Approval').length;
      document.getElementById('admin-count-review').textContent = cachedAdminApps.filter(a => a.status === 'Under Review').length;
      document.getElementById('admin-count-issued').textContent = cachedAdminApps.filter(a => a.status === 'Certificate Issued').length;
      document.getElementById('admin-count-rejected').textContent = cachedAdminApps.filter(a => a.status === 'Rejected').length;

      renderAdminTable();
    } catch (err) {
      container.innerHTML = `<p class="empty-state text-danger">Error retrieving database records: ${escapeHtml(err.message)}</p>`;
    }
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

  function subscribeToLiveApplications() {
    db.collection('applications').onSnapshot(() => {
      loadAdminApplications();
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
          <h4>Applicant Information</h4>
          <p><strong>Name:</strong> ${escapeHtml(app.full_name)} (${escapeHtml(app.gender)})</p>
          <p><strong>DOB:</strong> ${escapeHtml(app.dob)} | <strong>Nationality:</strong> ${escapeHtml(app.nationality)}</p>
          <p><strong>Parents:</strong> Father: ${escapeHtml(app.father_name)} | Mother: ${escapeHtml(app.mother_name)}</p>
          <p><strong>National ID:</strong> [Aadhaar Redacted]</p>
          <p><strong>Permanent Address:</strong> ${escapeHtml(app.permanent_address)}, ${escapeHtml(app.perm_city)}, ${escapeHtml(app.perm_state)} - ${escapeHtml(app.perm_pin)}</p>
          <p><strong>Residence Duration:</strong> ${escapeHtml(app.residence_duration)}</p>
          <hr style="margin: 1rem 0;">
          <h4>Two References</h4>
          <p>1. ${escapeHtml(app.ref1_name)} (${escapeHtml(app.ref1_phone)}) - ${escapeHtml(app.ref1_address)}</p>
          <p>2. ${escapeHtml(app.ref2_name)} (${escapeHtml(app.ref2_phone)}) - ${escapeHtml(app.ref2_address)}</p>
        </div>

        <div>
          <h4>Document Evidence</h4>
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
            ${app.photo_url ? `<a href="${app.photo_url}" target="_blank" class="btn btn-outline btn-sm">📷 View Applicant Photo</a>` : '<span class="text-muted">No photo uploaded</span>'}
            ${app.address_proof_url ? `<a href="${app.address_proof_url}" target="_blank" class="btn btn-outline btn-sm">📄 View Address Proof (${escapeHtml(app.address_proof_type)})</a>` : '<span class="text-muted">No address proof uploaded</span>'}
            ${app.payment_screenshot_url ? `<a href="${app.payment_screenshot_url}" target="_blank" class="btn btn-outline btn-sm">💳 View Payment Evidence</a>` : '<span class="text-muted">No payment screenshot</span>'}
          </div>
          <p style="margin-top:1rem;"><strong>UTR Number:</strong> <code>${escapeHtml(app.payment_utr || 'None')}</code></p>
        </div>
      </div>

      <hr style="margin: 1.5rem 0;">

      <div>
        <h4>Administrative Actions</h4>
        <div class="form-group">
          <label for="adm-notes">Internal Administrator Notes</label>
          <textarea id="adm-notes" class="form-control" rows="2">${escapeHtml(app.admin_notes || '')}</textarea>
        </div>

        <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1.25rem;">
          <button type="button" class="btn btn-primary" id="btn-adm-approve">Verify &amp; Approve</button>
          <button type="button" class="btn btn-gold" id="btn-adm-issue">Issue Official Certificate</button>
          <button type="button" class="btn btn-outline" id="btn-adm-reject" style="color:var(--danger); border-color:var(--danger);">Reject Application</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-adm-approve').onclick = () => updateAdminStatus(app.id, 'Approved');
    document.getElementById('btn-adm-issue').onclick = () => issueCertificateFirestore(app);
    document.getElementById('btn-adm-reject').onclick = () => {
      const reason = prompt('Enter the formal reason for rejection:');
      if (reason && reason.trim()) {
        updateAdminStatus(app.id, 'Rejected', reason.trim());
      }
    };
  }

  async function updateAdminStatus(appId, newStatus, reason = '') {
    try {
      const notes = document.getElementById('adm-notes')?.value || '';
      const updateData = {
        status: newStatus,
        admin_notes: notes,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (reason) updateData.rejection_reason = reason;

      await db.collection('applications').doc(appId).update(updateData);
      showToast(`Status updated to ${newStatus}.`, 'success');
      document.getElementById('modal-admin-review').classList.add('hidden');
      loadAdminApplications();
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    }
  }

  async function issueCertificateFirestore(app) {
    try {
      const certNo = 'JCC-' + new Date().getFullYear() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const issueDate = new Date().toISOString().split('T')[0];

      const expiryD = new Date();
      expiryD.setMonth(expiryD.getMonth() + 6);
      const expiryDate = expiryD.toISOString().split('T')[0];

      // Save to certificates collection
      await db.collection('certificates').doc(certNo).set({
        certificate_number: certNo,
        application_id: app.id,
        user_id: app.user_id,
        applicant_name: app.full_name,
        issue_date: issueDate,
        expiry_date: expiryDate,
        is_revoked: false,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Update application record
      await db.collection('applications').doc(app.id).update({
        status: 'Certificate Issued',
        certificate_number: certNo,
        issue_date: issueDate,
        expiry_date: expiryDate,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast(`Certificate ${certNo} issued!`, 'success');
      document.getElementById('modal-admin-review').classList.add('hidden');
      loadAdminApplications();
    } catch (err) {
      showToast('Issuance failed: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     PUBLIC CERTIFICATE VERIFICATION & CLIENT PDF GENERATION
     ============================================================================= */

  async function handleVerifyCertificate(e) {
    e.preventDefault();

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
      const doc = await db.collection('certificates').doc(certNo).get();
      resultBox.classList.remove('hidden');

      if (!doc.exists) {
        resultBox.className = 'verify-result-box verify-invalid';
        resultBox.innerHTML = `
          <h4 style="color:var(--danger);">❌ Certificate Not Found</h4>
          <p>No valid JCC registry clearance certificate corresponds to serial <code>${escapeHtml(certNo)}</code>.</p>
        `;
        return;
      }

      const data = doc.data();
      const isExpired = new Date() > new Date(data.expiry_date);
      const isValid = !data.is_revoked && !isExpired;

      resultBox.className = `verify-result-box ${isValid ? 'verify-valid' : 'verify-invalid'}`;
      resultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="color:${isValid ? 'var(--success)' : 'var(--danger)'};">
            ${isValid ? '✅ Verified Legitimate Certificate' : '⚠️ Certificate Invalid'}
          </h4>
          <span class="badge-status ${isValid ? 'badge-status-success' : 'badge-status-danger'}">
            ${data.is_revoked ? 'Revoked' : (isExpired ? 'Expired' : 'Valid & Active')}
          </span>
        </div>
        <div style="margin-top:0.75rem; font-size:0.9375rem; line-height:1.7;">
          <p><strong>Certificate Serial:</strong> <code>${escapeHtml(data.certificate_number)}</code></p>
          <p><strong>Candidate Name:</strong> ${escapeHtml(data.applicant_name)}</p>
          <p><strong>Date of Issuance:</strong> ${data.issue_date}</p>
          <p><strong>Valid Through:</strong> ${data.expiry_date}</p>
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

  async function downloadCertificatePdf(app) {
    if (!window.jspdf) {
      showToast('PDF rendering engine unavailable.', 'warning');
      return;
    }

    showToast('Rendering official certificate PDF...', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const certNo = app.certificate_number || 'JCC-CERT';
      const verificationUrl = `${window.location.origin}${window.location.pathname}?cert=${certNo}#verify`;

      let qrImageBase64 = '';
      if (window.QRCode) {
        qrImageBase64 = await QRCode.toDataURL(verificationUrl, { width: 140, margin: 1 });
      }

      // Border Styling
      doc.setDrawColor(10, 25, 47);
      doc.setLineWidth(1.8);
      doc.rect(10, 10, 190, 277);

      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.6);
      doc.rect(13, 13, 184, 271);

      // Title & Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(10, 25, 47);
      doc.text("JCC — Jahir Clearance Certificate", 105, 30, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Independent Private Background Record Screening Registry", 105, 36, { align: "center" });
      doc.text(`${JCC_CONFIG.officeAddress} | Phone: +91 ${JCC_CONFIG.contactPhone}`, 105, 41, { align: "center" });

      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.5);
      doc.line(30, 46, 180, 46);

      // Details
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(`Registry Serial: ${certNo}`, 22, 56);
      doc.text(`Issue Date: ${app.issue_date || 'N/A'}`, 144, 56);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const statement = "This clearance document confirms that the identity records, address proofs, and local references provided by the applicant identified below have been screened and cataloged in accordance with the established private verification procedures of JCC.";
      doc.text(doc.splitTextToSize(statement, 166), 22, 68);

      // Box
      doc.setFillColor(248, 250, 252);
      doc.rect(22, 82, 166, 75, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(22, 82, 166, 75, "S");

      doc.setFont("helvetica", "bold");
      doc.text("Candidate Legal Name:", 26, 92);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.full_name || ''), 78, 92);

      doc.setFont("helvetica", "bold");
      doc.text("Parent / Guardian Name:", 26, 102);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.father_name || ''), 78, 102);

      doc.setFont("helvetica", "bold");
      doc.text("DOB & Gender:", 26, 112);
      doc.setFont("helvetica", "normal");
      doc.text(`${app.dob || ''} | ${app.gender || ''}`, 78, 112);

      doc.setFont("helvetica", "bold");
      doc.text("Verified Address:", 26, 122);
      doc.setFont("helvetica", "normal");
      const addressLine = `${app.permanent_address || ''}, ${app.perm_city || ''}, ${app.perm_state || ''} - ${app.perm_pin || ''}`;
      doc.text(doc.splitTextToSize(addressLine, 106), 78, 122);

      doc.setFont("helvetica", "bold");
      doc.text("Screening Purpose:", 26, 142);
      doc.setFont("helvetica", "normal");
      doc.text(String(app.purpose || ''), 78, 142);

      // Validity
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 83, 9);
      doc.text(`Validity Period: 6 Calendar Months (Valid through ${app.expiry_date || 'N/A'})`, 22, 168);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text("Mr. Jahir Narjinary", 44, 180, { align: "center" });

      if (qrImageBase64) {
        doc.addImage(qrImageBase64, 'PNG', 24, 184, 40, 40);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Scan QR code to access live registry confirmation", 22, 228);
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(JCC_CONFIG.ownerName, 142, 212);
      doc.setFont("helvetica", "normal");
      doc.text("Authorized Registry Officer", 136, 217);
      doc.text("JCC Operations Authority", 138, 222);
      doc.setLineWidth(0.4);
      doc.line(130, 207, 186, 207);

      // Statutory Disclaimer
      doc.setFillColor(254, 243, 199);
      doc.rect(22, 244, 166, 26, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(146, 64, 14);
      doc.text("MANDATORY PRIVATE SERVICE DISCLAIMER:", 26, 251);
      doc.setFont("helvetica", "normal");
      const disclaimerPara = "This certificate is a private credentialing document. It does NOT represent an official police clearance certificate (PCC) or government agency authorization.";
      doc.text(doc.splitTextToSize(disclaimerPara, 158), 26, 257);

      doc.save(`JCC_Certificate_${certNo}.pdf`);
      showToast('Clearance certificate PDF downloaded.', 'success');
    } catch (err) {
      showToast(`PDF generation error: ${err.message}`, 'error');
    }
  }

  /* =============================================================================
     CONTACT INQUIRY FORM
     ============================================================================= */

  async function handleContactSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !email || !subject || !message) {
      showToast('Please fill out all contact fields.', 'warning');
      return;
    }

    try {
      await db.collection('contact_messages').add({
        name, email, subject, message,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast('Your message has been stored in our registry desk.', 'success');
      document.getElementById('form-contact').reset();
    } catch (err) {
      showToast('Failed to record message: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     INITIALIZATION & EVENT BINDINGS
     ============================================================================= */

  document.addEventListener('DOMContentLoaded', () => {
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
        switchView(target.getAttribute('data-view'));
      }
    });

    // Password visibility eye toggles
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

    // Form Event Bindings
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
    document.getElementById('form-contact')?.addEventListener('submit', handleContactSubmit);

    // Address Mirror Checkbox
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

    // Purpose Other Conditional Toggle
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

    // Admin Filter Selection
    document.querySelectorAll('[data-admin-filter]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-admin-filter]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const filter = card.getAttribute('data-admin-filter');
        const filterSelect = document.getElementById('admin-status-filter');
        if (filterSelect) {
          filterSelect.value = filter;
          renderAdminTable();
        }
      });
    });

    // Applicant Status Filter Selection
    document.querySelectorAll('[data-filter]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const filter = card.getAttribute('data-filter');
        let filtered = cachedApplicantApps;
        if (filter !== 'ALL') {
          filtered = cachedApplicantApps.filter(a => a.status === filter);
        }
        renderApplicantTable(filtered);
      });
    });

    // Modals
    document.getElementById('btn-close-preview-modal')?.addEventListener('click', () => {
      document.getElementById('modal-preview').classList.add('hidden');
    });
    document.getElementById('btn-close-review-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-review').classList.add('hidden');
    });
    document.getElementById('btn-close-upi-modal')?.addEventListener('click', () => {
      document.getElementById('modal-admin-upi').classList.add('hidden');
    });

    // Admin Controls
    document.getElementById('admin-status-filter')?.addEventListener('change', renderAdminTable);
    document.getElementById('admin-search-input')?.addEventListener('input', renderAdminTable);
    document.getElementById('btn-admin-refresh')?.addEventListener('click', loadAdminApplications);

    // Admin UPI Config Modal
    document.getElementById('btn-admin-upi-config')?.addEventListener('click', async () => {
      const modal = document.getElementById('modal-admin-upi');
      try {
        const snap = await db.collection('system_settings').doc('general').get();
        if (snap.exists) {
          const cfg = snap.data();
          document.getElementById('cfg-upi-id').value = cfg.upi_id || '';
          document.getElementById('cfg-payee-name').value = cfg.payee_name || '';
        }
      } catch (_) {}
      modal.classList.remove('hidden');
    });

    document.getElementById('form-upi-settings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const upiId = document.getElementById('cfg-upi-id').value.trim();
      const payee = document.getElementById('cfg-payee-name').value.trim();

      try {
        await db.collection('system_settings').doc('general').set({
          upi_id: upiId,
          payee_name: payee,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('UPI payment configuration saved.', 'success');
        document.getElementById('modal-admin-upi').classList.add('hidden');
      } catch (err) {
        showToast('Failed to save settings: ' + err.message, 'error');
      }
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