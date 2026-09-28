let currentActiveApp = null;
let gpsVerified = false;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth('lmo');
  loadLmoDashboard();
});

let lmoUsesApi = false;

async function loadLmoDashboard() {
  try {
    const officerId = getLoggedInOfficerId();
    const applications = await apiRequest(`/applications?assignedLMO=${encodeURIComponent(officerId)}`);
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(applications.map(app => ({
      ...app,
      id: app.applicationId,
      status: app.status === 'SCHEDULED' ? 'Scheduled' : app.status,
      inspectionReport: app.inspectionReport ? {
        ...app.inspectionReport,
        verdict: app.inspectionReport.result,
        inspectedBy: app.inspectionReport.lmoId,
        inspectedAt: app.inspectionReport.inspectionDate,
        errorCalculated: app.inspectionReport.measurements?.calculatedError,
        toleranceAllowed: app.inspectionReport.measurements?.toleranceAllowed,
        gpsVerified: app.inspectionReport.gps?.verified
      } : null
    }))));
    lmoUsesApi = true;
  } catch (error) {
    lmoUsesApi = false;
    if (!error.message.includes('503')) console.warn(`LMO API unavailable: ${error.message}`);
  }
  renderLmoDashboard();
}

function escapeLmoHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getLoggedInOfficerId() {
  const currentUser = getCurrentUser();
  return currentUser ? (currentUser.id || currentUser.username) : 'LMO-UK-1024';
}

function getOfficerApps() {
  const officerId = getLoggedInOfficerId();
  return (getStorage(STORAGE_KEYS.APPLICATIONS) || []).filter(app => app.assignedOfficerId === officerId || app.inspectionReport?.inspectedBy === officerId);
}

function renderLmoDashboard() {
  renderLmoTasks();
  renderLmoSummary();
  renderLmoReports();
  renderLmoActivity();
}

function renderLmoSummary() {
  const apps = getOfficerApps();
  document.getElementById('lmoPendingCount').textContent = apps.filter(app => app.status === 'Scheduled').length;
  document.getElementById('lmoReportCount').textContent = apps.filter(app => app.status === 'PENDING_AUTHORIZATION').length;
  document.getElementById('lmoCompletedCount').textContent = apps.filter(app => ['CERTIFIED', 'REJECTED'].includes(app.status)).length;
  document.getElementById('lmoRejectedCount').textContent = apps.filter(app => ['REJECTED', 'Failed'].includes(app.status) || app.inspectionReport?.verdict === 'FAIL').length;
}

function reportStatusLabel(app) {
  if (app.status === 'PENDING_AUTHORIZATION') return 'Submitted to GATC';
  if (app.status === 'CERTIFIED') return 'Certificate issued';
  if (app.status === 'REJECTED' || app.status === 'Failed') return 'Rejected';
  if (app.status === 'Scheduled') return 'Pending inspection';
  return app.status || 'Unknown';
}

function reportStatusClass(app) {
  if (app.status === 'PENDING_AUTHORIZATION') return 'bg-warning text-dark';
  if (app.status === 'CERTIFIED') return 'bg-success';
  if (app.status === 'REJECTED' || app.status === 'Failed') return 'bg-danger';
  return 'bg-secondary';
}

function renderLmoReports() {
  const table = document.getElementById('lmoReportTable');
  const apps = getOfficerApps().filter(app => app.inspectionReport || ['CERTIFIED', 'REJECTED', 'Failed'].includes(app.status));
  if (!apps.length) {
    table.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No inspection reports or completed outcomes yet.</td></tr>';
    return;
  }
  table.innerHTML = apps.sort((a, b) => new Date(b.inspectionReport?.inspectedAt || b.completedAt || 0) - new Date(a.inspectionReport?.inspectedAt || a.completedAt || 0)).map(app => {
    const report = app.inspectionReport;
    return `<tr><td><strong>${escapeLmoHTML(app.id)}</strong></td><td>${escapeLmoHTML(app.businessName)}</td><td>${escapeLmoHTML(report?.inspectedAt ? new Date(report.inspectedAt).toLocaleString() : 'Not inspected')}</td><td>${report ? `<span class="badge ${report.verdict === 'PASS' ? 'bg-success' : 'bg-danger'}">${escapeLmoHTML(report.verdict)}</span><br><small>Error: ${escapeLmoHTML(report.errorCalculated)} kg</small>` : '<span class="text-muted">Awaiting inspection</span>'}</td><td><span class="badge ${reportStatusClass(app)}">${escapeLmoHTML(reportStatusLabel(app))}</span></td></tr>`;
  }).join('');
}

