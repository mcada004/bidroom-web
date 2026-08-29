"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Player = readonly [rank: number, name: string, position: string, team: string, flag: string];
type DraftStatus = "X" | "D";
type StatusMap = Record<number, DraftStatus>;

const PLAYERS: readonly Player[] = [[1,"Jahmyr Gibbs","RB","DET","CLEAR"],[2,"Bijan Robinson","RB","ATL",""],[3,"Ja'Marr Chase","WR","CIN","WATCH"],[4,"Puka Nacua","WR","LAR","WATCH"],[5,"Christian McCaffrey","RB","SF","CLEAR"],[6,"Jaxon Smith-Njigba","WR","SEA",""],[7,"Jonathan Taylor","RB","IND",""],[8,"De'Von Achane","RB","MIA","UP"],[9,"Amon-Ra St. Brown","WR","DET",""],[10,"CeeDee Lamb","WR","DAL",""],[11,"Justin Jefferson","WR","MIN",""],[12,"James Cook III","RB","BUF",""],[13,"Drake London","WR","ATL",""],[14,"Saquon Barkley","RB","PHI",""],[15,"Omarion Hampton","RB","LAC",""],[16,"Chase Brown","RB","CIN",""],[17,"Derrick Henry","RB","BAL",""],[18,"Nico Collins","WR","HOU","UP"],[19,"A.J. Brown","WR","NE",""],[20,"Ashton Jeanty","RB","LV","HIGH"],[21,"Chris Olave","WR","NO","LOW"],[22,"Brock Bowers","TE","LV",""],[23,"Trey McBride","TE","ARI",""],[24,"Josh Allen","QB","BUF",""],[25,"George Pickens","WR","DAL",""],[26,"Rashee Rice","WR","KC",""],[27,"Javonte Williams","RB","DAL",""],[28,"Kyren Williams","RB","LAR",""],[29,"Kenneth Walker III","RB","KC","WATCH"],[30,"DeVonta Smith","WR","PHI",""],[31,"Travis Etienne Jr.","RB","NO","UP"],[32,"Garrett Wilson","WR","NYJ","CLEAR"],[33,"Zay Flowers","WR","BAL",""],[34,"Breece Hall","RB","NYJ","WATCH"],[35,"Josh Jacobs","RB","GB","WATCH"],[36,"Tetairoa McMillan","WR","CAR","UP"],[37,"Tee Higgins","WR","CIN",""],[38,"Jeremiyah Love","RB","ARI","HIGH"],[39,"Ladd McConkey","WR","LAC","LOW"],[40,"Emeka Egbuka","WR","TB",""],[41,"Davante Adams","WR","LAR",""],[42,"Malik Nabers","WR","NYG",""],[43,"Cam Skattebo","RB","NYG","WATCH"],[44,"Colston Loveland","TE","CHI",""],[45,"Jaylen Waddle","WR","DEN",""],[46,"Bucky Irving","RB","TB",""],[47,"D'Andre Swift","RB","CHI",""],[48,"Lamar Jackson","QB","BAL",""],[49,"Quinshon Judkins","RB","CLE",""],[50,"DJ Moore","WR","BUF","UP"],[51,"Terry McLaurin","WR","WAS","DOWN"],[52,"Jameson Williams","WR","DET",""],[53,"Luther Burden III","WR","CHI","UP / WATCH"],[54,"Drake Maye","QB","NE",""],[55,"Bhayshul Tuten","RB","JAC",""],[56,"David Montgomery","RB","HOU","WATCH"],[57,"Joe Burrow","QB","CIN",""],[58,"Jayden Daniels","QB","WAS","WATCH"],[59,"Mike Evans","WR","SF","WATCH"],[60,"Carnell Tate","WR","TEN",""],[61,"Jadarian Price","RB","SEA","WATCH"],[62,"Rhamondre Stevenson","RB","NE","UP"],[63,"Tyler Warren","TE","IND","WATCH"],[64,"Rome Odunze","WR","CHI",""],[65,"Christian Watson","WR","GB",""],[66,"Tony Pollard","RB","TEN",""],[67,"Jalen Hurts","QB","PHI",""],[68,"Marvin Harrison Jr.","WR","ARI",""],[69,"Parker Washington","WR","JAC",""],[70,"Dak Prescott","QB","DAL",""],[71,"DK Metcalf","WR","PIT",""],[72,"Courtland Sutton","WR","DEN",""],[73,"Chuba Hubbard","RB","CAR","WATCH"],[74,"Brian Thomas Jr.","WR","JAC","WATCH"],[75,"Caleb Williams","QB","CHI",""],[76,"TreVeyon Henderson","RB","NE","DOWN / WATCH"],[77,"Trevor Lawrence","QB","JAC",""],[78,"Justin Herbert","QB","LAC",""],[79,"Rico Dowdle","RB","PIT",""],[80,"Jaylen Warren","RB","PIT",""],[81,"Brock Purdy","QB","SF",""],[82,"Jaxson Dart","QB","NYG",""],[83,"Harold Fannin Jr.","TE","CLE",""],[84,"Kyle Pitts Sr.","TE","ATL",""],[85,"Michael Pittman Jr.","WR","PIT",""],[86,"Alec Pierce","WR","IND","UP / WATCH"],[87,"Jakobi Meyers","WR","JAC",""],[88,"Patrick Mahomes","QB","KC","WATCH"],[89,"Kenny Gainwell","RB","TB",""],[90,"Michael Wilson","WR","ARI",""],[91,"Jordan Addison","WR","MIN",""],[92,"Matthew Stafford","QB","LAR",""],[93,"J.K. Dobbins","RB","DEN",""],[94,"Jonathon Brooks","RB","CAR","UP"],[95,"RJ Harvey","RB","DEN",""],[96,"KC Concepcion","WR","CLE","UP"],[97,"Bo Nix","QB","DEN",""],[98,"Sam LaPorta","TE","DET","HIGH"],[99,"Blake Corum","RB","LAR",""],[100,"Kyle Monangai","RB","CHI",""],[101,"George Kittle","TE","SF","WATCH"],[102,"Aaron Jones Sr.","RB","MIN",""],[103,"Matthew Golden","WR","GB",""],[104,"Jayden Reed","WR","GB",""],[105,"Dalton Kincaid","TE","BUF","UP / WATCH"],[106,"Makai Lemon","WR","PHI","DOWN"],[107,"Stefon Diggs","WR","WAS","UP"],[108,"Travis Kelce","TE","KC",""],[109,"Chris Godwin Jr.","WR","TB",""],[110,"Quentin Johnston","WR","LAC",""],[111,"Mark Andrews","TE","BAL",""],[112,"Xavier Worthy","WR","KC",""],[113,"Wan'Dale Robinson","WR","TEN",""],[114,"Rachaad White","RB","WAS",""],[115,"Tyler Allgeier","RB","ARI","UP"],[116,"Jordan Mason","RB","MIN",""],[117,"Woody Marks","RB","HOU","UP"],[118,"Jared Goff","QB","DET",""],[119,"Isaiah Likely","TE","NYG",""],[120,"Tucker Kraft","TE","GB","DOWN"],[121,"Jordyn Brooks","LB","MIA","1 LB ONLY"],[122,"Jake Ferguson","TE","DAL",""],[123,"Dallas Goedert","TE","PHI",""],[124,"Blake Cashman","LB","MIN","1 LB ONLY"],[125,"Jalen Coker","WR","CAR","UP"],[126,"Kyler Murray","QB","MIN",""],[127,"Fred Warner","LB","SF","1 LB ONLY"],[128,"Josh Downs","WR","IND","DOWN"],[129,"Jacory Croskey-Merritt","RB","WAS",""],[130,"Nick Bolton","LB","KC","1 LB ONLY"],[131,"Khalil Shakir","WR","BUF",""],[132,"Chris Rodriguez Jr.","RB","JAC",""],[133,"Jack Campbell","LB","DET","1 LB ONLY"],[134,"Tyler Shough","QB","NO",""],[135,"Romeo Doubs","WR","NE",""],[136,"Carson Schwesinger","LB","CLE","1 LB ONLY"],[137,"Baker Mayfield","QB","TB",""],[138,"Rashid Shaheed","WR","SEA",""],[139,"Foyesade Oluokun","LB","JAC","1 LB ONLY"],[140,"Keenan Allen","WR","IND","UP / WATCH"],[141,"Hunter Henry","TE","NE",""],[142,"Zack Baun","LB","PHI","1 LB ONLY"],[143,"Malik Willis","QB","MIA",""],[144,"Deebo Samuel Sr.","WR","SF","UP"],[145,"Maxx Crosby","DL","LV","1 DL ONLY"],[146,"Brian Robinson Jr.","RB","ATL",""],[147,"Kenyon Sadiq","TE","NYJ",""],[148,"Ernest Jones IV","LB","SEA","1 LB ONLY"],[149,"Jeffery Simmons","DL","TEN","1 DL ONLY"],[150,"Daniel Jones","QB","IND",""],[151,"Jalen McMillan","WR","TB",""],[152,"Denzel Boston","WR","CLE",""],[153,"Myles Garrett","DL","LAR","1 DL ONLY"],[154,"Cedric Gray","LB","TEN","1 LB ONLY"],[155,"Adonai Mitchell","WR","NYJ","UP"],[156,"Mike Washington Jr.","RB","LV","UP / WATCH"],[157,"Brian Burns","DL","NYG","1 DL ONLY"],[158,"T.J. Hockenson","TE","MIN",""],[159,"Kayshon Boutte","WR","HOU","UP"],[160,"Roquan Smith","LB","BAL","1 LB ONLY"],[161,"Will Anderson Jr.","DL","HOU","1 DL ONLY"],[162,"Caleb Douglas","WR","MIA","UP"],[163,"Jerry Jeudy","WR","CLE",""],[164,"Tank Bigsby","RB","PHI",""],[165,"Aidan Hutchinson","DL","DET","1 DL ONLY"],[166,"Edgerrin Cooper","LB","GB","1 LB ONLY"],[167,"Juwan Johnson","TE","NO",""],[168,"De'Zhaun Stribling","WR","SF","UP"],[169,"Nick Emmanwori","DB","SEA","1 DB ONLY"],[170,"Danielle Hunter","DL","HOU","1 DL ONLY"],[171,"Calvin Ridley","WR","TEN",""],[172,"Zach Charbonnet","RB","SEA","PUP"],[173,"Kyle Hamilton","DB","BAL","1 DB ONLY"],[174,"Tre Tucker","WR","LV",""],[175,"T.J. Watt","DL","PIT","1 DL ONLY"],[176,"Travis Hunter","WR","JAC",""],[177,"Tykee Smith","DB","TB","1 DB ONLY"],[178,"Antonio Williams","WR","WAS",""],[179,"Dylan Sampson","RB","CLE",""],[180,"Nick Bosa","DL","SF","1 DL ONLY"],[181,"Derwin James Jr.","DB","LAC","1 DB ONLY"],[182,"Tyrone Tracy Jr.","RB","NYG","DOWN"],[183,"Germie Bernard","WR","PIT",""],[184,"Jessie Bates III","DB","ATL","1 DB ONLY"],[185,"Jared Verse","DL","CLE","1 DL ONLY"],[186,"Ray Davis","RB","BUF",""],[187,"Antoine Winfield Jr.","DB","TB","1 DB ONLY"],[188,"Isiah Pacheco","RB","DET","HIGH"],[189,"Nick Cross","DB","IND","1 DB ONLY"],[190,"Trey Hendrickson","DL","BAL","1 DL ONLY"],[191,"Terrance Ferguson","TE","LAR",""],[192,"Budda Baker","DB","ARI","1 DB ONLY"],[193,"Alvin Kamara","RB","NO","HIGH"],[194,"Brian Branch","DB","DET","1 DB ONLY"],[195,"Josh Hines-Allen","DL","JAC","1 DL ONLY"],[196,"Jordyn Tyson","WR","NO","OUT"],[197,"Jalen Pitre","DB","HOU","1 DB ONLY"],[198,"Jayden Higgins","WR","HOU","OUT"],[199,"Cooper DeJean","DB","PHI","1 DB ONLY"],[200,"Quentin Lake","DB","LAR","1 DB ONLY"]];
const STORAGE_KEY = "brian-2026-fantasy-draft-status-v1";
const IDP_POSITIONS = new Set(["LB", "DL", "DB"]);

