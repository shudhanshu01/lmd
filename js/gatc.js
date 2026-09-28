let gatcModal;
let currentGatcUser;
let gatcUsesApi = false;

const GATC_STATUS = {
  SUBMITTED: 'SUBMITTED',
  SCHEDULED: 'SCHEDULED',
  RECEIVED: 'RECEIVED',
  IN_TESTING: 'IN_TESTING',
  TEST_PASSED: 'TEST_PASSED',
  TEST_FAILED: 'TEST_FAILED',
  PENDING_AUTHORIZATION: 'PENDING_AUTHORIZATION',
  CERTIFIED: 'CERTIFIED',
  REJECTED: 'REJECTED'
};

const statusLabels = {
  'Pending Admin Review': 'SUBMITTED',
  Approved: 'SCHEDULED',
  Scheduled: 'SCHEDULED',
  Passed: 'PENDING_AUTHORIZATION',
  Failed: 'PENDING_AUTHORIZATION',
  PENDING_AUTHORIZATION: 'PENDING_AUTHORIZATION',
  Certified: 'CERTIFIED'
};

const pageMeta = {
  dashboard: ['Central Verification Dashboard', 'Single source of truth for every verification stage.'],
  intake: ['Application Intake', 'Create a traceable verification record and arrival appointment.'],
  reception: ['Physical Reception & Barcoding', 'Receive equipment, record condition and assign a bench.'],
  testing: ['Metrological Testing Workbench', 'Record evidence and calculate the MPE verdict.'],
  certificates: ['Stamping & Certificates', 'Authorize a certificate or rejection note.'],
  audit: ['Master Audit & Registry', 'Search and export the five-year compliance record.']
};

document.addEventListener('DOMContentLoaded', () => {
  currentGatcUser = checkAuth('gatc');
  if (!currentGatcUser) return;
  gatcModal = new bootstrap.Modal(document.getElementById('workflowModal'));
  document.getElementById('userRoleBadge').textContent = currentGatcUser.username || 'GATC LAB';
  document.querySelectorAll('.gatc-side-link').forEach(link => link.addEventListener('click', () => showSection(link.dataset.section)));
  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
  loadGatcDashboard();
  setInterval(renderAll, 15000);
});

async function loadGatcDashboard() {
  try {
    const [applications, tests, certificates] = await Promise.all([
      apiRequest('/applications'),
      apiRequest('/gatc/tests'),
      apiRequest('/certificates')
    ]);
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(applications.map(app => ({ ...app, id: app.applicationId }))));
    localStorage.setItem(STORAGE_KEYS.GATC_TESTS, JSON.stringify(tests));
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(certificates.map(cert => ({ ...cert, certId: cert.certificateId, appId: cert.applicationId, validUntil: cert.expiryDate }))));
    gatcUsesApi = true;
  } catch (error) {
    gatcUsesApi = false;
    if (!error.message.includes('503')) console.warn(`GATC API unavailable: ${error.message}`);
  }
  renderAll();
}

function safe(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getApps() { return getStorage(STORAGE_KEYS.APPLICATIONS) || []; }
function getTests() { return getStorage(STORAGE_KEYS.GATC_TESTS) || []; }
function getStandards() { return getStorage(STORAGE_KEYS.GATC_STANDARDS) || []; }
function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`; }
function normalizedStatus(app) { return statusLabels[app.status] || app.status || GATC_STATUS.SUBMITTED; }
function manufacturer(app) { return app.manufacturerName || app.businessName || 'Unspecified manufacturer'; }
function userId() { return currentGatcUser ? (currentGatcUser.id || currentGatcUser.username) : 'GATC-LAB-01'; }
function operatorName() { return currentGatcUser?.username || 'GATC-LAB-01'; }

function routeFromHash() {
  const requested = window.location.hash.replace('#', '') || 'dashboard';
  showSection(pageMeta[requested] ? requested : 'dashboard', false);
}

function showSection(section, updateHash = true) {
  if (!pageMeta[section]) section = 'dashboard';
  document.querySelectorAll('.gatc-section').forEach(element => element.classList.add('d-none'));
  document.getElementById(`${section}Section`).classList.remove('d-none');
  document.querySelectorAll('.gatc-side-link').forEach(link => link.classList.toggle('active', link.dataset.section === section));
  document.getElementById('pageTitle').textContent = pageMeta[section][0];
  document.getElementById('pageSubtitle').textContent = pageMeta[section][1];
  if (updateHash && window.location.hash !== `#${section}`) window.location.hash = section;
  if (section === 'reception') renderReception();
  if (section === 'testing') renderTesting();
  if (section === 'certificates') renderCertificates();
  if (section === 'audit') renderAudit();
}

