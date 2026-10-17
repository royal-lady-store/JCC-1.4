/**
 * JCC — Jahir Clearance Certificate
 * Robust Single-Bundle Application Orchestrator & Live State Engine
 */

(function () {
  'use strict';

  // Explicit Supabase Configuration Constants
  const SUPABASE_URL = "https://swackggwmzjnikesfvnf.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pMYO7tvI8blebYkvnMm8hQ_PrfaNgMF";

  // Core Business Metadata & Static Configuration Constants
  const JCC_CONFIG = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    ownerName: 'Mr. Jahir Narjinary',
    contactPhone: '7384512297',
    contactEmail: 'jahirkumarnarjinary@gmail.com',
    adminTargetEmail: 'jahirnarjinary04@gmail.com',
    officeAddress: 'Alipurduar, Kumargram, West Bengal, 736203, India',
    applicationFeeInr: 100,
    defaultUpiId: '7384512297@upi',
    disclaimerText: 'JCC is a privately operated application assistance service. It is not an official government department, police department, or statutory clearance authority. Any certificate issued must not be represented as an official Police Clearance Certificate.'
  };

  // State Management Variables
  let supabaseClient = null;
  let activeSessionUser = null;
  let isUserAdmin = false;
  let pendingSubmissionPayload = null;
  let cachedApplicantApps = [];
  let cachedAdminApps = [];

  // Initialize Supabase Client with fail-safe validation
  function initSupabase() {
    const targetUrl = JCC_CONFIG.supabaseUrl || localStorage.getItem('jcc_supabase_url');
    const targetKey = JCC_CONFIG.supabaseAnonKey || localStorage.getItem('jcc_supabase_key');

    if (targetUrl && targetKey && window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(targetUrl, targetKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
      return true;
    }
    return false;
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

  // Restore authenticated session and determine role server-side
  async function syncSession() {
    if (!supabaseClient) {
      switchView('setup');
      return;
    }

    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;

      if (session && session.user) {
        activeSessionUser = session.user;

        // Query profiles table to determine admin status
        const { data: profile, error: profileErr } = await supabaseClient
          .from('profiles')
          .select('full_name, is_admin')
          .eq('id', activeSessionUser.id)
          .single();

        if (profileErr) {
          console.warn("Profile table record not found or inaccessible:", profileErr.message);
        }

        isUserAdmin = Boolean(profile && profile.is_admin);

        const avatarEl = document.getElementById('dash-avatar');
        const nameEl = document.getElementById('dash-user-name');
        const emailEl = document.getElementById('dash-user-email');

        const displayName = (profile && profile.full_name) || activeSessionUser.email;
        if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = displayName;
        if (emailEl) emailEl.textContent = activeSessionUser.email;

        updateNavAuthUI();
      } else {
        activeSessionUser = null;
        isUserAdmin = false;
        updateNavAuthUI();
      }
    } catch (err) {
      console.warn("Session synchronization notice:", err.message);
    }
  }

  // Calculate 6 Calendar Months with Snap to End of Month
  function calculateSixMonthExpiry(dateStr) {
    const d = new Date(dateStr);
    const startDay = d.getDate();
    d.setMonth(d.getMonth() + 6);
    if (d.getDate() !== startDay) {
      d.setDate(0); // Snap to last day of target month
    }
    return d.toISOString().split('T')[0];
  }

  /* =============================================================================
     AUTHENTICATION HANDLERS
     ============================================================================= */

  async function handleApplicantRegister(e) {
    e.preventDefault();
    if (!supabaseClient) {
      showToast('Backend is not configured. Please supply Supabase keys.', 'error');
      switchView('setup');
      return;
    }

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
      showToast('Password must be at least 8 characters.', 'warning');
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
      const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            user_id_alias: userId,
            full_name: fullName,
            phone: phone
          }
        }
      });

      if (error) throw error;

      showToast('Account registered! You may now sign in from any device.', 'success');
      document.getElementById('form-register').reset();
      switchView('login');
    } catch (err) {
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Complete Registration';
    }
  }

  async function handleApplicantLogin(e) {
    e.preventDefault();
    if (!supabaseClient) {
      showToast('Backend is not connected.', 'error');
      switchView('setup');
      return;
    }

    const identifier = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
      showToast('Enter your User ID/email and password.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-login');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing In...';

    try {
      let loginEmail = identifier;
      // If user provided a username rather than an email, look it up in public.profiles
      if (!identifier.includes('@')) {
        const { data: profileMatch } = await supabaseClient
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .single();

        if (profileMatch && profileMatch.email) {
          loginEmail = profileMatch.email;
        }
      }

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail,
        password: password
      });

      if (error) throw error;

      await syncSession();
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
    if (!supabaseClient) {
      showToast('Backend is not connected.', 'error');
      switchView('setup');
      return;
    }

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
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) throw error;

      // Verify that the user has is_admin = true on public.profiles
      const { data: profile, error: profErr } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', data.user.id)
        .single();

      if (profErr || !profile || !profile.is_admin) {
        await supabaseClient.auth.signOut();
        throw new Error('Access denied: User lacks authorized administrator role.');
      }

      await syncSession();
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
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    activeSessionUser = null;
    isUserAdmin = false;
    updateNavAuthUI();
    showToast('Signed out.', 'info');
    switchView('home');
  }

  /* =============================================================================
     DOCUMENT SUBMISSIONS WITH FORM PREVIEW & ERROR ROLLBACK
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

    // Render Full Form Preview with Sensitive Identifiers Redacted
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
        <p><strong>Proof of Address Document Type:</strong> ${escapeHtml(pendingSubmissionPayload.proofType)}</p>

        <hr style="margin: 1rem 0;">
        <h4>3. Clearance Purpose & Two References</h4>
        <p><strong>Purpose:</strong> ${escapeHtml(pendingSubmissionPayload.purpose)} ${pendingSubmissionPayload.otherPurpose ? `(${escapeHtml(pendingSubmissionPayload.otherPurpose)})` : ''}</p>
        <p><strong>Reference 1:</strong> ${escapeHtml(pendingSubmissionPayload.ref1Name)} (${escapeHtml(pendingSubmissionPayload.ref1Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref1Address)}</p>
        <p><strong>Reference 2:</strong> ${escapeHtml(pendingSubmissionPayload.ref2Name)} (${escapeHtml(pendingSubmissionPayload.ref2Phone)}) - ${escapeHtml(pendingSubmissionPayload.ref2Address)}</p>

        <hr style="margin: 1rem 0;">
        <h4>4. Document Upload Readiness</h4>
        <p><strong>Photograph:</strong> ${pendingSubmissionPayload.photoFile ? `Ready (${pendingSubmissionPayload.photoFile.name})` : 'Existing/None'}</p>
        <p><strong>Address Proof:</strong> ${pendingSubmissionPayload.proofFile ? `Ready (${pendingSubmissionPayload.proofFile.name})` : 'Existing/None'}</p>
        <p><strong>Supporting Document:</strong> ${pendingSubmissionPayload.supportFile ? `Ready (${pendingSubmissionPayload.supportFile.name})` : 'None'}</p>
      </div>
    `;

    document.getElementById('modal-preview').classList.remove('hidden');
  }

  // Execute Submission with Automatic Rollback Protection
  async function executeFinalSubmission() {
    if (!activeSessionUser || !pendingSubmissionPayload || !supabaseClient) return;

    const confirmBtn = document.getElementById('btn-preview-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Uploading Documents...';

    const uploadedPaths = [];

    try {
      let photoPath = null;
      let proofPath = null;
      let supportPath = null;

      // 1. Upload photo to private storage bucket 'applicant-photos'
      if (pendingSubmissionPayload.photoFile) {
        const ext = pendingSubmissionPayload.photoFile.name.split('.').pop();
        const pPath = `${activeSessionUser.id}/${Date.now()}_photo.${ext}`;
        const { error: upErr } = await supabaseClient.storage.from('applicant-photos').upload(pPath, pendingSubmissionPayload.photoFile);
        if (upErr) throw new Error('Photograph upload failed: ' + upErr.message);
        photoPath = pPath;
        uploadedPaths.push({ bucket: 'applicant-photos', path: pPath });
      }

      // 2. Upload address proof to private storage bucket 'address-proofs'
      if (pendingSubmissionPayload.proofFile) {
        const ext = pendingSubmissionPayload.proofFile.name.split('.').pop();
        const aPath = `${activeSessionUser.id}/${Date.now()}_proof.${ext}`;
        const { error: upErr } = await supabaseClient.storage.from('address-proofs').upload(aPath, pendingSubmissionPayload.proofFile);
        if (upErr) throw new Error('Address proof upload failed: ' + upErr.message);
        proofPath = aPath;
        uploadedPaths.push({ bucket: 'address-proofs', path: aPath });
      }

      // 3. Upload optional support file
      if (pendingSubmissionPayload.supportFile) {
        const sPath = `${activeSessionUser.id}/${Date.now()}_support.pdf`;
        const { error: upErr } = await supabaseClient.storage.from('address-proofs').upload(sPath, pendingSubmissionPayload.supportFile);
        if (upErr) throw new Error('Supporting document upload failed: ' + upErr.message);
        supportPath = sPath;
        uploadedPaths.push({ bucket: 'address-proofs', path: sPath });
      }

      confirmBtn.textContent = 'Saving Application Record...';

      // 4. Save Database Record
      const dbPayload = {
        user_id: activeSessionUser.id,
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
        updated_at: new Date().toISOString()
      };

      if (photoPath) dbPayload.photo_url = photoPath;
      if (proofPath) dbPayload.address_proof_url = proofPath;
      if (supportPath) dbPayload.supporting_doc_url = supportPath;

      let savedId = pendingSubmissionPayload.recordId;

      if (savedId) {
        const { error: updateErr } = await supabaseClient
          .from('applications')
          .update(dbPayload)
          .eq('id', savedId);
        if (updateErr) throw updateErr;
      } else {
        const { data: newRow, error: insertErr } = await supabaseClient
          .from('applications')
          .insert(dbPayload)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        savedId = newRow.id;
      }

      // Record Status Audit
      await supabaseClient.from('status_audit_log').insert({
        application_id: savedId,
        changed_by: activeSessionUser.id,
        new_status: 'Payment Pending',
        note: 'Application successfully verified and submitted by applicant.'
      });

      document.getElementById('modal-preview').classList.add('hidden');
      document.getElementById('form-clearance-app').reset();
      showToast('Application submitted successfully! Please proceed to payment.', 'success');
      openPaymentInterface(savedId);

    } catch (err) {
      // Safe cleanup rollback for uploaded files if DB save fails
      for (const item of uploadedPaths) {
        await supabaseClient.storage.from(item.bucket).remove([item.path]);
      }
      showToast('Submission error: ' + err.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Final Submit';
    }
  }

  // Save Draft (Without Upload Requirement)
  async function handleSaveDraft() {
    if (!activeSessionUser || !supabaseClient) {
      showToast('Sign in required to save draft.', 'warning');
      return;
    }

    try {
      const recordId = document.getElementById('app-record-id').value;
      const dbPayload = {
        user_id: activeSessionUser.id,
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
        ref2_address: document.getElementById('ref2-address').value.trim() || 'N/A'
      };

      if (recordId) {
        await supabaseClient.from('applications').update(dbPayload).eq('id', recordId);
      } else {
        await supabaseClient.from('applications').insert(dbPayload);
      }

      showToast('Draft saved to online account.', 'info');
      switchDashTab('tab-overview');
    } catch (err) {
      showToast('Failed to save draft: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     APPLICANT DASHBOARD FETCH & ACTIONS
     ============================================================================= */

  async function loadApplicantApplications() {
    if (!activeSessionUser || !supabaseClient) return;
    const container = document.getElementById('applicant-records-container');

    try {
      const { data: apps, error } = await supabaseClient
        .from('applications')
        .select('*, certificates(*)')
        .eq('user_id', activeSessionUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      cachedApplicantApps = apps || [];

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
            <th>Submitted On</th>
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
      } else if (app.status === 'Certificate Issued' && app.certificates && app.certificates.length > 0) {
        actionBtn = `<button type="button" class="btn btn-primary btn-sm btn-act-download" data-id="${app.id}">Download PDF</button>`;
      } else {
        actionBtn = `<span class="text-muted text-sm">Under Review</span>`;
      }

      html += `
        <tr>
          <td><code>${app.id.substring(0, 8)}...</code></td>
          <td>${escapeHtml(app.purpose)}</td>
          <td><span class="badge-status ${getStatusClass(app.status)}">${escapeHtml(app.status)}</span></td>
          <td>${new Date(app.created_at).toLocaleDateString()}</td>
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
        if (app && app.certificates && app.certificates[0]) {
          downloadCertificatePdf(app, app.certificates[0]);
        }
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

    if (supabaseClient) {
      const { data: cfg } = await supabaseClient.from('system_settings').select('*').eq('id', 1).single();
      if (cfg) {
        upiId = cfg.upi_id || upiId;
        payee = cfg.payee_name || payee;
      }
    }

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
    if (!supabaseClient) return;

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
      let screenshotPath = null;
      if (screenshotInput.files.length > 0) {
        const file = screenshotInput.files[0];
        if (file.size > 2 * 1024 * 1024) throw new Error('Payment screenshot cannot exceed 2 MB.');
        const ext = file.name.split('.').pop();
        const pPath = `${activeSessionUser.id}/${Date.now()}_payment.${ext}`;
        const { error: upErr } = await supabaseClient.storage.from('payment-evidence').upload(pPath, file);
        if (upErr) throw upErr;
        screenshotPath = pPath;
      }

      const updatePayload = {
        payment_utr: utr,
        status: 'Payment Verification Pending',
        updated_at: new Date().toISOString()
      };
      if (screenshotPath) updatePayload.payment_screenshot_url = screenshotPath;

      const { error: dbErr } = await supabaseClient
        .from('applications')
        .update(updatePayload)
        .eq('id', appId);
      if (dbErr) throw dbErr;

      await supabaseClient.from('status_audit_log').insert({
        application_id: appId,
        changed_by: activeSessionUser.id,
        new_status: 'Payment Verification Pending',
        note: `Payment UTR recorded: ${utr}`
      });

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
     ADMIN DASHBOARD & LIVE APPLICATION SUBSCRIPTION
     ============================================================================= */

  async function loadAdminApplications() {
    if (!isUserAdmin || !supabaseClient) return;
    const container = document.getElementById('admin-table-container');

    try {
      const { data: apps, error } = await supabaseClient
        .from('applications')
        .select('*, certificates(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      cachedAdminApps = apps || [];

      // Update counters
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

  // Real-time PostgreSQL subscription
  function subscribeToLiveApplications() {
    if (!supabaseClient) return;
    supabaseClient
      .channel('public:applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        loadAdminApplications();
      })
      .subscribe();
  }

  async function openAdminReviewModal(appId) {
    const app = cachedAdminApps.find(a => a.id === appId);
    if (!app) return;

    const modal = document.getElementById('modal-admin-review');
    const body = document.getElementById('modal-review-body');

    let photoSignedUrl = '';
    let proofSignedUrl = '';
    let paymentSignedUrl = '';

    if (app.photo_url) {
      const { data } = await supabaseClient.storage.from('applicant-photos').createSignedUrl(app.photo_url, 3600);
      if (data && data.signedUrl) photoSignedUrl = data.signedUrl;
    }
    if (app.address_proof_url) {
      const { data } = await supabaseClient.storage.from('address-proofs').createSignedUrl(app.address_proof_url, 3600);
      if (data && data.signedUrl) proofSignedUrl = data.signedUrl;
    }
    if (app.payment_screenshot_url) {
      const { data } = await supabaseClient.storage.from('payment-evidence').createSignedUrl(app.payment_screenshot_url, 3600);
      if (data && data.signedUrl) paymentSignedUrl = data.signedUrl;
    }

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
          <h4>Private Document Evidence</h4>
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
            ${photoSignedUrl ? `<a href="${photoSignedUrl}" target="_blank" class="btn btn-outline btn-sm">📷 View Applicant Photo</a>` : '<span class="text-muted">No photo uploaded</span>'}
            ${proofSignedUrl ? `<a href="${proofSignedUrl}" target="_blank" class="btn btn-outline btn-sm">📄 View Address Proof (${escapeHtml(app.address_proof_type)})</a>` : '<span class="text-muted">No address proof uploaded</span>'}
            ${paymentSignedUrl ? `<a href="${paymentSignedUrl}" target="_blank" class="btn btn-outline btn-sm">💳 View Payment Evidence</a>` : '<span class="text-muted">No payment screenshot</span>'}
          </div>
          <p style="margin-top:1rem;"><strong>UTR Number:</strong> <code>${escapeHtml(app.payment_utr || 'None')}</code></p>
        </div>
      </div>

      <hr style="margin: 1.5rem 0;">

      <div>
        <h4>Administrative Actions</h4>
        <div class="form-group">
          <label for="adm-notes">Internal Administrator Notes (Private)</label>
          <textarea id="adm-notes" class="form-control" rows="2">${escapeHtml(app.admin_notes || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="adm-msg">Applicant-Visible Message</label>
          <textarea id="adm-msg" class="form-control" rows="2">${escapeHtml(app.applicant_message || '')}</textarea>
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

    document.getElementById('btn-adm-approve').onclick = () => updateAdminStatus(app.id, 'Approved');
    document.getElementById('btn-adm-issue').onclick = () => triggerCertificateIssuance(app.id);
    document.getElementById('btn-adm-reqinfo').onclick = () => updateAdminStatus(app.id, 'Additional Information Required');
    document.getElementById('btn-adm-reject').onclick = () => {
      const reason = prompt('Mandatory: Enter the formal reason for rejection:');
      if (reason && reason.trim()) {
        updateAdminStatus(app.id, 'Rejected', reason.trim());
      } else {
        showToast('A mandatory rejection reason is required.', 'warning');
      }
    };
  }

  async function updateAdminStatus(appId, newStatus, rejectionReason = '') {
    if (!supabaseClient) return;

    try {
      const notes = document.getElementById('adm-notes')?.value || '';
      const msg = document.getElementById('adm-msg')?.value || '';

      const updatePayload = {
        status: newStatus,
        admin_notes: notes,
        applicant_message: msg,
        updated_at: new Date().toISOString()
      };
      if (rejectionReason) updatePayload.rejection_reason = rejectionReason;

      const { error } = await supabaseClient.from('applications').update(updatePayload).eq('id', appId);
      if (error) throw error;

      await supabaseClient.from('status_audit_log').insert({
        application_id: appId,
        changed_by: activeSessionUser.id,
        new_status: newStatus,
        note: rejectionReason ? `Rejected: ${rejectionReason}` : `Transitioned to ${newStatus}`
      });

      showToast(`Status updated to ${newStatus}.`, 'success');
      document.getElementById('modal-admin-review').classList.add('hidden');
      loadAdminApplications();
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    }
  }

  async function triggerCertificateIssuance(appId) {
    if (!supabaseClient) return;

    try {
      // Execute PostgreSQL stored procedure to issue certificate securely
      const { data, error } = await supabaseClient.rpc('issue_clearance_certificate', { app_id: appId });
      if (error) throw error;

      showToast(`Certificate ${data.certificate_number} registered!`, 'success');
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
    if (!supabaseClient) {
      showToast('Backend is not connected.', 'error');
      switchView('setup');
      return;
    }

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
      const { data, error } = await supabaseClient.rpc('verify_certificate', { cert_no: certNo });
      if (error) throw error;

      resultBox.classList.remove('hidden');

      if (!data || !data.found) {
        resultBox.className = 'verify-result-box verify-invalid';
        resultBox.innerHTML = `
          <h4 style="color:var(--danger);">❌ Certificate Not Found</h4>
          <p>No valid JCC registry clearance certificate corresponds to serial <code>${escapeHtml(certNo)}</code>.</p>
        `;
        return;
      }

      const isValid = data.status === 'Valid & Active';
      resultBox.className = `verify-result-box ${isValid ? 'verify-valid' : 'verify-invalid'}`;
      resultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="color:${isValid ? 'var(--success)' : 'var(--danger)'};">
            ${isValid ? '✅ Verified Legitimate Certificate' : '⚠️ Certificate ' + data.status}
          </h4>
          <span class="badge-status ${isValid ? 'badge-status-success' : 'badge-status-danger'}">${data.status}</span>
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

  async function downloadCertificatePdf(app, cert) {
    if (!window.jspdf) {
      showToast('PDF rendering engine unavailable.', 'warning');
      return;
    }

    showToast('Rendering official certificate PDF...', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const verificationUrl = `${window.location.origin}${window.location.pathname}?cert=${cert.certificate_number}#verify`;

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

      // Title & Header (Prominent Poster-style Header)
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
      doc.line(30, 48, 180, 48);

      // Certificate Details
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text(`Registry Serial: ${cert.certificate_number}`, 22, 56);
      doc.text(`Issue Date: ${cert.issue_date}`, 144, 56);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const statement = "This clearance document confirms that the identity records, address proofs, and local references provided by the applicant identified below have been screened and cataloged in accordance with the established private verification procedures of JCC.";
      doc.text(doc.splitTextToSize(statement, 166), 22, 68);

      // Particulars Box
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

      // Validity Statement
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 83, 9);
      doc.text(`Validity Period: 6 Calendar Months (Valid through ${cert.expiry_date})`, 22, 168);

      // Prominent Owner Name above QR Code
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(10, 25, 47);
      doc.text("Mr. Jahir Narjinary", 44, 180, { align: "center" });

      // Embedded QR Code
      if (qrImageBase64) {
        doc.addImage(qrImageBase64, 'PNG', 24, 184, 40, 40);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Scan QR code to access live registry confirmation", 22, 228);
      }

      // Owner Signature Block
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
      const disclaimerPara = "This certificate is a private credentialing document. It does NOT represent an official police clearance certificate (PCC) or government agency authorization. It cannot replace statutory state criminal record inquiries.";
      doc.text(doc.splitTextToSize(disclaimerPara, 158), 26, 257);

      doc.save(`JCC_Certificate_${cert.certificate_number}.pdf`);
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
    if (!supabaseClient) {
      showToast('Backend is not connected.', 'error');
      switchView('setup');
      return;
    }

    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !email || !subject || !message) {
      showToast('Please fill out all contact fields.', 'warning');
      return;
    }

    try {
      const { error } = await supabaseClient.from('contact_messages').insert({
        name, email, subject, message
      });
      if (error) throw error;

      showToast('Your message has been stored in our registry desk.', 'success');
      document.getElementById('form-contact').reset();
    } catch (err) {
      showToast('Failed to record message: ' + err.message, 'error');
    }
  }

  /* =============================================================================
     INITIALIZATION & EVENT BINDINGS
     ============================================================================= */

  document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();

    // Setup configuration save button
    document.getElementById('btn-save-runtime-cfg')?.addEventListener('click', () => {
      const url = document.getElementById('cfg-supabase-url').value.trim();
      const key = document.getElementById('cfg-supabase-key').value.trim();
      if (!url || !key) {
        showToast('Please provide both Project URL and Anon Key.', 'warning');
        return;
      }
      localStorage.setItem('jcc_supabase_url', url);
      localStorage.setItem('jcc_supabase_key', key);
      initSupabase();
      showToast('Database configuration stored. Connecting...', 'success');
      syncSession();
      switchView('home');
    });

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

    // Eye toggles
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-toggle-eye');
      if (btn) {
        e.preventDefault();
        const targetInput = document.getElementById(btn.getAttribute('data-target'));
        if (targetInput) {
          if (targetInput.type === 'password') {
            targetInput.type = 'text';
            btn.textContent = '🙈';
          } else {
            targetInput.type = 'password';
            btn.textContent = '👁️';
          }
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

    // Admin Dashboard Card Clicks (Open filtered list)
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

    // Applicant Dashboard Card Clicks
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

    // Modal Close Buttons
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

    // Admin UPI Settings Modal
    document.getElementById('btn-admin-upi-config')?.addEventListener('click', async () => {
      const modal = document.getElementById('modal-admin-upi');
      if (supabaseClient) {
        const { data: cfg } = await supabaseClient.from('system_settings').select('*').eq('id', 1).single();
        if (cfg) {
          document.getElementById('cfg-upi-id').value = cfg.upi_id;
          document.getElementById('cfg-payee-name').value = cfg.payee_name;
        }
      }
      modal.classList.remove('hidden');
    });

    document.getElementById('form-upi-settings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const upiId = document.getElementById('cfg-upi-id').value.trim();
      const payee = document.getElementById('cfg-payee-name').value.trim();
      if (!supabaseClient) return;

      const { error } = await supabaseClient.from('system_settings').update({
        upi_id: upiId,
        payee_name: payee,
        updated_at: new Date().toISOString()
      }).eq('id', 1);

      if (error) {
        showToast('Failed to update settings: ' + error.message, 'error');
      } else {
        showToast('UPI payment configuration saved.', 'success');
        document.getElementById('modal-admin-upi').classList.add('hidden');
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

    // Restore online authenticated session
    await syncSession();
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