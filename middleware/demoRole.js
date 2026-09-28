function requireDemoRole(...roles) {
  return (req, res, next) => {
    const role = String(req.get('x-demo-role') || '').toUpperCase();
    if (!roles.includes(role)) {
      return res.status(403).json({ error: `Role header must be one of: ${roles.join(', ')}` });
    }
    req.demoRole = role;
    return next();
  };
}

module.exports = { requireDemoRole };