function renderAll() {
  renderMetrics();
  renderQueue();
  renderActivity();
  renderExceptions();
  const active = window.location.hash.replace('#', '') || 'dashboard';
  if (active === 'reception') renderReception();
  if (active === 'testing') renderTesting();
  if (active === 'certificates') renderCertificates();
  if (active === 'audit') renderAudit();
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('lastUpdated').textContent = `Updated ${timestamp}`;
  document.getElementById('syncTime').textContent = timestamp;
}

function renderMetrics() {
  const apps = getApps();
  const certified = apps.filter(app => normalizedStatus(app) === GATC_STATUS.CERTIFIED).length;
  const rejected = apps.filter(app => [GATC_STATUS.REJECTED, GATC_STATUS.TEST_FAILED].includes(normalizedStatus(app))).length;
  const testing = apps.filter(app => [GATC_STATUS.RECEIVED, GATC_STATUS.IN_TESTING, GATC_STATUS.TEST_PASSED].includes(normalizedStatus(app))).length;
  const completed = apps.filter(app => [GATC_STATUS.CERTIFIED, GATC_STATUS.REJECTED].includes(normalizedStatus(app)));
  const averageDays = completed.length ? (completed.reduce((total, app) => total + Math.max(0, (new Date(app.completedAt || nowIso()) - new Date(app.submittedAt || nowIso())) / 86400000), 0) / completed.length).toFixed(1) : '0.0';
  const fees = apps.reduce((total, app) => total + Number(app.feeAmount || 0), 0);
  const metrics = [
    ['Total received', apps.length, 'All active and archived records', 'var(--gatc-navy)', 'bi-inbox'],
    ['In testing', testing, 'Reception to verdict', '#2563eb', 'bi-clipboard2-pulse'],
    ['Passed', certified, 'Authorized certificates', 'var(--gatc-emerald)', 'bi-check-circle'],
    ['Rejected', rejected, 'Failed or rejected', 'var(--gatc-red)', 'bi-x-circle'],
    ['Avg. processing', `${averageDays}d`, 'Submission to completion', 'var(--gatc-amber)', 'bi-stopwatch'],
    ['Fees collected', `₹${fees.toLocaleString('en-IN')}`, 'Recorded application fees', '#7c3aed', 'bi-currency-rupee']
  ];
  document.getElementById('metricGrid').innerHTML = metrics.map(metric => `<div class="col-6 col-md-4 col-xxl-2"><div class="metric-card" style="--metric-color:${metric[3]}"><div class="d-flex justify-content-between"><span class="metric-label">${metric[0]}</span><i class="bi ${metric[4]} text-secondary"></i></div><div class="metric-value">${metric[1]}</div><div class="metric-note">${metric[2]}</div></div></div>`).join('');
}

function stageBadge(status) { return `<span class="badge-stage stage-${status.toLowerCase().replace('_', '-')}">${safe(status.replaceAll('_', ' '))}</span>`; }
function slaLabel(app) {
  if ([GATC_STATUS.CERTIFIED, GATC_STATUS.REJECTED].includes(normalizedStatus(app))) return '<span class="text-success small">Completed</span>';
  const due = app.slaDueAt ? new Date(app.slaDueAt) : new Date(new Date(app.submittedAt || nowIso()).getTime() + 15 * 86400000);
  const hours = Math.round((due - new Date()) / 3600000);
  return hours < 0 ? `<span class="text-danger small fw-bold">${Math.abs(hours)}h overdue</span>` : `<span class="text-warning-emphasis small">${Math.ceil(hours / 24)}d remaining</span>`;
}

