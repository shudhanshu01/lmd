/**
 * Data Storage Engine for SIH26036 Legal Metrology Prototype
 * Seed data matches the SIH Demonstration Script requirements
 */

const STORAGE_KEYS = {
  APPLICATIONS: 'sih_lm_applications',
  OFFICERS: 'sih_lm_officers',
  INSPECTIONS: 'sih_lm_inspections',
  CERTIFICATES: 'sih_lm_certificates',
  GATC_TESTS: 'sih_lm_gatc_tests',
  GATC_STANDARDS: 'sih_lm_gatc_standards',
  AUDIT_LOGS: 'sih_lm_audit_logs',
  REGISTERED_USERS: 'sih_lm_registered_users',
  CURRENT_USER: 'sih_lm_current_user'
};

const GATC_API_BASE = (typeof window !== 'undefined' && window.GATC_API_BASE)
  || (typeof window !== 'undefined' && window.location.protocol.startsWith('http') ? `${window.location.origin}/api` : 'http://localhost:3000/api');

function getApiRole() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return { business: 'SHOPKEEPER', admin: 'ADMIN', lmo: 'LMO', gatc: 'GATC' }[user?.role] || 'PUBLIC';
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), 'x-demo-role': getApiRole(), ...(options.headers || {}) };
  const response = await fetch(`${GATC_API_BASE}${path}`, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `API request failed (${response.status})`);
  return payload;
}

// Initial Seed Data
const defaultApplications = [
  {
    id: "LM-VER-2026-004582",
    businessName: "ABC General Store",
    ownerName: "Ramesh Sharma",
    location: "Govindghat, Chamoli, Uttarakhand",
    instrumentType: "Digital Weighing Scale",
    serialNumber: "DWS-2026-8891",
    capacity: "100 kg",
    status: "Pending Admin Review", // Pending Admin Review -> Approved -> Scheduled -> Passed -> Certified
    assignedOfficerId: null,
    scheduleDate: null,
    scheduleTime: null,
    submittedAt: "2026-09-08",
    modelApprovalCertificateNumber: "M-APP-UK-2026-104",
    verificationType: "PERIODIC",
    sampleCode: null,
    benchId: null,
    receivedAt: null,
    receptionChecks: null,
    testSessionId: null,
    testVerdict: null,
    certificateId: null,
    rejectionReason: null,
    feeAmount: 1250,
    feeStatus: "PAID",
    slaDueAt: null
  }
];

const defaultOfficers = [
  { id: "LMO-UK-1024", name: "Rajesh Kumar", zone: "Chamoli, Uttarakhand", activeCount: 1, totalCompleted: 42 },
  { id: "LMO-UK-1025", name: "Anita Verma", zone: "Dehradun, Uttarakhand", activeCount: 0, totalCompleted: 58 }
];

const defaultCertificates = [];
const defaultGatcTests = [];
const defaultGatcStandards = [
  { id: "STD-M1-20KG-01", name: "Class M1 Standard Mass Set", capacity: "20 kg", calibrationId: "CAL-2026-0441", validUntil: "2027-03-31", status: "VALID" },
  { id: "STD-E2-100KG-01", name: "Class E2 Standard Mass Set", capacity: "100 kg", calibrationId: "CAL-2026-0520", validUntil: "2027-05-15", status: "VALID" }
];
const defaultAuditLogs = [
  { timestamp: "2026-09-08 10:00:00", action: "Application Submitted", details: "Application LM-VER-2026-004582 created by ABC General Store." }
];

// Initialize Storage
function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) {
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(defaultApplications));
  }
  if (!localStorage.getItem(STORAGE_KEYS.OFFICERS)) {
    localStorage.setItem(STORAGE_KEYS.OFFICERS, JSON.stringify(defaultOfficers));
  }
  if (!localStorage.getItem(STORAGE_KEYS.CERTIFICATES)) {
    localStorage.setItem(STORAGE_KEYS.CERTIFICATES, JSON.stringify(defaultCertificates));
  }
  if (!localStorage.getItem(STORAGE_KEYS.GATC_TESTS)) {
    localStorage.setItem(STORAGE_KEYS.GATC_TESTS, JSON.stringify(defaultGatcTests));
  }
  if (!localStorage.getItem(STORAGE_KEYS.GATC_STANDARDS)) {
    localStorage.setItem(STORAGE_KEYS.GATC_STANDARDS, JSON.stringify(defaultGatcStandards));
  }
  if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(defaultAuditLogs));
  }
  if (!localStorage.getItem(STORAGE_KEYS.REGISTERED_USERS)) {
    localStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify([]));
  }
}

// Helpers
function getStorage(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    localStorage.setItem(key, '[]');
    return [];
  }
}

function setStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  syncStorageToCloud(key, data);
}

