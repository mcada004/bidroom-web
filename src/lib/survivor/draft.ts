export const SURVIVOR_ROOM = 'survivor-51-2026';
export const DEFAULT_TEAM_COUNT = 4;
export const MIN_TEAM_COUNT = 1;
export const MAX_TEAM_COUNT = 5;
export const PICK_COUNT = 20;
export type DraftState = { uids: string[]; names: string[]; nameKeys: string[]; order: string[]; started: boolean; picks: string[]; teamCount: number };
export const emptyDraft = (): DraftState => ({ uids: [], names: [], nameKeys: [], order: [], started: false, picks: [], teamCount: DEFAULT_TEAM_COUNT });
export const normalizeDraft = (state: DraftState): DraftState => ({ ...state, teamCount: state.teamCount ?? DEFAULT_TEAM_COUNT });
export function teamForPick(pick: number, teamCount: number): number {
  const round = Math.floor(pick / teamCount);
  return round % 2 === 0 ? pick % teamCount : teamCount - 1 - pick % teamCount;
}
export function addTeam(state: DraftState, uid: string, rawName: string): DraftState {
  if (state.uids.includes(uid)) return state;
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a team name between 2 and 24 characters.');
  if (state.started) throw new Error('The draft has started. Ask the organizer to reset before joining.');
  if (state.uids.length >= state.teamCount) throw new Error('All team spots are filled. You can still watch the draft.');
  if (state.nameKeys.includes(name.toLowerCase())) throw new Error('That team name is taken. Choose a different name.');
  return { ...state, uids: [...state.uids, uid], names: [...state.names, name], nameKeys: [...state.nameKeys, name.toLowerCase()], order: [...state.order, uid] };
}
export function setTeamCount(state: DraftState, count: number): DraftState {
  if (state.started || state.picks.length) throw new Error('Reset the draft before changing the team count.');
  if (!Number.isInteger(count) || count < MIN_TEAM_COUNT || count > MAX_TEAM_COUNT || count < state.uids.length) throw new Error('Choose a count from 1 to 5 that includes the teams already joined.');
  return { ...state, teamCount: count };
}
export function moveTeam(state: DraftState, from: number, to: number): DraftState {
  if (state.started || state.picks.length) throw new Error('The draft order is locked.');
  if (from < 0 || from >= state.order.length || to < 0 || to >= state.order.length) throw new Error('That team is not in the draft.');
  const order = [...state.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...state, order };
}
export function startDraft(state: DraftState): DraftState {
  if (state.uids.length < 1) throw new Error('Wait for a team to join.');
  if (state.started || state.picks.length) throw new Error('The draft has already started.');
  // Starting with fewer than the configured slots runs a complete draft with those present.
  return { ...state, teamCount: state.uids.length, started: true };
}
export function shuffleOrder(order: string[], randomIndex: (max: number) => number): string[] {
  const shuffled = [...order];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid shuffle value.');
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
export function addPick(state: DraftState, uid: string, contestant: string, validIds: string[], expectedPick: number): DraftState {
  if (!state.started) throw new Error('Wait for the organizer to start the draft.');
  if (state.picks.length >= PICK_COUNT) throw new Error('The draft is complete.');
  if (state.picks.length !== expectedPick) throw new Error('The board changed. Review the current pick and try again.');
  if (state.order[teamForPick(state.picks.length, state.teamCount)] !== uid) throw new Error('It is not your turn yet.');
  if (!validIds.includes(contestant)) throw new Error('This contestant is not in the draft.');
  if (state.picks.includes(contestant)) throw new Error('This contestant has already been drafted.');
  return { ...state, picks: [...state.picks, contestant] };
}
