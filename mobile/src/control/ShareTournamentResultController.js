import { Share } from 'react-native';

async function shareTournamentResultController(tournament, rank) {
  try {
    const message = rank
      ? `I placed #${rank} in ${tournament.name} on Run League! 🏆`
      : `I just took part in ${tournament.name} on Run League! 🏃`;
    await Share.share({ message });
    return { success: true, field: null, message: '' };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default shareTournamentResultController;
