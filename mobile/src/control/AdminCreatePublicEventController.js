import PublicEvent from '../entities/PublicEvent.js';

async function adminCreatePublicEventController({ name, description = null, maxParticipants = null, registrationDeadline = null, startDate = null, endDate = null }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Event name is required.' };
  }

  try {
    const data = await PublicEvent.adminCreate({ name: name.trim(), description, maxParticipants, registrationDeadline, startDate, endDate });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminCreatePublicEventController;
