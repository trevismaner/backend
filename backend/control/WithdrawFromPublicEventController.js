import PublicEvent from '../entities/PublicEvent.js';

// RU-43: As a Registered User, I want to withdraw from a public event before it starts, so
// that I won't be notified when the event starts and I am not available.
const REASONS = {
  not_found: [404, 'Public event not found'],
  not_registered: [409, 'You are not registered for this event'],
  already_started: [409, 'This event has already started, so you cannot withdraw'],
};

async function withdrawFromPublicEvent(req, res) {
  try {
    const result = await PublicEvent.withdraw(req.params.eventId, req.user.userId);
    if (!result.ok) {
      const [status, message] = REASONS[result.reason] ?? [400, 'Could not withdraw'];
      return res.status(status).json({ error: message });
    }

    const event = await PublicEvent.findById(req.params.eventId, req.user.userId);
    return res.status(200).json({ message: 'Withdrawn from event', event: event.toJSON() });
  } catch (err) {
    console.error('Withdraw from public event error:', err);
    return res.status(500).json({ error: 'Failed to withdraw' });
  }
}

export default withdrawFromPublicEvent;
