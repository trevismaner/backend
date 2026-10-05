async function getCurrentUser(req, res) {
  return res.status(200).json({ user: req.user.toJSON() });
}

export default getCurrentUser;
