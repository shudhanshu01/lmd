const { getDatabaseStatus } = require('../config/db');

function requireDatabase(req, res, next) {
  if (getDatabaseStatus().stateLabel !== 'connected') {
    return res.status(503).json({
      error: 'MongoDB is unavailable.',
      database: getDatabaseStatus()
    });
  }
  return next();
}

module.exports = { requireDatabase };
