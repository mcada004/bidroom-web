export const SURVIVOR_ROOM = 'survivor-51-2026';
export const TEAM_COUNT = 5;
export const PICK_COUNT = 20;
export type DraftState = { uids: string[]; names: string[]; nameKeys: string[]; order: string[]; started: boolean; picks: string[] };
export const emptyDraft = (): DraftState => ({ uids: [], names: [], nameKeys: [], order: [], started: false, picks: [] });
export function teamForPick(pick: number): number {
  const round = Math.floor(pick / TEAM_COUNT);
  return round % 2 === 0 ? pick % TEAM_COUNT : TEAM_COUNT - 1 - pick % TEAM_COUNT;
}
export function addTeam(state: DraftState, uid: string, rawName: string): DraftState {
  if (state.uids.includes(uid)) return state;
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Use a team name between 2 and 24 characters.');
  if (state.uids.length >= TEAM_COUNT) throw new Error('All five teams have joined. You can still watch the draft.');
  if (state.nameKeys.includes(name.toLowerCase())) throw new Error('That team name is taken. Choose a different name.');
  return { ...state, uids: [...state.uids, uid], names: [...state.names, name], nameKeys: [...state.nameKeys, name.toLowerCase()], order: [...state.order, uid] };
}
export function moveTeam(state: DraftState, from: number, to: number): DraftState {
  if (state.started || state.picks.length) throw new Error('The draft order is locked.');
  if (from < 0 || from >= state.order.length || to < 0 || to >= state.order.length) throw new Error('That team is not in the draft.');
  const order = [...state.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...state, order };
}
export function startDraft(state: DraftState): DraftState {
  if (state.uids.length !== TEAM_COUNT) throw new Error('Wait for all five teams to join.');
  if (state.started || state.picks.length) throw new Error('The draft has already started.');
  return { ...state, started: true };
}
export function addPick(state: DraftState, uid: string, contestant: string, validIds: string[], expectedPick: number): DraftState {
  if (state.uids.length !== TEAM_COUNT || !state.started) throw new Error('Wait for the organizer to start the draft.');
  if (state.picks.length >= PICK_COUNT) throw new Error('The draft is complete.');
  if (state.picks.length !== expectedPick) throw new Error('The board changed. Review the current pick and try again.');
  if (state.order[teamForPick(state.picks.length)] !== uid) throw new Error('It is not your turn yet.');
  if (!validIds.includes(contestant)) throw new Error('This contestant is not in the draft.');
  if (state.picks.includes(contestant)) throw new Error('This contestant has already been drafted.');
  return { ...state, picks: [...state.picks, contestant] };
}
