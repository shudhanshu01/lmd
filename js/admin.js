document.addEventListener('DOMContentLoaded', () => {
  checkAuth('admin');
  loadAdminDashboard();
});

let adminUsesApi = false;

function adminStatusLabel(status) {
  return {
    PENDING_ADMIN_REVIEW: 'Pending Admin Review',
    SCHEDULED: 'Scheduled',
    CERTIFIED: 'Certified',
    REJECTED: 'Rejected',
    TEST_FAILED: 'Failed',
    FAILED: 'Failed'
  }[status] || status;
}

async function loadAdminDashboard() {
  try {
    const [applications, certificates, users] = await Promise.all([
      apiRequest('/applications'),
      apiRequest('/certificates'),
      apiRequest('/users?role=LMO')
    ]);
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(applications.map(app => ({ ...app, id: app.applicationId, status: adminStatusLabel(app.status) }))));
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certificates.map(cert => ({ ...cert, certId: cert.certificateId, appId: cert.applicationId, validUntil: cert.expiryDate }))));
    if (users.length) localStorage.setItem(STORAGE_KEYS.OFFICERS, JSON.stringify(users.map(user => ({ id: user.externalId || user._id, name: user.name, activeCount: 0 }))));
    adminUsesApi = true;
  } catch (error) {
    adminUsesApi = false;
    if (!error.message.includes('503')) console.warn(`Admin API unavailable: ${error.message}`);
  }
  renderAdminDashboard();
}

