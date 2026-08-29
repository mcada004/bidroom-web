"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/lib/firebase";
import { FANTASY_PLAYER_NOTES } from "@/src/lib/fantasyPlayerNotes";

export type Player = readonly [rank: number, name: string, position: string, team: string, flag: string];
type DraftStatus = "X" | "D";
type StatusMap = Record<number, DraftStatus>;
type TeamSort = "rank" | "position" | "name" | "team";

const PLAYERS: readonly Player[] = [[1,"Jahmyr Gibbs","RB","DET","CLEAR"],[2,"Bijan Robinson","RB","ATL",""],[3,"Ja'Marr Chase","WR","CIN","WATCH"],[4,"Puka Nacua","WR","LAR","WATCH"],[5,"Christian McCaffrey","RB","SF","CLEAR"],[6,"Jaxon Smith-Njigba","WR","SEA",""],[7,"Jonathan Taylor","RB","IND",""],[8,"De'Von Achane","RB","MIA","UP"],[9,"Amon-Ra St. Brown","WR","DET",""],[10,"CeeDee Lamb","WR","DAL",""],[11,"Justin Jefferson","WR","MIN",""],[12,"James Cook III","RB","BUF",""],[13,"Drake London","WR","ATL",""],[14,"Saquon Barkley","RB","PHI",""],[15,"Omarion Hampton","RB","LAC",""],[16,"Chase Brown","RB","CIN",""],[17,"Derrick Henry","RB","BAL",""],[18,"Nico Collins","WR","HOU","UP"],[19,"A.J. Brown","WR","NE",""],[20,"Ashton Jeanty","RB","LV","HIGH"],[21,"Chris Olave","WR","NO","LOW"],[22,"Brock Bowers","TE","LV",""],[23,"Trey McBride","TE","ARI",""],[24,"Josh Allen","QB","BUF",""],[25,"George Pickens","WR","DAL",""],[26,"Rashee Rice","WR","KC",""],[27,"Javonte Williams","RB","DAL",""],[28,"Kyren Williams","RB","LAR",""],[29,"Kenneth Walker III","RB","KC","WATCH"],[30,"DeVonta Smith","WR","PHI",""],[31,"Travis Etienne Jr.","RB","NO","UP"],[32,"Garrett Wilson","WR","NYJ","CLEAR"],[33,"Zay Flowers","WR","BAL",""],[34,"Breece Hall","RB","NYJ","WATCH"],[35,"Josh Jacobs","RB","GB","WATCH"],[36,"Tetairoa McMillan","WR","CAR","UP"],[37,"Tee Higgins","WR","CIN",""],[38,"Jeremiyah Love","RB","ARI","HIGH"],[39,"Ladd McConkey","WR","LAC","LOW"],[40,"Emeka Egbuka","WR","TB",""],[41,"Davante Adams","WR","LAR",""],[42,"Malik Nabers","WR","NYG",""],[43,"Cam Skattebo","RB","NYG","WATCH"],[44,"Colston Loveland","TE","CHI",""],[45,"Jaylen Waddle","WR","DEN",""],[46,"Bucky Irving","RB","TB",""],[47,"D'Andre Swift","RB","CHI",""],[48,"Lamar Jackson","QB","BAL",""],[49,"Quinshon Judkins","RB","CLE",""],[50,"DJ Moore","WR","BUF","UP"],[51,"Terry McLaurin","WR","WAS","DOWN"],[52,"Jameson Williams","WR","DET",""],[53,"Luther Burden III","WR","CHI","UP / WATCH"],[54,"Drake Maye","QB","NE",""],[55,"Bhayshul Tuten","RB","JAC",""],[56,"David Montgomery","RB","HOU","WATCH"],[57,"Joe Burrow","QB","CIN",""],[58,"Jayden Daniels","QB","WAS","WATCH"],[59,"Mike Evans","WR","SF","WATCH"],[60,"Carnell Tate","WR","TEN",""],[61,"Jadarian Price","RB","SEA","WATCH"],[62,"Rhamondre Stevenson","RB","NE","UP"],[63,"Tyler Warren","TE","IND","WATCH"],[64,"Rome Odunze","WR","CHI",""],[65,"Christian Watson","WR","GB",""],[66,"Tony Pollard","RB","TEN",""],[67,"Jalen Hurts","QB","PHI",""],[68,"Marvin Harrison Jr.","WR","ARI",""],[69,"Parker Washington","WR","JAC",""],[70,"Dak Prescott","QB","DAL",""],[71,"DK Metcalf","WR","PIT",""],[72,"Courtland Sutton","WR","DEN",""],[73,"Chuba Hubbard","RB","CAR","WATCH"],[74,"Brian Thomas Jr.","WR","JAC","WATCH"],[75,"Caleb Williams","QB","CHI",""],[76,"TreVeyon Henderson","RB","NE","DOWN / WATCH"],[77,"Trevor Lawrence","QB","JAC",""],[78,"Justin Herbert","QB","LAC",""],[79,"Rico Dowdle","RB","PIT",""],[80,"Jaylen Warren","RB","PIT",""],[81,"Brock Purdy","QB","SF",""],[82,"Jaxson Dart","QB","NYG",""],[83,"Harold Fannin Jr.","TE","CLE",""],[84,"Kyle Pitts Sr.","TE","ATL",""],[85,"Michael Pittman Jr.","WR","PIT",""],[86,"Alec Pierce","WR","IND","UP / WATCH"],[87,"Jakobi Meyers","WR","JAC",""],[88,"Patrick Mahomes","QB","KC","WATCH"],[89,"Kenny Gainwell","RB","TB",""],[90,"Michael Wilson","WR","ARI",""],[91,"Jordan Addison","WR","MIN",""],[92,"Matthew Stafford","QB","LAR",""],[93,"J.K. Dobbins","RB","DEN",""],[94,"Jonathon Brooks","RB","CAR","UP"],[95,"RJ Harvey","RB","DEN",""],[96,"KC Concepcion","WR","CLE","UP"],[97,"Bo Nix","QB","DEN",""],[98,"Sam LaPorta","TE","DET","HIGH"],[99,"Blake Corum","RB","LAR",""],[100,"Kyle Monangai","RB","CHI",""],[101,"George Kittle","TE","SF","WATCH"],[102,"Aaron Jones Sr.","RB","MIN",""],[103,"Matthew Golden","WR","GB",""],[104,"Jayden Reed","WR","GB",""],[105,"Dalton Kincaid","TE","BUF","UP / WATCH"],[106,"Makai Lemon","WR","PHI","DOWN"],[107,"Stefon Diggs","WR","WAS","UP"],[108,"Travis Kelce","TE","KC",""],[109,"Chris Godwin Jr.","WR","TB",""],[110,"Quentin Johnston","WR","LAC",""],[111,"Mark Andrews","TE","BAL",""],[112,"Xavier Worthy","WR","KC",""],[113,"Wan'Dale Robinson","WR","TEN",""],[114,"Rachaad White","RB","WAS",""],[115,"Tyler Allgeier","RB","ARI","UP"],[116,"Jordan Mason","RB","MIN",""],[117,"Woody Marks","RB","HOU","UP"],[118,"Jared Goff","QB","DET",""],[119,"Isaiah Likely","TE","NYG",""],[120,"Tucker Kraft","TE","GB","DOWN"],[121,"Jordyn Brooks","LB","MIA","1 LB ONLY"],[122,"Jake Ferguson","TE","DAL",""],[123,"Dallas Goedert","TE","PHI",""],[124,"Blake Cashman","LB","MIN","1 LB ONLY"],[125,"Jalen Coker","WR","CAR","UP"],[126,"Kyler Murray","QB","MIN",""],[127,"Fred Warner","LB","SF","1 LB ONLY"],[128,"Josh Downs","WR","IND","DOWN"],[129,"Jacory Croskey-Merritt","RB","WAS",""],[130,"Nick Bolton","LB","KC","1 LB ONLY"],[131,"Khalil Shakir","WR","BUF",""],[132,"Chris Rodriguez Jr.","RB","JAC",""],[133,"Jack Campbell","LB","DET","1 LB ONLY"],[134,"Tyler Shough","QB","NO",""],[135,"Romeo Doubs","WR","NE",""],[136,"Carson Schwesinger","LB","CLE","1 LB ONLY"],[137,"Baker Mayfield","QB","TB",""],[138,"Rashid Shaheed","WR","SEA",""],[139,"Foyesade Oluokun","LB","JAC","1 LB ONLY"],[140,"Keenan Allen","WR","IND","UP / WATCH"],[141,"Hunter Henry","TE","NE",""],[142,"Zack Baun","LB","PHI","1 LB ONLY"],[143,"Malik Willis","QB","MIA",""],[144,"Deebo Samuel Sr.","WR","SF","UP"],[145,"Maxx Crosby","DL","LV","1 DL ONLY"],[146,"Brian Robinson Jr.","RB","ATL",""],[147,"Kenyon Sadiq","TE","NYJ",""],[148,"Ernest Jones IV","LB","SEA","1 LB ONLY"],[149,"Jeffery Simmons","DL","TEN","1 DL ONLY"],[150,"Daniel Jones","QB","IND",""],[151,"Jalen McMillan","WR","TB",""],[152,"Denzel Boston","WR","CLE",""],[153,"Myles Garrett","DL","LAR","1 DL ONLY"],[154,"Cedric Gray","LB","TEN","1 LB ONLY"],[155,"Adonai Mitchell","WR","NYJ","UP"],[156,"Mike Washington Jr.","RB","LV","UP / WATCH"],[157,"Brian Burns","DL","NYG","1 DL ONLY"],[158,"T.J. Hockenson","TE","MIN",""],[159,"Kayshon Boutte","WR","HOU","UP"],[160,"Roquan Smith","LB","BAL","1 LB ONLY"],[161,"Will Anderson Jr.","DL","HOU","1 DL ONLY"],[162,"Caleb Douglas","WR","MIA","UP"],[163,"Jerry Jeudy","WR","CLE",""],[164,"Tank Bigsby","RB","PHI",""],[165,"Aidan Hutchinson","DL","DET","1 DL ONLY"],[166,"Edgerrin Cooper","LB","GB","1 LB ONLY"],[167,"Juwan Johnson","TE","NO",""],[168,"De'Zhaun Stribling","WR","SF","UP"],[169,"Nick Emmanwori","DB","SEA","1 DB ONLY"],[170,"Danielle Hunter","DL","HOU","1 DL ONLY"],[171,"Calvin Ridley","WR","TEN",""],[172,"Zach Charbonnet","RB","SEA","PUP"],[173,"Kyle Hamilton","DB","BAL","1 DB ONLY"],[174,"Tre Tucker","WR","LV",""],[175,"T.J. Watt","DL","PIT","1 DL ONLY"],[176,"Travis Hunter","WR","JAC",""],[177,"Tykee Smith","DB","TB","1 DB ONLY"],[178,"Antonio Williams","WR","WAS",""],[179,"Dylan Sampson","RB","CLE",""],[180,"Nick Bosa","DL","SF","1 DL ONLY"],[181,"Derwin James Jr.","DB","LAC","1 DB ONLY"],[182,"Tyrone Tracy Jr.","RB","NYG","DOWN"],[183,"Germie Bernard","WR","PIT",""],[184,"Jessie Bates III","DB","ATL","1 DB ONLY"],[185,"Jared Verse","DL","CLE","1 DL ONLY"],[186,"Ray Davis","RB","BUF",""],[187,"Antoine Winfield Jr.","DB","TB","1 DB ONLY"],[188,"Isiah Pacheco","RB","DET","HIGH"],[189,"Nick Cross","DB","IND","1 DB ONLY"],[190,"Trey Hendrickson","DL","BAL","1 DL ONLY"],[191,"Terrance Ferguson","TE","LAR",""],[192,"Budda Baker","DB","ARI","1 DB ONLY"],[193,"Alvin Kamara","RB","NO","HIGH"],[194,"Brian Branch","DB","DET","1 DB ONLY"],[195,"Josh Hines-Allen","DL","JAC","1 DL ONLY"],[196,"Jordyn Tyson","WR","NO","OUT"],[197,"Jalen Pitre","DB","HOU","1 DB ONLY"],[198,"Jayden Higgins","WR","HOU","OUT"],[199,"Cooper DeJean","DB","PHI","1 DB ONLY"],[200,"Quentin Lake","DB","LAR","1 DB ONLY"]];
const PLAYER_REPLACEMENTS = new Map<number, Player>([
  [196, [196, "Najee Harris", "RB", "NYG", "UP"]],
  [198, [198, "Tyjae Spears", "RB", "TEN", "UP"]],
]);