function renderLmoActivity() {
  const officerId = getLoggedInOfficerId();
  const apps = getOfficerApps();
  const appIds = new Set(apps.map(app => app.id));
  const logs = (getStorage(STORAGE_KEYS.AUDIT_LOGS) || []).filter(log => log.details?.includes(officerId) || [...appIds].some(id => log.details?.includes(id))).slice(0, 12);
  const reportEvents = apps.filter(app => app.inspectionReport).map(app => ({ timestamp: app.inspectionReport.inspectedAt, action: 'Inspection report submitted', details: `${app.id} submitted to GATC with ${app.inspectionReport.verdict} verdict.` }));
  const activity = [...logs, ...reportEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 12);
  document.getElementById('lmoActivityList').innerHTML = activity.length ? activity.map(item => `<div class="list-group-item d-flex justify-content-between align-items-start gap-3"><div><strong>${escapeLmoHTML(item.action)}</strong><div class="small text-muted">${escapeLmoHTML(item.details)}</div></div><time class="small text-muted text-nowrap">${escapeLmoHTML(item.timestamp || '-')}</time></div>`).join('') : '<div class="list-group-item text-muted text-center py-4">No inspection activity recorded yet.</div>';
}

function renderLmoTasks() {
  const taskContainer = document.getElementById('lmoTaskCards');
  const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
  const officerId = getLoggedInOfficerId();
  const assignedApps = apps.filter(app => app.assignedOfficerId === officerId && ['Scheduled', 'SCHEDULED'].includes(app.status));

  if (!assignedApps.length) {
    taskContainer.innerHTML = '<div class="alert alert-info">No inspections are currently assigned to you.</div>';
    return;
  }

  taskContainer.innerHTML = assignedApps.map(app => `
    <div class="card card-gov mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <h5 class="card-title mb-1">${escapeLmoHTML(app.businessName)}</h5>
            <p class="text-muted small mb-2">${escapeLmoHTML(app.id)}</p>
          </div>
          <span class="badge bg-info text-dark">${escapeLmoHTML(app.status)}</span>
        </div>
        <p class="mb-1"><strong>Location:</strong> ${escapeLmoHTML(app.location)}</p>
        <p class="mb-1"><strong>Instrument:</strong> ${escapeLmoHTML(app.instrumentType)} (S/N: ${escapeLmoHTML(app.serialNumber)})</p>
        <p class="mb-3"><strong>Scheduled:</strong> ${escapeLmoHTML(app.scheduleDate)} at ${escapeLmoHTML(app.scheduleTime)}</p>
        <button class="btn btn-primary w-100" onclick="startInspection('${escapeLmoHTML(app.id)}')">Start Inspection</button>
      </div>
    </div>`).join('');
}

function startInspection(appId) {
  const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
  currentActiveApp = apps.find(app => app.id === appId) || null;
  if (!currentActiveApp) return;

  document.getElementById('assignedListSection').style.display = 'none';
  document.getElementById('inspectionFormSection').style.display = 'block';
  document.getElementById('inspectBizName').textContent = currentActiveApp.businessName;
  document.getElementById('inspectAppId').textContent = `App Ref: ${currentActiveApp.id}`;
  gpsVerified = false;
  document.getElementById('gpsStatus').textContent = 'Location unverified';
  document.getElementById('gpsStatus').className = 'small text-muted mt-1';
}

function cancelInspection() {
  currentActiveApp = null;
  document.getElementById('inspectionFormSection').style.display = 'none';
  document.getElementById('assignedListSection').style.display = 'block';
}