function renderQueue() {
  const filter = document.getElementById('queueFilter')?.value || 'ALL';
  const apps = getApps().filter(app => filter === 'ALL' || normalizedStatus(app) === filter);
  const body = document.getElementById('queueTable');
  if (!apps.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">No applications match this queue filter.</td></tr>'; return; }
  body.innerHTML = apps.map(app => `<tr><td><strong>${safe(app.id)}</strong><br><small class="text-secondary">${safe(app.sampleCode || 'Sample not received')}</small></td><td>${safe(manufacturer(app))}</td><td>${safe(app.instrumentType || app.instrument?.model || 'Instrument')}<br><small class="text-secondary">${safe(app.serialNumber || '')}</small></td><td>${stageBadge(normalizedStatus(app))}</td><td>${slaLabel(app)}</td><td><button class="btn btn-sm btn-outline-primary" onclick="openRecord('${safe(app.id)}')">View</button></td></tr>`).join('');
}

function renderActivity() {
  const logs = getStorage(STORAGE_KEYS.AUDIT_LOGS) || [];
  const feed = document.getElementById('activityFeed');
  if (!logs.length) { feed.innerHTML = '<div class="empty-state">No activity recorded.</div>'; return; }
  feed.innerHTML = logs.slice(0, 8).map(log => `<div class="activity-item"><span class="activity-marker"></span><div><strong>${safe(log.action)}</strong><div>${safe(log.details)}</div><div class="activity-time">${safe(log.timestamp)}</div></div></div>`).join('');
}

function renderExceptions() {
  const apps = getApps();
  const exceptions = apps.filter(app => normalizedStatus(app) !== GATC_STATUS.CERTIFIED && normalizedStatus(app) !== GATC_STATUS.REJECTED && app.slaDueAt && new Date(app.slaDueAt) < new Date());
  const standards = getStandards().filter(standard => new Date(standard.validUntil) < new Date());
  const count = exceptions.length + standards.length;
  document.getElementById('exceptionCount').textContent = count;
  document.getElementById('exceptions').innerHTML = count ? [...exceptions.map(app => `<div class="exception-item"><i class="bi bi-clock-history exception-icon"></i><div><strong>SLA breach</strong><br>${safe(app.id)} requires attention.</div></div>`), ...standards.map(standard => `<div class="exception-item"><i class="bi bi-exclamation-triangle exception-icon"></i><div><strong>Expired reference standard</strong><br>${safe(standard.id)} expired on ${safe(standard.validUntil)}.</div></div>`)].join('') : '<div class="empty-state">No compliance exceptions. Controls are current.</div>';
}

async function submitGatcApplication(event) {
  event.preventDefault();
  const submittedAt = nowIso();
  const schedule = document.getElementById('intakeSchedule').value;
  const app = {
    id: newId('GATC-APP'), businessName: document.getElementById('intakeManufacturer').value.trim(), manufacturerName: document.getElementById('intakeManufacturer').value.trim(), ownerName: document.getElementById('intakeContact').value.trim(), contactName: document.getElementById('intakeContact').value.trim(), modelApprovalCertificateNumber: document.getElementById('intakeApproval').value.trim(), instrumentType: document.getElementById('intakeModel').value.trim(), instrumentCategory: document.getElementById('intakeCategory').value, serialNumber: document.getElementById('intakeSerial').value.trim(), verificationType: document.getElementById('intakeType').value, status: GATC_STATUS.SCHEDULED, assignedOfficerId: null, scheduleDate: schedule ? schedule.split('T')[0] : null, scheduleTime: schedule ? schedule.split('T')[1] : null, submittedAt, scheduledAt: schedule, feeAmount: Number(document.getElementById('intakeFee').value), feeStatus: 'PAID', slaDueAt: new Date(new Date(submittedAt).getTime() + 15 * 86400000).toISOString(), createdBy: userId(), updatedAt: submittedAt
  };
  if (gatcUsesApi) {
    try {
      const created = await apiRequest('/applications', { method: 'POST', body: JSON.stringify(app) });
      await apiRequest(`/applications/${encodeURIComponent(created.applicationId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SCHEDULED' }) });
      document.getElementById('intakeForm').reset();
      document.getElementById('intakeFee').value = 1250;
      await loadGatcDashboard();
      showSection('dashboard');
      alert(`Application ${created.applicationId} created and scheduled.`);
      return;
    } catch (error) {
      gatcUsesApi = false;
      if (!error.message.includes('503')) alert(`GATC API update failed: ${error.message}`);
    }
  }
  const apps = getApps(); apps.unshift(app); setStorage(STORAGE_KEYS.APPLICATIONS, apps); addAuditLog('Application Submitted', `${app.id} received from ${app.manufacturerName}.`); document.getElementById('intakeForm').reset(); document.getElementById('intakeFee').value = 1250; showSection('dashboard'); renderAll(); alert(`Application ${app.id} created and scheduled.`);
}

function openIntakeModal() { showSection('intake'); }
function openWorkflow(title, content) { document.getElementById('modalTitle').textContent = title; document.getElementById('modalBody').innerHTML = content; gatcModal.show(); }
function closeWorkflow() { gatcModal.hide(); }

function renderReception() {
  const apps = getApps().filter(app => [GATC_STATUS.SUBMITTED, GATC_STATUS.SCHEDULED].includes(normalizedStatus(app)));
  document.getElementById('receptionCards').innerHTML = apps.length ? apps.map(app => workflowCard(app, 'Receive equipment', `openReceptionModal('${safe(app.id)}')`, 'Scheduled for physical arrival')).join('') : '<div class="empty-state">No equipment is waiting for reception.</div>';
}

function openReceptionModal(id) {
  const app = getApps().find(item => item.id === id);
  openWorkflow('Receive equipment', `<p class="small text-secondary">${safe(app.id)} · ${safe(manufacturer(app))} · ${safe(app.instrumentType)}</p><form onsubmit="receiveSample(event, '${safe(id)}')"><div class="row g-3"><div class="col-md-6"><label class="form-label">Visual condition</label><select id="receptionCondition" class="form-select" required><option value="GOOD">No damage or tampering</option><option value="ISSUE">Damage or tampering observed</option></select></div><div class="col-md-6"><label class="form-label">Laboratory bench</label><select id="receptionBench" class="form-select"><option>BENCH-A1</option><option>BENCH-A2</option><option>BENCH-B1</option></select></div><div class="col-12"><label class="form-label">Reception note</label><textarea id="receptionNote" class="form-control" rows="2" placeholder="Record seal, packaging or condition notes"></textarea></div></div><button class="btn btn-primary w-100 mt-4">Confirm reception and generate barcode</button></form>`);
}

async function receiveSample(event, id) {
  event.preventDefault();
  const sampleCode = newId('GATC-SMP');
  const benchId = document.getElementById('receptionBench').value;
  const receptionChecks = { condition: document.getElementById('receptionCondition').value, note: document.getElementById('receptionNote').value.trim(), receivedBy: operatorName() };
  if (gatcUsesApi) {
    try {
      await apiRequest(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: GATC_STATUS.RECEIVED, sampleCode, benchId, receivedAt: nowIso(), receptionChecks }) });
      closeWorkflow();
      await loadGatcDashboard();
      showSection('reception');
      return;
    } catch (error) {
      gatcUsesApi = false;
      if (!error.message.includes('503')) alert(`GATC API update failed: ${error.message}`);
    }
  }
  updateApp(id, app => { app.status = GATC_STATUS.RECEIVED; app.sampleCode = sampleCode; app.benchId = benchId; app.receivedAt = nowIso(); app.receptionChecks = receptionChecks; }); addAuditLog('Equipment Received', `${id} received, coded and assigned to a laboratory bench.`); closeWorkflow(); renderAll(); showSection('reception');
}

function renderTesting() {
  const apps = getApps().filter(app => [GATC_STATUS.RECEIVED, GATC_STATUS.IN_TESTING].includes(normalizedStatus(app)));
  document.getElementById('testingCards').innerHTML = apps.length ? apps.map(app => workflowCard(app, 'Open workbench', `openTestingModal('${safe(app.id)}')`, `Sample ${app.sampleCode || 'pending'} · ${app.benchId || 'unassigned'}`)).join('') : '<div class="empty-state">No received samples are waiting for testing.</div>';
}

function openTestingModal(id) {
  const app = getApps().find(item => item.id === id);
  const options = getStandards().map(standard => `<option value="${safe(standard.id)}">${safe(standard.name)} · valid until ${safe(standard.validUntil)}</option>`).join('');
  openWorkflow('Testing workbench', `<p class="small text-secondary">${safe(app.id)} · ${safe(app.instrumentType)} · Sample ${safe(app.sampleCode)}</p><form onsubmit="completeTest(event, '${safe(id)}')"><div class="row g-3"><div class="col-md-6"><label class="form-label">Reference standard</label><select id="testStandard" class="form-select" required>${options}</select></div><div class="col-md-6"><label class="form-label">Rule version</label><input id="testRule" class="form-control" value="LM-MPE-2026.1" required></div><div class="col-md-3"><label class="form-label">Max capacity</label><input type="number" step="0.01" id="testMax" class="form-control" value="100" required></div><div class="col-md-3"><label class="form-label">Min capacity</label><input type="number" step="0.01" id="testMin" class="form-control" value="0.02" required></div><div class="col-md-3"><label class="form-label">Scale interval e</label><input type="number" step="0.001" id="testInterval" class="form-control" value="0.01" required></div><div class="col-md-3"><label class="form-label">Observed error</label><input type="number" step="0.001" id="testError" class="form-control" value="0.005" required></div><div class="col-md-6"><label class="form-label">Eccentricity result</label><input required id="testEccentricity" class="form-control" placeholder="e.g. 0.004 kg"></div><div class="col-md-6"><label class="form-label">Repeatability result</label><input required id="testRepeatability" class="form-control" placeholder="e.g. 0.003 kg"></div></div><div class="alert alert-info small mt-3 mb-0">The system will compare absolute observed error with the calculated MPE allowance before locking the test.</div><button class="btn btn-primary w-100 mt-4">Lock test result</button></form>`);
}

async function completeTest(event, id) {
  event.preventDefault();
  const standard = getStandards().find(item => item.id === document.getElementById('testStandard').value);
  if (!standard || new Date(standard.validUntil) < new Date()) { alert('This reference standard is expired and cannot be used.'); return; }
  const scaleInterval = Number(document.getElementById('testInterval').value);
  const observedError = Number(document.getElementById('testError').value);
  const allowedError = scaleInterval * 1.5;
  const verdict = Math.abs(observedError) <= allowedError ? 'PASS' : 'FAIL';
  const test = { testSessionId: newId('GATC-TST'), applicationId: id, standard: { calibrationId: standard.calibrationId, standardId: standard.id, validUntil: standard.validUntil, statusAtTest: 'VALID' }, readings: { maxCapacity: Number(document.getElementById('testMax').value), minCapacity: Number(document.getElementById('testMin').value), scaleInterval, eccentricity: [document.getElementById('testEccentricity').value], repeatability: [document.getElementById('testRepeatability').value] }, mpe: { ruleVersion: document.getElementById('testRule').value, allowedError, observedError, withinLimit: verdict === 'PASS' }, verdict, performedBy: operatorName(), startedAt: nowIso(), completedAt: nowIso() };
  if (gatcUsesApi) {
    try {
      const app = getApps().find(item => item.id === id);
      await apiRequest('/gatc/tests', { method: 'POST', body: JSON.stringify({ applicationId: id, sampleCode: app?.sampleCode, bench: app?.benchId, referenceStandards: [test.standard], measurements: test.readings, mpe: test.mpe, result: verdict, testedById: operatorName(), testedAt: test.completedAt }) });
      closeWorkflow();
      await loadGatcDashboard();
      showSection('testing');
      return;
    } catch (error) {
      gatcUsesApi = false;
      if (!error.message.includes('503')) alert(`GATC API update failed: ${error.message}`);
    }
  }
  const tests = getTests(); tests.unshift(test); setStorage(STORAGE_KEYS.GATC_TESTS, tests); updateApp(id, app => { app.status = verdict === 'PASS' ? GATC_STATUS.TEST_PASSED : GATC_STATUS.TEST_FAILED; app.testSessionId = test.testSessionId; app.testVerdict = verdict; app.completedTestAt = test.completedAt; }); addAuditLog('Test Completed', `${id} test locked with verdict ${verdict} by ${operatorName()}.`); closeWorkflow(); renderAll(); showSection('testing');
}

function renderCertificates() {
  const apps = getApps().filter(app => [GATC_STATUS.TEST_PASSED, GATC_STATUS.TEST_FAILED, GATC_STATUS.PENDING_AUTHORIZATION].includes(normalizedStatus(app)) && !app.certificateId);
  document.getElementById('certificateCards').innerHTML = apps.length ? apps.map(app => {
    const reportVerdict = app.inspectionReport?.verdict;
    const passed = reportVerdict ? reportVerdict === 'PASS' : normalizedStatus(app) === GATC_STATUS.TEST_PASSED;
    return workflowCard(app, passed ? 'Issue certificate' : 'Record rejection', `openCertificateModal('${safe(app.id)}')`, reportVerdict ? `LMO report: ${safe(reportVerdict)} · Error ${safe(app.inspectionReport.errorCalculated)} kg` : `GATC test verdict: ${safe(app.testVerdict || normalizedStatus(app))}`);
  }).join('') : '<div class="empty-state">No inspection reports or test outcomes are waiting for authorization.</div>';
}

function openCertificateModal(id) {
  const app = getApps().find(item => item.id === id);
  const passed = app.inspectionReport?.verdict === 'PASS' || (!app.inspectionReport && normalizedStatus(app) === GATC_STATUS.TEST_PASSED);
  openWorkflow(passed ? 'Authorize digital certificate' : 'Record rejection note', `<p class="small text-secondary">${safe(app.id)} · ${safe(manufacturer(app))} · ${safe(app.sampleCode)}</p><form onsubmit="authorizeOutcome(event, '${safe(id)}', ${passed})">${passed ? '<div class="row g-3"><div class="col-md-6"><label class="form-label">Hologram seal ID</label><input id="sealId" class="form-control" required placeholder="HGL-2026-0001"></div><div class="col-md-6"><label class="form-label">Security stamp serial</label><input id="stampId" class="form-control" required placeholder="STAMP-0001"></div><div class="col-12"><label class="form-label">Digital signature reference</label><input id="signatureRef" class="form-control" required placeholder="DSIG-PRINCIPAL-2026"></div></div>' : '<label class="form-label">Rejection reason</label><textarea id="rejectionReason" class="form-control" rows="3" required placeholder="State the rule or observed failure clearly"></textarea>'}<button class="btn ${passed ? 'btn-success' : 'btn-danger'} w-100 mt-4">${passed ? 'Issue certificate and register' : 'Confirm rejection note'}</button></form>`);
}

async function authorizeOutcome(event, id, passed) {
  event.preventDefault();
  const apps = getApps(); const index = apps.findIndex(app => app.id === id); if (index < 0) return;
  const app = apps[index];
  if (gatcUsesApi) {
    try {
      if (passed) {
        const certificateId = newId('GATC-CERT');
        await apiRequest('/certificates', { method: 'POST', body: JSON.stringify({ certificateId, applicationId: id, businessName: manufacturer(app), location: app.location || 'GATC Laboratory', instrumentType: app.instrumentType, serialNumber: app.serialNumber, expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(), hologramSealId: document.getElementById('sealId').value.trim(), securityStampSerial: document.getElementById('stampId').value.trim(), digitalSignatureReference: document.getElementById('signatureRef').value.trim(), qrVerificationUrl: getPublicVerificationUrl(certificateId), authorizedById: operatorName(), registry: { provider: 'eMaap', syncStatus: 'SYNCED' } }) });
      } else {
        await apiRequest(`/applications/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: GATC_STATUS.REJECTED, rejectionReason: document.getElementById('rejectionReason').value.trim() }) });
      }
      closeWorkflow();
      await loadGatcDashboard();
      showSection('certificates');
      return;
    } catch (error) {
      gatcUsesApi = false;
      if (!error.message.includes('503')) alert(`GATC API update failed: ${error.message}`);
    }
  }
  if (passed) {
    const certificateId = newId('GATC-CERT');
    const certificate = { certId: certificateId, appId: id, applicationId: id, businessName: manufacturer(app), location: app.location || 'GATC Laboratory', instrumentType: app.instrumentType, serialNumber: app.serialNumber, outcome: 'CERTIFIED', hologramSealId: document.getElementById('sealId').value.trim(), securityStampSerial: document.getElementById('stampId').value.trim(), documentId: newId('GATC-DOC'), issuedAt: nowIso(), validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0], authorizedBy: operatorName(), lmoId: app.inspectionReport?.inspectedBy || app.lmoId, inspectionReport: app.inspectionReport || null, signatureReference: document.getElementById('signatureRef').value.trim(), registry: { provider: 'eMaap', externalId: newId('EMAAP'), syncStatus: 'SYNCED', lastAttemptAt: nowIso() }, verification: { qrToken: newId('QR'), publicUrl: getPublicVerificationUrl(certificateId) } };
    const certificates = getStorage(STORAGE_KEYS.CERTIFICATES) || []; certificates.unshift(certificate); setStorage(STORAGE_KEYS.CERTIFICATES, certificates); app.status = GATC_STATUS.CERTIFIED; app.certificateId = certificate.certId; app.hologramSealId = certificate.hologramSealId; app.completedAt = nowIso(); addAuditLog('Certificate Issued', `${certificate.certId} issued for ${id} and registered with eMaap.`);
  } else { app.status = GATC_STATUS.REJECTED; app.rejectionReason = document.getElementById('rejectionReason').value.trim(); app.completedAt = nowIso(); addAuditLog('Application Rejected', `${id} rejected: ${app.rejectionReason}`); }
  setStorage(STORAGE_KEYS.APPLICATIONS, apps); closeWorkflow(); renderAll(); showSection('certificates');
}

