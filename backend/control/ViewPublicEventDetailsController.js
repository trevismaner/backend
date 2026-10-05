import PublicEvent from '../entities/PublicEvent.js';

// RU-39 (single event). Includes the entry list, which doubles as the results table once
// the event is over and ranks have been recorded.
async function viewPublicEventDetails(req, res) {
  try {
    const event = await PublicEvent.findById(req.params.eventId, req.user.userId);
    if (!event) {
      return res.status(404).json({ error: 'Public event not found' });
    }
    const participants = await PublicEvent.getParticipants(req.params.eventId);
    return res.status(200).json({ event: event.toJSON(), participants });
  } catch (err) {
    console.error('View public event details error:', err);
    return res.status(500).json({ error: 'Failed to load public event' });
  }
}

export default viewPublicEventDetails;
