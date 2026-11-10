import PublicEvent from '../entities/PublicEvent.js';

async function joinPublicEventController(eventId) {
  if (!eventId) {
    return { success: false, field: 'eventId', message: 'An event id is required.' };
  }

  try {
    const data = await PublicEvent.join(eventId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default joinPublicEventController;
