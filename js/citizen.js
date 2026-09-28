// Business logic script for citizen dashboard
document.addEventListener('DOMContentLoaded', () => {
  checkAuth('business');
  renderCitizenApps();
  setInterval(updateCertificateTracking, 60000);
});

// Security helper to sanitize dynamic strings against XSS
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generate a unique application ID matching system conventions
function generateAppId() {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `LM-VER-${new Date().getFullYear()}-${randomDigits}`;
}

async function loadBusinessRecords() {
  try {
    const [applications, certificates] = await Promise.all([apiRequest('/applications'), apiRequest('/certificates')]);
    const apps = applications.map(application => ({ ...application, id: application.applicationId || application.id }));
    const certs = certificates.map(certificate => ({ ...certificate, certId: certificate.certificateId || certificate.certId, appId: certificate.applicationId || certificate.appId, validUntil: certificate.expiryDate || certificate.validUntil }));
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certs));
    return { apps, certs };
  } catch (error) {
    window.dispatchEvent(new CustomEvent('verimatrix-api-offline', { detail: { error: error.message } }));
    return { apps: getStorage(STORAGE_KEYS.APPLICATIONS) || [], certs: getStorage(STORAGE_KEYS.CERTIFICATES) || [] };
  }
}

async function renderCitizenApps() {
  const { apps, certs } = await loadBusinessRecords();
  const currentUser = getCurrentUser(); // Assuming session management helper
  const tbody = document.getElementById('citizenAppTable');

  // Filter applications belonging to the active business/user if account tracking is active
  const userApps = currentUser
    ? apps.filter(app => app.createdBy === (currentUser.id || currentUser.username) || app.businessName === currentUser.businessName || app.businessName === currentUser.username)
    : apps;

  if (userApps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No applications found. Click "Apply for Verification" to begin.</td></tr>`;
    return;
  }

  tbody.innerHTML = userApps.map(app => {
    const cert = certs.find(c => c.appId === app.id);
    let actionBtn = `<span class="text-muted small">Awaiting Completion</span>`;
    
    if (cert) {
      actionBtn = `<div class="d-grid gap-1"><a href="../verify-certificate.html?certId=${escapeHTML(cert.certId)}" target="_blank" class="btn btn-sm btn-success"><i class="bi bi-patch-check me-1"></i> Certificate Issued</a><div class="d-flex gap-1"><button type="button" class="btn btn-sm btn-outline-primary flex-fill" onclick="downloadBusinessCertificate('${escapeHTML(cert.certId)}')" title="Download certificate"><i class="bi bi-download"></i> Download</button><button type="button" class="btn btn-sm btn-outline-secondary flex-fill" onclick="printBusinessCertificate('${escapeHTML(cert.certId)}')" title="Print certificate"><i class="bi bi-printer"></i> Print</button></div><small class="text-success" data-expiry="${escapeHTML(cert.validUntil || cert.expiryDate || '')}"><i class="bi bi-clock me-1"></i><span>Live tracking</span></small></div>`;
    } else if (app.status === 'PENDING_AUTHORIZATION') {
      actionBtn = '<span class="text-warning small"><i class="bi bi-hourglass-split me-1"></i>Report with GATC for authorization</span>';
    }

    // Dynamic badge status color mapping
    let badgeClass = 'bg-secondary';
    if (app.status === 'Pending Admin Review') badgeClass = 'bg-warning text-dark';
    else if (app.status === 'Scheduled') badgeClass = 'bg-info text-dark';
    else if (app.status === 'Passed' || app.status === 'CERTIFIED') badgeClass = 'bg-success';
    else if (app.status === 'PENDING_AUTHORIZATION') badgeClass = 'bg-warning text-dark';
    else if (app.status === 'Failed') badgeClass = 'bg-danger';

    return `
      <tr>
        <td><strong>${escapeHTML(app.id)}</strong></td>
        <td>${escapeHTML(app.instrumentType)}<br><small class="text-muted">S/N: ${escapeHTML(app.serialNumber)}</small></td>
        <td>${escapeHTML(app.location)}</td>
        <td><span class="badge ${badgeClass}">${escapeHTML(app.status)}</span></td>
        <td>${app.assignedOfficerId ? `<span class="badge bg-light text-dark border">${escapeHTML(app.assignedOfficerId)}</span>` : '<span class="text-muted">Unassigned</span>'}</td>
        <td>${app.scheduleDate ? `${escapeHTML(app.scheduleDate)} @ ${escapeHTML(app.scheduleTime)}` : '<span class="text-muted">Not Scheduled</span>'}</td>
        <td>${actionBtn}</td>
      </tr>`;
  }).join('');
  updateCertificateTracking();
}

function findBusinessCertificate(certId) {
  return (getStorage(STORAGE_KEYS.CERTIFICATES) || []).find(cert => cert.certId === certId);
}

function downloadBusinessCertificate(certId) {
  downloadCertificate(findBusinessCertificate(certId));
}

function printBusinessCertificate(certId) {
  printCertificate(findBusinessCertificate(certId));
}

function updateCertificateTracking() {
  document.querySelectorAll('[data-expiry]').forEach(element => {
    const expiry = new Date(`${element.dataset.expiry}T23:59:59.999Z`);
    const days = Math.max(0, Math.ceil((expiry - new Date()) / 86400000));
    element.classList.toggle('text-danger', days === 0);
    element.classList.toggle('text-success', days > 0);
    element.querySelector('span').textContent = days > 0 ? `Live tracking · ${days} day${days === 1 ? '' : 's'} remaining` : 'Certificate expired';
  });
}

async function submitApplication(e) {
  e.preventDefault();
  
  const form = e.target;
  const bizName = document.getElementById('bizName').value.trim();
  const bizLoc = document.getElementById('bizLoc').value.trim();
  const instType = document.getElementById('instType').value;
  const serialNo = document.getElementById('serialNo').value.trim();
  const capacity = document.getElementById('capacity').value.trim();

  if (!bizName || !bizLoc || !instType || !serialNo) {
    alert("Please fill in all required fields.");
    return;
  }

  const currentUser = getCurrentUser();
  const applicationPayload = {
    businessName: bizName,
    location: bizLoc,
    instrumentType: instType,
    serialNumber: serialNo,
    capacity,
    createdBy: currentUser ? (currentUser.id || currentUser.username) : 'GUEST'
  };

  const newApp = {
    id: generateAppId(),
    businessName: bizName,
    location: bizLoc,
    instrumentType: instType,
    serialNumber: serialNo,
    capacity: capacity,
    status: "Pending Admin Review",
    assignedOfficerId: null,
    scheduleDate: null,
    scheduleTime: null,
    submittedAt: new Date().toISOString().split('T')[0],
    createdBy: currentUser ? (currentUser.id || currentUser.username) : 'GUEST'
  };

  try {
    await apiRequest('/applications', { method: 'POST', body: JSON.stringify(applicationPayload) });
  } catch (error) {
    const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
    apps.unshift(newApp);
    setStorage(STORAGE_KEYS.APPLICATIONS, apps);
    addAuditLog('Application Submitted', `Application ${newApp.id} submitted by ${newApp.businessName}`);
    if (!error.message.includes('503')) alert(`Application saved locally. Backend unavailable: ${error.message}`);
  }
  
  // Close modal and reset form
  const modalEl = document.getElementById('appModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) {
    modalInstance.hide();
  }
  
  form.reset();
  await renderCitizenApps();
}