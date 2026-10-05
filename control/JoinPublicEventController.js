import PublicEvent from '../entities/PublicEvent.js';

// RU-40: As a Registered User, I want to join a public event, so that I can participate in
// platform-wide tournaments.
const REASONS = {
  not_found: [404, 'Public event not found'],
  closed: [409, 'Registration for this event has closed'],
  already_joined: [409, 'You have already joined this event'],
  full: [409, 'This event is full'],
};

async function joinPublicEvent(req, res) {
  try {
    const result = await PublicEvent.join(req.params.eventId, req.user.userId);
    if (!result.ok) {
      const [status, message] = REASONS[result.reason] ?? [400, 'Could not join this event'];
      return res.status(status).json({ error: message });
    }

    const event = await PublicEvent.findById(req.params.eventId, req.user.userId);
    return res.status(200).json({ message: 'Joined event', event: event.toJSON() });
  } catch (err) {
    console.error('Join public event error:', err);
    return res.status(500).json({ error: 'Failed to join event' });
  }
}

export default joinPublicEvent;
