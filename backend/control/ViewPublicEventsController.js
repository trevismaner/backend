import PublicEvent from '../entities/PublicEvent.js';

// RU-39: As a Registered User, I want to read public event details, so that I can decide
// whether to participate. Each row says whether *this* user is already registered.
async function viewPublicEvents(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const { events, total } = await PublicEvent.findAll({
      viewerId: req.user.userId,
      limit,
      offset: (page - 1) * limit,
    });

    return res.status(200).json({
      events,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('View public events error:', err);
    return res.status(500).json({ error: 'Failed to load public events' });
  }
}

export default viewPublicEvents;