const PLAYER_TARGET_RANKS = new Map<string, number>([
  ["Ashton Jeanty", 27],
  ["David Montgomery", 61],
  ["Tony Pollard", 74],
  ["Tyler Allgeier", 108],
  ["Woody Marks", 110],
  ["Makai Lemon", 122],
  ["Mike Washington Jr.", 132],
  ["Tyjae Spears", 134],
  ["Najee Harris", 176],
  ["Tyrone Tracy Jr.", 190],
]);

function buildRankedPlayers(basePlayers: readonly Player[]): readonly Player[] {
  const sourcePlayers = basePlayers.map((player) => PLAYER_REPLACEMENTS.get(player[0]) ?? player);
  const movedNames = new Set(PLAYER_TARGET_RANKS.keys());
  const remaining = sourcePlayers.filter((player) => !movedNames.has(player[1]));
  const slots: Array<Player | undefined> = new Array(sourcePlayers.length);

  for (const player of sourcePlayers) {
    const targetRank = PLAYER_TARGET_RANKS.get(player[1]);
    if (targetRank) slots[targetRank - 1] = player;
  }

  let remainingIndex = 0;
  return Array.from({ length: slots.length }, (_, index) => {
    const player = slots[index];
    const rankedPlayer = player ?? remaining[remainingIndex++];
    return [index + 1, rankedPlayer[1], rankedPlayer[2], rankedPlayer[3], rankedPlayer[4]] as Player;
  });
}

