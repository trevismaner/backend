async function logout(req, res) {
  return res.status(200).json({ message: 'Logged out successfully' });
}

export default logout;
