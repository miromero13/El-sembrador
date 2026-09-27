export type PodiumEntry = {
  participantId: string;
  name: string;
  score: number;
  seeds: number;
  answeredQuestions: number;
  place: number;
  eliminated: boolean;
};

export type PodiumParticipant = {
  participantId: string;
  name: string;
  seeds: number;
  answeredQuestions: number;
  eliminated: boolean;
};

export function createPodium(participants: PodiumParticipant[]): PodiumEntry[] {
  const ranked = participants.map(player => ({
    ...player,
    score: player.eliminated ? 0 : player.seeds * 100 + player.answeredQuestions * 100,
    place: 0,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.participantId.localeCompare(b.participantId));
  let place = 0;
  let previousScore: number | undefined;
  return ranked.map((player, index) => {
    if (player.score !== previousScore) place = index + 1;
    previousScore = player.score;
    return { ...player, place };
  });
}
