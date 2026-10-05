import PublicEvent from '../entities/PublicEvent.js';

async function viewPublicEventsController() {
  try {
    const data = await PublicEvent.getAll();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewPublicEventsController;