function syncStorageToCloud(key, data) {
  if (typeof fetch !== 'function' || !GATC_API_BASE) return;
  fetch(`${GATC_API_BASE}/v1/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': `browser-${Date.now()}` },
    body: JSON.stringify({ key, data })
  }).then(response => {
    if (response.ok && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gatc-cloud-sync', { detail: { key } }));
  }).catch(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gatc-cloud-offline', { detail: { key } }));
  });
}

async function hydrateFromCloud(keys = Object.values(STORAGE_KEYS).filter(key => key !== STORAGE_KEYS.CURRENT_USER)) {
  if (typeof fetch !== 'function') return false;
  try {
    const response = await fetch(`${GATC_API_BASE}/v1/state?keys=${encodeURIComponent(keys.join(','))}`, { cache: 'no-store' });
    if (!response.ok) return false;
    const payload = await response.json();
    Object.entries(payload.state || {}).forEach(([key, data]) => {
      if (Array.isArray(data)) localStorage.setItem(key, JSON.stringify(data));
    });
    return true;
  } catch {
    return false;
  }
}

function getPublicVerificationUrl(certId) {
  const configuredOrigin = typeof window !== 'undefined' && window.GATC_PUBLIC_URL;
  const origin = configuredOrigin || (typeof window !== 'undefined' && window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:3000');
  return `${origin.replace(/\/$/, '')}/verify-certificate.html?certId=${encodeURIComponent(certId)}`;
}

function escapeCertificateValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function certificateDownloadMarkup(cert) {
  const verificationUrl = getPublicVerificationUrl(cert.certId);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(verificationUrl)}`;
  const value = field => escapeCertificateValue(cert[field] || '-');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>VeriMatrix Certificate ${value('certId')}</title><style>body{font-family:Arial,sans-serif;color:#222;margin:0;background:#f4f7fa}.certificate{max-width:850px;margin:32px auto;padding:42px;border:10px solid #003366;background:#fff}.header{text-align:center;border-bottom:3px solid #ff9933;padding-bottom:18px}.header h1{color:#003366;margin:0 0 6px}.header p{margin:4px;color:#555}.status{display:inline-block;padding:8px 14px;background:#138808;color:#fff;font-weight:bold;margin:20px 0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-top:1px solid #ddd;padding-top:20px}.field strong{display:block;color:#003366;font-size:12px;text-transform:uppercase;margin-bottom:4px}.footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #ddd;margin-top:30px;padding-top:20px}.footer img{width:180px;height:180px}.signature{font-weight:bold}.muted{color:#666;font-size:12px}@media print{body{background:#fff}.certificate{margin:0 auto;box-shadow:none}}</style></head><body><main class="certificate"><header class="header"><h1>VeriMatrix</h1><p>Certificate of Verification</p><p class="muted">Issued under Rule 14 of Legal Metrology (General) Rules</p><span class="status">VALID &amp; OFFICIALLY STAMPED</span></header><section class="fields"><div class="field"><strong>Certificate ID</strong>${value('certId')}</div><div class="field"><strong>Application ID</strong>${value('appId')}</div><div class="field"><strong>Establishment</strong>${value('businessName')}</div><div class="field"><strong>Location</strong>${value('location')}</div><div class="field"><strong>Instrument</strong>${value('instrumentType')}</div><div class="field"><strong>Serial Number</strong>${value('serialNumber')}</div><div class="field"><strong>Verification Date</strong>${escapeCertificateValue(cert.verificationDate || cert.issuedAt?.split('T')[0] || '-')}</div><div class="field"><strong>Valid Until</strong>${escapeCertificateValue(cert.validUntil || cert.expiryDate || '-')}</div><div class="field"><strong>Authorized By</strong>${escapeCertificateValue(cert.authorizedBy || cert.lmoId || '-')}</div><div class="field"><strong>Registry</strong>${escapeCertificateValue(cert.registry?.provider || 'GATC')}</div></section><footer class="footer"><div><div class="muted">Digitally Signed by</div><div class="signature">GATC Authorizing Officer (${escapeCertificateValue(cert.authorizedBy || cert.lmoId || '-')})</div><div class="muted">Scan QR to verify this certificate live.</div></div><img src="${qrUrl}" alt="Verification QR code"></footer></main></body></html>`;
}

function downloadCertificate(cert) {
  if (!cert?.certId) return;
  const blob = new Blob([certificateDownloadMarkup(cert)], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `verimatrix-certificate-${cert.certId}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printCertificate(cert) {
  if (!cert?.certId) return;
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return;
  printWindow.document.write(certificateDownloadMarkup(cert));
  printWindow.document.close();
  printWindow.focus();
  printWindow.addEventListener('load', () => printWindow.print(), { once: true });
}

function addAuditLog(action, details) {
  const logs = getStorage(STORAGE_KEYS.AUDIT_LOGS);
  logs.unshift({
    timestamp: new Date().toLocaleString(),
    action,
    details
  });
  setStorage(STORAGE_KEYS.AUDIT_LOGS, logs);
}

// Initialize immediately
initStorage();