let liveCertificate = null;
let expiryTimer = null;

function escapeVerificationHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  // Check URL query string for auto-verifying via QR Scanner link
  const urlParams = new URLSearchParams(window.location.search);
  const certId = urlParams.get('certId');
  if (certId) {
    document.getElementById('certInput').value = certId;
    verifyCert();
  }
});

async function verifyCert() {
  const certId = document.getElementById('certInput').value.trim();
  const display = document.getElementById('certDisplay');
  if (!certId) return;
  display.innerHTML = '<div class="text-center text-secondary py-4"><div class="spinner-border spinner-border-sm me-2"></div>Checking the live GATC registry...</div>';

  let cert = null;
  try {
    const response = await fetch(`${GATC_API_BASE}/v1/certificates/${encodeURIComponent(certId)}`, { cache: 'no-store' });
    if (response.ok) cert = await response.json();
  } catch { cert = null; }

  if (!cert) {
    try {
      const response = await fetch(`${GATC_API_BASE}/public/certificates/${encodeURIComponent(certId)}`, { cache: 'no-store' });
      if (response.ok) {
        const publicCert = await response.json();
        cert = { ...publicCert, certId: publicCert.certificateId, appId: publicCert.applicationId, validUntil: publicCert.expiryDate ? String(publicCert.expiryDate).split('T')[0] : undefined, authorizedBy: publicCert.authorizedById };
      }
    } catch { cert = null; }
  }

  if (!cert) {
    const certs = getStorage(STORAGE_KEYS.CERTIFICATES);
    cert = certs.find(item => item.certId === certId) || null;
  }

  if (!cert) {
    display.innerHTML = `
      <div class="alert alert-danger text-center p-4">
        <i class="bi bi-x-circle-fill fs-1"></i>
        <h4 class="mt-2">INVALID / UNVERIFIED CERTIFICATE</h4>
        <p class="m-0">No official record found for Certificate ID: <strong>${escapeVerificationHTML(certId)}</strong>. This weighing instrument may be unverified or fraudulent.</p>
      </div>`;
    return;
  }

  liveCertificate = cert;
  const isExpired = cert.liveStatus ? cert.liveStatus !== 'VALID' : new Date(cert.validUntil || cert.expiryDate) < new Date();
  const statusBadge = isExpired
    ? `<span class="badge bg-danger fs-6"><i class="bi bi-exclamation-triangle"></i> ${cert.liveStatus || 'EXPIRED'}</span>`
    : `<span class="badge bg-success fs-6"><i class="bi bi-patch-check-fill"></i> VALID & OFFICIALLY STAMPED</span>`;

  display.innerHTML = `
    <div class="certificate-container mt-3 text-center">
      <div class="mb-3">${statusBadge}</div>
      <h3 class="fw-bold text-uppercase border-bottom pb-2">Certificate of Verification</h3>
      <p class="text-muted">Issued under Rule 14 of Legal Metrology (General) Rules</p>
      
      <div class="row text-start my-4 g-3">
        <div class="col-6"><strong>Certificate ID:</strong> ${escapeVerificationHTML(cert.certId)}</div>
        <div class="col-6"><strong>Application ID:</strong> ${escapeVerificationHTML(cert.appId)}</div>
        <div class="col-6"><strong>Establishment:</strong> ${escapeVerificationHTML(cert.businessName || '-')}</div>
        <div class="col-6"><strong>Location:</strong> ${escapeVerificationHTML(cert.location || '-')}</div>
        <div class="col-6"><strong>Instrument:</strong> ${escapeVerificationHTML(cert.instrumentType)}</div>
        <div class="col-6"><strong>Serial No:</strong> ${escapeVerificationHTML(cert.serialNumber)}</div>
        <div class="col-6"><strong>Verification Date:</strong> ${escapeVerificationHTML(cert.verificationDate || cert.issuedAt?.split('T')[0] || '-')}</div>
        <div class="col-6"><strong>Valid Until:</strong> <span class="text-danger fw-bold">${escapeVerificationHTML(cert.validUntil || cert.expiryDate || '-')}</span></div>
        <div class="col-6"><strong>Authorized By:</strong> ${escapeVerificationHTML(cert.authorizedBy || cert.lmoId || '-')}</div>
        <div class="col-6"><strong>Registry:</strong> ${escapeVerificationHTML(cert.registry?.provider || 'GATC')} (${escapeVerificationHTML(cert.registry?.syncStatus || 'LOCAL')})</div>
      </div>

      <div class="alert ${isExpired ? 'alert-danger' : 'alert-success'} d-flex justify-content-between align-items-center" role="status"><span><i class="bi bi-clock me-2"></i>Live validity tracker</span><strong id="expiryCountdown">${formatExpiry(cert)}</strong></div>

      <div class="border-top pt-3 d-flex justify-content-between align-items-center">
        <div class="text-start">
          <small class="text-muted d-block">Digitally Signed by:</small>
           <strong>GATC Authorizing Officer (${escapeVerificationHTML(cert.authorizedBy || cert.lmoId || '-')})</strong>
        </div>
        <div class="text-end">
           <img class="verification-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(getPublicVerificationUrl(cert.certId))}" alt="Verification QR">
        </div>
      </div>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-4 certificate-actions">
        <button type="button" class="btn btn-success" onclick="downloadVerifiedCertificate()"><i class="bi bi-download me-1"></i> Download Certificate</button>
        <button type="button" class="btn btn-outline-primary" onclick="printVerifiedCertificate()"><i class="bi bi-printer me-1"></i> Print Certificate</button>
      </div>
    </div>`;
  startExpiryTracker();
}

function downloadVerifiedCertificate() {
  downloadCertificate(liveCertificate);
}

function printVerifiedCertificate() {
  printCertificate(liveCertificate);
}

function formatExpiry(cert) {
  if (cert.liveStatus === 'EXPIRED') return 'Expired';
  const expiry = new Date(`${cert.validUntil || cert.expiryDate}T23:59:59.999Z`);
  const seconds = Math.max(0, Math.floor((expiry - new Date()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m remaining`;
}

function startExpiryTracker() {
  clearInterval(expiryTimer);
  expiryTimer = setInterval(() => {
    const countdown = document.getElementById('expiryCountdown');
    if (countdown && liveCertificate) countdown.textContent = formatExpiry(liveCertificate);
  }, 1000);
}