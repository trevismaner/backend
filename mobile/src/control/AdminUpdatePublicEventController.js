import PublicEvent from '../entities/PublicEvent.js';

async function adminUpdatePublicEventController({ eventId, changes }) {
  if (!eventId) {
    return { success: false, field: 'eventId', message: 'An event id is required.' };
  }

  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'No changes to save.' };
  }

  try {
    const data = await PublicEvent.adminUpdate(eventId, changes);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdatePublicEventController;