export default function FantasyDraftBoard() {
  const [status, setStatus] = useState<StatusMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setStatus(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"));
    } catch {
      setStatus({});
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  }, [loaded, status]);

  const mine = useMemo(() => PLAYERS.filter((player) => status[player[0]] === "D"), [status]);
  const away = useMemo(() => PLAYERS.filter((player) => status[player[0]] === "X"), [status]);
  const filledIdp = useMemo(
    () => new Set(mine.filter((player) => IDP_POSITIONS.has(player[2])).map((player) => player[2])),
    [mine],
  );
  const available = useMemo(
    () => PLAYERS.filter((player) => !status[player[0]] && !(IDP_POSITIONS.has(player[2]) && filledIdp.has(player[2]))),
    [filledIdp, status],
  );

  function toggle(rank: number, next: DraftStatus) {
    setStatus((current) => {
      const updated = { ...current };
      if (updated[rank] === next) delete updated[rank];
      else updated[rank] = next;
      return updated;
    });
  }

  function resetDraft() {
    if (!window.confirm("Reset every X and D on this draft board?")) return;
    setStatus({});
  }

  return (
    <main className="draft-page">
      <section className="draft-hero">
        <div>
          <p className="draft-kicker">2026 · 12 teams · Pick 1.01</p>
          <h1>Fantasy draft command center</h1>
          <p>Tap <strong>X</strong> when someone else takes a player. Tap <strong>D</strong> for your pick. Everything saves automatically on this device.</p>
        </div>
        <div className="draft-hero-actions">
          <Link className="button" href="/fantasy-team">View My Team</Link>
          <button className="button ghost" type="button" onClick={resetDraft}>Reset board</button>
        </div>
      </section>

      <section className="draft-stats" aria-live="polite">
        <article><span>Best available</span><strong>{available[0] ? `${available[0][1]} · ${available[0][2]}` : "Draft complete"}</strong></article>
        <article><span>My roster</span><strong>{mine.length} / 17</strong></article>
        <article><span>Remaining</span><strong>{available.length}</strong></article>
      </section>

      <section className="draft-team" aria-labelledby="my-team-title">
        <div className="draft-section-heading">
          <h2 id="my-team-title">My team</h2>
          <span>Tap a player to undo</span>
        </div>
        <div className="draft-team-list">
          {mine.length ? mine.map((player) => (
            <button key={player[0]} type="button" onClick={() => toggle(player[0], "D")}>
              <span>{player[2]}</span>{player[1]} <b>×</b>
            </button>
          )) : <p>No picks yet. Start with the best player available.</p>}
        </div>
      </section>

      <section className="draft-board-card" aria-labelledby="draft-board-title">
        <div className="draft-section-heading">
          <div>
            <h2 id="draft-board-title">Best available</h2>
            <span>Offense + IDP in one ranking</span>
          </div>
          <div className="draft-legend"><i className="lb" />LB <i className="dl" />DL <i className="db" />DB</div>
        </div>
        <div className="draft-table-wrap">
          <table className="draft-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Pos</th><th>Team</th><th className="draft-flag">Flag</th><th>Status</th></tr></thead>
            <tbody>
              {available.map((player) => (
                <tr key={player[0]} className={`position-${player[2].toLowerCase()}`}>
                  <td>{player[0]}</td>
                  <td><strong>{player[1]}</strong></td>
                  <td><span className="position-badge">{player[2]}</span></td>
                  <td>{player[3]}</td>
                  <td className="draft-flag">{player[4]}</td>
                  <td><div className="draft-actions">
                    <button type="button" className="draft-x" aria-label={`${player[1]} drafted by another team`} onClick={() => toggle(player[0], "X")}>X</button>
                    <button type="button" className="draft-d" aria-label={`Draft ${player[1]} to my team`} onClick={() => toggle(player[0], "D")}>D</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="draft-away">
        <summary>Drafted by others / undo ({away.length})</summary>
        <div className="draft-away-list">
          {away.map((player) => (
            <button type="button" key={player[0]} onClick={() => toggle(player[0], "X")}>
              <span>#{player[0]} · {player[2]}</span>{player[1]} <b>Undo</b>
            </button>
          ))}
        </div>
      </details>
    </main>
  );
}
