// Utility Functions
function setFontSize(size) {
  document.body.classList.remove('font-sm', 'font-md', 'font-lg');
  document.body.classList.add(`font-${size}`);
}

function toggleHighContrast() {
  document.body.classList.toggle('high-contrast');
}

// Password Visibility Toggle (Robust & Multi-input capable)
function togglePasswordVisibility(inputId = 'adminPassword', iconId = 'toggleIcon') {
  const passwordInput = document.getElementById(inputId);
  const toggleIcon = document.getElementById(iconId);

  if (!passwordInput || !toggleIcon) return;

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleIcon.classList.remove('bi-eye');
    toggleIcon.classList.add('bi-eye-slash');
  } else {
    passwordInput.type = 'password';
    toggleIcon.classList.remove('bi-eye-slash');
    toggleIcon.classList.add('bi-eye');
  }
}

// User Verification Navigation Guard
function checkAuth(requiredRole) {
  const userRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (!userRaw) {
    window.location.href = '../login.html';
    return null;
  }
  const user = JSON.parse(userRaw);
  if (requiredRole && user.role !== requiredRole) {
    alert("Unauthorized access. Redirecting to login.");
    window.location.href = '../login.html';
    return null;
  }
  return user;
}

function getCurrentUser() {
  const userRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return userRaw ? JSON.parse(userRaw) : null;
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  window.location.href = '../login.html';
}