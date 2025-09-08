exports.allowSelfOrAdmin = (req, res, next) => {
  const isSelf  = String(req.user.id) === String(req.params.id);
  const isAdmin = String(req.user.role || '').toLowerCase() === 'admin';
  if (isSelf || isAdmin) return next();
  return res.status(403).json({ message: 'Forbidden' });
};