const PLAYER_IDS_BY_NAME = new Map(
  PLAYERS.map((player) => {
    const replacement = PLAYER_REPLACEMENTS.get(player[0]) ?? player;
    return [replacement[1], replacement[0]] as const;
  })
);
const RANKED_PLAYERS = buildRankedPlayers(PLAYERS);

export function getFantasyPlayerId(player: Player) {
  return PLAYER_IDS_BY_NAME.get(player[1]) ?? player[0];
}

export { RANKED_PLAYERS as PLAYERS };
const STORAGE_KEY = "brian-2026-fantasy-draft-status-v1";
const ADMIN_EMAIL = "mcada004@gmail.com";
const DRAFT_ID = "brian-2026-live";
const IDP_POSITIONS = new Set(["LB", "DL", "DB"]);
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "DL", "LB", "DB", "K"];
const BOARD_POSITIONS = POSITION_ORDER.filter((position) => RANKED_PLAYERS.some((player) => player[2] === position));
type ConnectionState = "connecting" | "live" | "offline";

function readSavedStatus(): StatusMap {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const saved: StatusMap = {};
    for (const [key, status] of Object.entries(value)) {
      const playerId = Number(key);
      if (Number.isInteger(playerId) && playerId >= 1 && playerId <= 200 && (status === "X" || status === "D")) {
        saved[playerId] = status;
      }
    }
    return saved;
  } catch {
    return {};
  }
}

function actionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code.includes("permission-denied")) return "Sign in with Brian's account to change the private board.";
  }
  return error instanceof Error ? error.message : fallback;
}

export default function FantasyDraftBoard({ rosterOnly = false }: { rosterOnly?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<StatusMap>({});
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [busyPlayerId, setBusyPlayerId] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [teamPosition, setTeamPosition] = useState("ALL");
  const [teamSort, setTeamSort] = useState<TeamSort>("rank");
  const [boardPosition, setBoardPosition] = useState("ALL");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const isAdmin = Boolean(
    !authLoading && user && !user.isAnonymous && user.email?.toLowerCase() === ADMIN_EMAIL
  );

  useEffect(() => {
    if (authLoading || !isAdmin || !user) return;

    const savedStatus = readSavedStatus();
    let attemptedMigration = false;
    setConnection("connecting");

    const unsubscribe = onSnapshot(
      collection(db, "fantasyDrafts", DRAFT_ID, "picks"),
      async (snapshot) => {
        const remoteStatus: StatusMap = {};
        for (const pickDocument of snapshot.docs) {
          const playerId = Number(pickDocument.id);
          const pickStatus = pickDocument.data().status;
          if (Number.isInteger(playerId) && playerId >= 1 && playerId <= 200 && (pickStatus === "X" || pickStatus === "D")) {
            remoteStatus[playerId] = pickStatus;
          }
        }

        const missingSavedPicks = Object.entries(savedStatus).filter(([playerId]) => !remoteStatus[Number(playerId)]);
        setStatus(missingSavedPicks.length ? { ...savedStatus, ...remoteStatus } : remoteStatus);
        setLoaded(true);
        setConnection("live");
        setError(null);

        if (attemptedMigration || !missingSavedPicks.length) return;
        attemptedMigration = true;
        try {
          await runTransaction(db, async (transaction) => {
            const refs = missingSavedPicks.map(([playerId]) => doc(db, "fantasyDrafts", DRAFT_ID, "picks", playerId));
            const currentDocuments = await Promise.all(refs.map((reference) => transaction.get(reference)));
            currentDocuments.forEach((currentDocument, index) => {
              if (currentDocument.exists()) return;
              const [, pickStatus] = missingSavedPicks[index];
              transaction.set(refs[index], {
                status: pickStatus,
                actorName: pickStatus === "D" ? "Brian" : "Other team",
                actorUid: user.uid,
                updatedAt: serverTimestamp(),
              });
            });
          });
        } catch (migrationError) {
          setStatus(remoteStatus);
          setError(actionErrorMessage(migrationError, "The live board loaded, but older device-only picks could not be migrated."));
        }
      },
      (syncError) => {
        setStatus(savedStatus);
        setLoaded(true);
        setConnection("offline");
        setError(actionErrorMessage(syncError, "Unable to connect the private board to the shared draft room."));
      }
    );

    return unsubscribe;
  }, [authLoading, isAdmin, user]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  }, [loaded, status]);

  useEffect(() => {
    if (!selectedPlayer) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedPlayer(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlayer]);

  const mine = useMemo(() => RANKED_PLAYERS.filter((player) => status[getFantasyPlayerId(player)] === "D"), [status]);
  const away = useMemo(() => RANKED_PLAYERS.filter((player) => status[getFantasyPlayerId(player)] === "X"), [status]);
  const filledIdp = useMemo(
    () => new Set(mine.filter((player) => IDP_POSITIONS.has(player[2])).map((player) => player[2])),
    [mine],
  );
  const available = useMemo(
    () => RANKED_PLAYERS.filter((player) => !status[getFantasyPlayerId(player)] && !(IDP_POSITIONS.has(player[2]) && filledIdp.has(player[2]))),
    [filledIdp, status],
  );
  const teamPositions = useMemo(
    () => POSITION_ORDER.filter((position) => mine.some((player) => player[2] === position)),
    [mine],
  );
  const displayedMine = useMemo(() => {
    const filtered = teamPosition === "ALL" ? [...mine] : mine.filter((player) => player[2] === teamPosition);
    return filtered.sort((a, b) => {
      if (teamSort === "name") return a[1].localeCompare(b[1]);
      if (teamSort === "team") return a[3].localeCompare(b[3]) || a[1].localeCompare(b[1]);
      if (teamSort === "position") return POSITION_ORDER.indexOf(a[2]) - POSITION_ORDER.indexOf(b[2]) || a[0] - b[0];
      return a[0] - b[0];
    });
  }, [mine, teamPosition, teamSort]);
  const displayedAvailable = useMemo(
    () => boardPosition === "ALL" ? available : available.filter((player) => player[2] === boardPosition),
    [available, boardPosition],
  );

  async function toggle(player: Player, next: DraftStatus) {
    if (!user || !isAdmin) return;
    const playerId = getFantasyPlayerId(player);
    setBusyPlayerId(playerId);
    try {
      const reference = doc(db, "fantasyDrafts", DRAFT_ID, "picks", String(playerId));
      if (status[playerId] === next) {
        await deleteDoc(reference);
      } else {
        await setDoc(reference, {
          status: next,
          actorName: next === "D" ? "Brian" : "Other team",
          actorUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
      setError(null);
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "Unable to update that player on the live board."));
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function resetDraft() {
    if (!window.confirm("Reset every X and D on this draft board?")) return;
    setResetting(true);
    try {
      const batch = writeBatch(db);
      for (const playerId of Object.keys(status)) {
        batch.delete(doc(db, "fantasyDrafts", DRAFT_ID, "picks", playerId));
      }
      await batch.commit();
      setError(null);
    } catch (actionError) {
      setError(actionErrorMessage(actionError, "Unable to reset the live draft board."));
    } finally {
      setResetting(false);
    }
  }

  if (authLoading) {
    return <main className="draft-page"><section className="draft-access-card"><p>Connecting to your private draft board…</p></section></main>;
  }

  if (!isAdmin) {
    return (
      <main className="draft-page">
        <section className="draft-access-card">
          <p className="draft-kicker">Private draft board</p>
          <h1>Brian’s controls are locked</h1>
          <p>Sign in with Brian’s Bidroom account to make picks, corrections, or resets. Guests can draft from the shared room without an account.</p>
          <div className="draft-hero-actions">
            <Link className="button" href="/login?next=/fantasy-draft">Sign in</Link>
            <Link className="button secondary" href="/fantasy-draft/shared">Open shared board</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="draft-page">
      <section className="draft-hero">
        <div>
          <p className="draft-kicker">Updated Aug. 29 · 12 teams · Pick 1.01</p>
          <h1>Fantasy draft command center</h1>
          <p>Tap <strong>X</strong> when someone else takes a player. Tap <strong>D</strong> for your pick. Every change updates the shared draft room automatically.</p>
          <div className={`draft-sync-status ${connection}`}>
            <i />{connection === "live" ? "Private and shared boards synced" : connection === "connecting" ? "Connecting to shared board" : "Shared-board connection interrupted"}
          </div>
        </div>
        <div className="draft-hero-actions">
          <Link className="button secondary" href="/fantasy-draft/shared">Shared Board</Link>
          <Link className="button" href="/fantasy-team">View My Team</Link>
          <button className="button ghost" type="button" disabled={!loaded || resetting} onClick={resetDraft}>{resetting ? "Resetting…" : "Reset board"}</button>
        </div>
      </section>

      {error ? <div className="draft-sync-error" role="alert">{error}</div> : null}

      <section className="draft-stats" aria-live="polite">
        <article><span>{boardPosition === "ALL" ? "Best available" : `Best ${boardPosition}`}</span><strong>{displayedAvailable[0] ? `${displayedAvailable[0][1]} · ${displayedAvailable[0][2]}` : "None available"}</strong></article>
        <article><span>My roster</span><strong>{mine.length} / 17</strong></article>
        <article><span>{boardPosition === "ALL" ? "Remaining" : `${boardPosition} remaining`}</span><strong>{displayedAvailable.length}</strong></article>
      </section>

      <section className="draft-team" aria-labelledby="my-team-title">
        <div className="draft-section-heading">
          <h2 id="my-team-title">My team</h2>
          <span>Tap a player for notes · × removes</span>
        </div>
        {rosterOnly && mine.length ? (
          <div className="fantasy-team-tools">
            <label>
              <span>Filter position</span>
              <select value={teamPosition} onChange={(event) => setTeamPosition(event.target.value)}>
                <option value="ALL">All positions</option>
                {teamPositions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <label>
              <span>Sort by</span>
              <select value={teamSort} onChange={(event) => setTeamSort(event.target.value as TeamSort)}>
                <option value="rank">Draft-board rank</option>
                <option value="position">Position</option>
                <option value="name">Player name</option>
                <option value="team">NFL team</option>
              </select>
            </label>
          </div>
        ) : null}
        <div className="draft-team-list">
          {displayedMine.length ? displayedMine.map((player) => (
            <article className="fantasy-roster-player" key={player[0]}>
              <button className="fantasy-player-info" type="button" onClick={() => setSelectedPlayer(player)}>
                <span>{player[2]}</span>
                <strong>{player[1]}</strong>
                <small>#{player[0]} · {player[3]}</small>
              </button>
              <button
                className="fantasy-player-remove"
                type="button"
                aria-label={`Remove ${player[1]} from my team`}
                disabled={busyPlayerId === getFantasyPlayerId(player)}
                onClick={() => toggle(player, "D")}
              >×</button>
            </article>
          )) : <p>{mine.length ? `No ${teamPosition} players on your roster.` : "No picks yet. Start with the best player available."}</p>}
        </div>
      </section>

      <section className="draft-board-card" aria-labelledby="draft-board-title">
        <div className="draft-section-heading">
          <div>
            <h2 id="draft-board-title">Best available</h2>
            <span>Offense + IDP in one ranking</span>
          </div>
          <div className="draft-board-tools">
            <label className="draft-position-filter">
              <span>Filter position</span>
              <select value={boardPosition} onChange={(event) => setBoardPosition(event.target.value)}>
                <option value="ALL">All positions</option>
                {BOARD_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <div className="draft-legend"><i className="lb" />LB <i className="dl" />DL <i className="db" />DB</div>
          </div>
        </div>
        <div className="draft-table-wrap">
          <table className="draft-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th className="draft-flag">Flag</th><th>Status</th></tr></thead>
            <tbody>
              {displayedAvailable.map((player) => (
                <tr key={player[0]} className={`position-${player[2].toLowerCase()}`}>
                  <td>{player[0]}</td>
                  <td><button className="draft-player-detail" type="button" onClick={() => setSelectedPlayer(player)}>{player[1]}</button></td>
                  <td><span className="position-badge">{player[2]}</span></td>
                  <td>{player[3]}</td>
                  <td className="draft-flag">{player[4]}</td>
                  <td><div className="draft-actions">
                    <button type="button" className="draft-x" aria-label={`${player[1]} drafted by another team`} disabled={!loaded || busyPlayerId === getFantasyPlayerId(player)} onClick={() => toggle(player, "X")}>X</button>
                    <button type="button" className="draft-d" aria-label={`Draft ${player[1]} to my team`} disabled={!loaded || busyPlayerId === getFantasyPlayerId(player)} onClick={() => toggle(player, "D")}>D</button>
                  </div></td>
                </tr>
              ))}
              {!displayedAvailable.length ? (
                <tr><td colSpan={6} className="draft-empty-position">No {boardPosition} players remain.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <details className="draft-away">
        <summary>Drafted by others / undo ({away.length})</summary>
        <div className="draft-away-list">
          {away.map((player) => (
            <article className="draft-away-player" key={player[0]}>
              <button className="draft-away-info" type="button" onClick={() => setSelectedPlayer(player)}>
                <span>#{player[0]} · {player[2]}</span><strong>{player[1]}</strong>
              </button>
              <button className="draft-away-undo" type="button" disabled={busyPlayerId === getFantasyPlayerId(player)} onClick={() => toggle(player, "X")}>Undo</button>
            </article>
          ))}
        </div>
      </details>

      {selectedPlayer ? (
        <div className="fantasy-note-backdrop" role="presentation" onMouseDown={() => setSelectedPlayer(null)}>
          <section
            className="fantasy-note-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fantasy-note-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="fantasy-note-close" type="button" aria-label="Close player notes" onClick={() => setSelectedPlayer(null)}>×</button>
            <p className="fantasy-note-meta">#{selectedPlayer[0]} · {selectedPlayer[2]} · {selectedPlayer[3]}</p>
            <h2 id="fantasy-note-title">{selectedPlayer[1]}</h2>
            <p className="fantasy-note-copy">{FANTASY_PLAYER_NOTES[getFantasyPlayerId(selectedPlayer)]?.note ?? "No additional draft note."}</p>
            {FANTASY_PLAYER_NOTES[getFantasyPlayerId(selectedPlayer)]?.source ? (
              <a href={FANTASY_PLAYER_NOTES[getFantasyPlayerId(selectedPlayer)].source} target="_blank" rel="noreferrer">Open source ↗</a>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