// Security helper to escape dynamic HTML strings
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAdminDashboard() {
  const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
  const certs = getStorage(STORAGE_KEYS.CERTIFICATES) || [];
  const officers = getStorage(STORAGE_KEYS.OFFICERS) || [];
  const logs = getStorage(STORAGE_KEYS.AUDIT_LOGS) || [];

  // 1. Update Counter Cards
  document.getElementById('statTotalApps').innerText = apps.length;
  document.getElementById('statPending').innerText = apps.filter(a => a.status === 'Pending Admin Review').length;
  document.getElementById('statScheduled').innerText = apps.filter(a => a.status === 'Scheduled').length;
  document.getElementById('statCertificates').innerText = certs.length;

  // 2. Render Officer Workload Sidebar
  const workloadContainer = document.getElementById('officerWorkload');
  if (officers.length === 0) {
    workloadContainer.innerHTML = '<span class="text-muted small">No active field officers registered.</span>';
  } else {
    workloadContainer.innerHTML = officers.map(o => `
      <div class="d-flex justify-content-between border-bottom py-1">
        <span>${escapeHTML(o.name)} (${escapeHTML(o.id)})</span>
        <span class="badge bg-secondary">${o.activeCount || 0} Active Assigned</span>
      </div>`).join('');
  }

  // 3. Render Application Queue
  const tbody = document.getElementById('adminAppTable');
  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No verification applications found in the database.</td></tr>`;
  } else {
    tbody.innerHTML = apps.map(app => {
      // Dynamic status badge styling
      let badgeClass = 'bg-secondary';
      if (app.status === 'Pending Admin Review') badgeClass = 'bg-warning text-dark';
      else if (app.status === 'Scheduled') badgeClass = 'bg-info text-dark';
      else if (app.status === 'Passed') badgeClass = 'bg-success';
      else if (app.status === 'Failed') badgeClass = 'bg-danger';

      return `
        <tr>
          <td><strong>${escapeHTML(app.id)}</strong></td>
          <td>${escapeHTML(app.businessName)}<br><small class="text-muted">${escapeHTML(app.location)}</small></td>
          <td>${escapeHTML(app.instrumentType)}<br><small class="text-muted">S/N: ${escapeHTML(app.serialNumber)}</small></td>
          <td><span class="badge ${badgeClass}">${escapeHTML(app.status)}</span></td>
          <td>${app.assignedOfficerId ? `<span class="badge bg-light text-dark border">${escapeHTML(app.assignedOfficerId)}</span>` : '<span class="text-danger small fw-bold">Unassigned</span>'}</td>
          <td>${app.scheduleDate ? `${escapeHTML(app.scheduleDate)} @ ${escapeHTML(app.scheduleTime)}` : '<span class="text-muted">Unscheduled</span>'}</td>
          <td>
            ${app.status === 'Pending Admin Review' ? 
              `<button class="btn btn-sm btn-primary" onclick="openAssignModal('${escapeHTML(app.id)}')"><i class="bi bi-person-plus-fill me-1"></i> Approve & Assign</button>` : 
              `<button class="btn btn-sm btn-outline-secondary" onclick="openAssignModal('${escapeHTML(app.id)}')">Reassign</button>`
            }
          </td>
        </tr>`;
    }).join('');
  }

  // 4. Render Audit Trail
  const auditContainer = document.getElementById('auditLogList');
  if (logs.length === 0) {
    auditContainer.innerHTML = '<li class="list-group-item text-muted text-center py-2">No audit events recorded yet.</li>';
  } else {
    auditContainer.innerHTML = logs.map(l => `
      <li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <div><strong>${escapeHTML(l.action)}:</strong> ${escapeHTML(l.details)}</div>
        <span class="text-muted small">${escapeHTML(l.timestamp)}</span>
      </li>`).join('');
  }
}

function openAssignModal(appId) {
  document.getElementById('targetAppId').value = appId;
  
  // Pre-fill fields if app is already assigned
  const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
  const currentApp = apps.find(a => a.id === appId);
  
  if (currentApp) {
    if (currentApp.assignedOfficerId) {
      document.getElementById('officerSelect').value = currentApp.assignedOfficerId;
    }
    if (currentApp.scheduleDate) {
      document.getElementById('schedDate').value = currentApp.scheduleDate;
    }
    if (currentApp.scheduleTime) {
      document.getElementById('schedTime').value = currentApp.scheduleTime;
    }
  }

  new bootstrap.Modal(document.getElementById('assignModal')).show();
}

async function saveAssignment(e) {
  e.preventDefault();
  const appId = document.getElementById('targetAppId').value;
  const newOfficerId = document.getElementById('officerSelect').value;
  const date = document.getElementById('schedDate').value;
  const time = document.getElementById('schedTime').value;

  const apps = getStorage(STORAGE_KEYS.APPLICATIONS) || [];
  const appIndex = apps.findIndex(a => a.id === appId);

  if (appIndex >= 0) {
    const previousOfficerId = apps[appIndex].assignedOfficerId;

    if (adminUsesApi) {
      try {
        await apiRequest(`/applications/${encodeURIComponent(appId)}/assign-lmo`, { method: 'PATCH', body: JSON.stringify({ assignedOfficerId: newOfficerId }) });
        await apiRequest(`/applications/${encodeURIComponent(appId)}/schedule`, { method: 'PATCH', body: JSON.stringify({ scheduleDate: date, scheduleTime: time }) });
        const modalElement = document.getElementById('assignModal');
        bootstrap.Modal.getInstance(modalElement)?.hide();
        await loadAdminDashboard();
        return;
      } catch (error) {
        adminUsesApi = false;
        if (!error.message.includes('503')) alert(`Admin API update failed: ${error.message}`);
      }
    }

    // Update Application Payload
    apps[appIndex].status = 'Scheduled';
    apps[appIndex].assignedOfficerId = newOfficerId;
    apps[appIndex].scheduleDate = date;
    apps[appIndex].scheduleTime = time;
    setStorage(STORAGE_KEYS.APPLICATIONS, apps);

    // Synchronize Active Workload Counts Across Officers
    const officers = getStorage(STORAGE_KEYS.OFFICERS) || [];
    
    // Decrement previous officer's active count if reassigned
    if (previousOfficerId && previousOfficerId !== newOfficerId) {
      const prevOffIndex = officers.findIndex(o => o.id === previousOfficerId);
      if (prevOffIndex >= 0 && officers[prevOffIndex].activeCount > 0) {
        officers[prevOffIndex].activeCount -= 1;
      }
    }

    // Increment new officer's active count
    const newOffIndex = officers.findIndex(o => o.id === newOfficerId);
    if (newOffIndex >= 0) {
      // Avoid incrementing twice if same officer is re-scheduled
      if (previousOfficerId !== newOfficerId) {
        officers[newOffIndex].activeCount = (officers[newOffIndex].activeCount || 0) + 1;
      }
    }
    setStorage(STORAGE_KEYS.OFFICERS, officers);

    // Record Audit Log
    addAuditLog("Officer Assigned & Scheduled", `App ${appId} assigned to ${newOfficerId} for ${date} at ${time}`);
    
    // Hide Modal & Refresh View
    const modalElement = document.getElementById('assignModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
      modalInstance.hide();
    }
    renderAdminDashboard();
  }
}