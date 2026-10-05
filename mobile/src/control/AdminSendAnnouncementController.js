import Admin from '../entities/Admin.js';

async function adminSendAnnouncementController({ title, body, role = null }) {
  if (!title || !title.trim()) {
    return { success: false, field: 'title', message: 'Title is required.' };
  }

  if (!body || !body.trim()) {
    return { success: false, field: 'body', message: 'Message body is required.' };
  }

  try {
    const data = await Admin.sendAnnouncement({ title, body, role });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminSendAnnouncementController;