function verifyGPS() {
  const status = document.getElementById('gpsStatus');
  if (!navigator.geolocation) {
    status.textContent = 'Location services are not supported by this browser.';
    status.className = 'small text-danger mt-1';
    return;
  }
  status.textContent = 'Requesting device location...';
  status.className = 'small text-warning mt-1';
  navigator.geolocation.getCurrentPosition(() => {
    gpsVerified = true;
    status.textContent = 'Location verified for inspection.';
    status.className = 'small text-success mt-1';
  }, () => {
    gpsVerified = false;
    status.textContent = 'Location permission is required before submitting this inspection.';
    status.className = 'small text-danger mt-1';
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function calculateError() {
  const standardLoad = parseFloat(document.getElementById('stdLoad').value) || 0;
  const observedLoad = parseFloat(document.getElementById('obsLoad').value) || 0;
  const error = (observedLoad - standardLoad).toFixed(2);
  const isPassing = Math.abs(parseFloat(error)) <= 0.10;
  document.getElementById('calcError').value = `${error} kg`;
  const resultBadge = document.getElementById('testResultBadge');
  resultBadge.textContent = `TEST RESULT: ${isPassing ? 'PASS' : 'FAIL'}`;
  resultBadge.className = `alert ${isPassing ? 'alert-success' : 'alert-danger'} text-center py-2 fw-bold`;
}

function previewPhoto(e) {
  const file = e.target.files && e.target.files[0];
  const preview = document.getElementById('photoPreview');
  if (!file) {
    preview.style.display = 'none';
    preview.removeAttribute('src');
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
}

// Utility: Convert File object to Base64 Data URL
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

// Updated Inspection Submission Handler
async function submitInspectionResult(e) {
  e.preventDefault();
  if (!currentActiveApp) return;
  if (!gpsVerified) {
    alert('Please verify the inspection location before submitting the result.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const std = parseFloat(document.getElementById('stdLoad').value) || 0;
    const obs = parseFloat(document.getElementById('obsLoad').value) || 0;
    const calcErr = (obs - std).toFixed(2);
    const isPassing = Math.abs(parseFloat(calcErr)) <= 0.10;

    // Convert uploaded image file to Base64 string
    const photoInput = document.getElementById('photoInput');
    let photoBase64 = null;
    if (photoInput && photoInput.files && photoInput.files[0]) {
      photoBase64 = await fileToBase64(photoInput.files[0]);
    }

    const currentUser = getCurrentUser();
    const officerId = currentUser ? (currentUser.id || currentUser.username) : "LMO-UK-1024";

    const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
    const appIdx = apps.findIndex(a => a.id === currentActiveApp.id);

    if (lmoUsesApi) {
      try {
        const inspection = await apiRequest('/inspections', { method: 'POST', body: JSON.stringify({
          applicationId: currentActiveApp.id,
          lmoId: officerId,
          inspectionDate: new Date().toISOString(),
          gps: { verified: true },
          instrumentDetails: { instrumentType: currentActiveApp.instrumentType, serialNumber: currentActiveApp.serialNumber, capacity: currentActiveApp.capacity },
          measurements: { standardLoad: std, observedLoad: obs, calculatedError: Number(calcErr), toleranceAllowed: 0.10 },
          result: isPassing ? 'PASS' : 'FAIL',
          photoEvidence: photoBase64 ? [photoBase64] : [],
          reportStatus: 'DRAFT'
        }) });
        await apiRequest(`/inspections/${encodeURIComponent(inspection._id)}/submit`, { method: 'PATCH', body: JSON.stringify({}) });
        addAuditLog('Inspection Report Submitted', `${currentActiveApp.id} report submitted to GATC by ${officerId}.`);
        alert(`Inspection report submitted to GATC.\nResult: ${isPassing ? 'PASS' : 'FAIL'}`);
        cancelInspection();
        await loadLmoDashboard();
        return;
      } catch (error) {
        lmoUsesApi = false;
        if (!error.message.includes('503')) alert(`LMO API update failed: ${error.message}`);
      }
    }

    if (appIdx >= 0) {
      apps[appIdx].status = 'PENDING_AUTHORIZATION';
      apps[appIdx].photoEvidence = photoBase64;
      apps[appIdx].inspectionReport = {
        verdict: isPassing ? 'PASS' : 'FAIL',
        errorCalculated: calcErr,
        toleranceAllowed: '0.10 kg',
        gpsVerified: true,
        inspectedBy: officerId,
        inspectedAt: new Date().toISOString(),
        photoEvidence: photoBase64,
        reportStatus: 'SUBMITTED_TO_GATC'
      };
      setStorage(STORAGE_KEYS.APPLICATIONS, apps);
    }

    addAuditLog('Inspection Report Submitted', `${currentActiveApp.id} report submitted to GATC by ${officerId} with ${isPassing ? 'PASS' : 'FAIL'} verdict.`);
    alert(`Inspection report submitted to GATC.\nResult: ${isPassing ? 'PASS' : 'FAIL'}\nGATC will issue the certificate or record the rejection.`);
    cancelInspection();
    renderLmoDashboard();
  } catch (err) {
    console.error("Error processing inspection submission:", err);
    alert("An error occurred while saving the inspection photo and results. Please try again.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}