function workflowCard(app, action, handler, detail) { return `<div class="col-md-6 col-xl-4"><div class="workflow-card"><div class="d-flex justify-content-between gap-2 mb-2"><span class="text-secondary small">${safe(app.id)}</span>${stageBadge(normalizedStatus(app))}</div><h3>${safe(manufacturer(app))}</h3><p>${safe(app.instrumentType)} · ${safe(app.serialNumber)}<br>${safe(detail)}</p><button class="btn btn-sm btn-primary w-100" onclick="${handler}">${safe(action)} <i class="bi bi-arrow-right ms-1"></i></button></div></div>`; }

function updateApp(id, updater) { const apps = getApps(); const index = apps.findIndex(app => app.id === id); if (index >= 0) { updater(apps[index]); apps[index].updatedAt = nowIso(); setStorage(STORAGE_KEYS.APPLICATIONS, apps); } }

function openRecord(id) { const app = getApps().find(item => item.id === id); if (!app) return; openWorkflow(`Application ${id}`, `<dl class="row small mb-0"><dt class="col-sm-4">Manufacturer</dt><dd class="col-sm-8">${safe(manufacturer(app))}</dd><dt class="col-sm-4">Status</dt><dd class="col-sm-8">${stageBadge(normalizedStatus(app))}</dd><dt class="col-sm-4">Sample code</dt><dd class="col-sm-8">${safe(app.sampleCode || 'Not received')}</dd><dt class="col-sm-4">Certificate</dt><dd class="col-sm-8">${safe(app.certificateId || 'Not issued')}</dd><dt class="col-sm-4">Verification type</dt><dd class="col-sm-8">${safe(app.verificationType || 'Not specified')}</dd><dt class="col-sm-4">SLA due</dt><dd class="col-sm-8">${safe(app.slaDueAt || 'Not calculated')}</dd></dl>`); }
function openSearch() { new bootstrap.Modal(document.getElementById('searchModal')).show(); document.getElementById('universalSearch').focus(); renderSearchResults(); }
function renderSearchResults() { const query = (document.getElementById('universalSearch').value || '').toLowerCase(); const results = getApps().filter(app => [app.id, manufacturer(app), app.sampleCode, app.certificateId, app.hologramSealId].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 12); document.getElementById('searchResults').innerHTML = results.length ? results.map(app => `<button class="list-group-item list-group-item-action" onclick="bootstrap.Modal.getInstance(document.getElementById('searchModal')).hide(); openRecord('${safe(app.id)}')"><strong>${safe(app.id)}</strong><br><small>${safe(manufacturer(app))} · ${safe(normalizedStatus(app))}</small></button>`).join('') : '<div class="empty-state">No central records found.</div>'; }
function renderAudit() { const query = (document.getElementById('auditSearch')?.value || '').toLowerCase(); const status = document.getElementById('auditStatus')?.value || 'ALL'; const apps = getApps().filter(app => (status === 'ALL' || normalizedStatus(app) === status) && [app.id, manufacturer(app), app.certificateId, app.sampleCode].some(value => String(value || '').toLowerCase().includes(query))); document.getElementById('auditTable').innerHTML = apps.length ? apps.map(app => `<tr><td><strong>${safe(app.id)}</strong></td><td>${safe(manufacturer(app))}</td><td>${stageBadge(normalizedStatus(app))}</td><td>${safe(app.certificateId || app.sampleCode || '-')}</td><td>${safe(app.updatedAt || app.completedAt || app.submittedAt || '-')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No audit records found.</td></tr>'; }
function exportAudit() { const rows = [['Application ID', 'Manufacturer', 'Status', 'Sample Code', 'Certificate ID', 'Updated At'], ...getApps().map(app => [app.id, manufacturer(app), normalizedStatus(app), app.sampleCode || '', app.certificateId || '', app.updatedAt || app.completedAt || app.submittedAt || ''])]; const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `gatc-audit-${new Date().toISOString().split('T')[0]}.csv`; link.click(); URL.revokeObjectURL(link.href); addAuditLog('Audit Exported', 'GATC master audit CSV exported.'); renderActivity(); }
