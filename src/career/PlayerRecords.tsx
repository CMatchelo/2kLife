import type { Career } from '../types/career';
import { emptyMatchRecords, recordKeys } from '../domain/matchRecords';
import { statLabels } from '../domain/gameDetails';
import { teamName } from '../domain/teams';
export default function PlayerRecords({ career }: { career: Career }) {
  const records = career.profile.matchRecords ?? emptyMatchRecords();
  return <section className="career-card space-y-6">
    <h2 className="text-xl font-bold">Player records · Career-wide</h2>
    <p className="text-sm text-muted">Single-game highs from recorded matches. Previously saved matches enter records when edited and saved.</p>
    {(['regularSeason', 'playoffs'] as const).map(category => <div key={category} className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-3 text-left text-lg font-bold">{category === 'regularSeason' ? 'Regular season' : 'Playoffs'}</caption>
        <thead><tr className="border-b border-divider"><th scope="col" className="p-2">Statistic</th><th scope="col" className="p-2">Record</th><th scope="col" className="p-2">Matches</th></tr></thead>
        <tbody>{recordKeys.map(key => <tr key={key} className="border-b border-divider/50">
          <th scope="row" className="p-2 font-medium">{statLabels[key]}</th>
          <td className="p-2 font-bold">{records[category][key]?.value ?? '—'}</td>
          <td className="p-2">{records[category][key]?.gameIds.map(id => {
            const game = career.season.games.find(g => g.id === id);
            return <div key={id}>{game ? `${game.date} · ${teamName(career.teams, game.opponentId)} · ${game.location === 'home' ? 'Home' : 'Away'}` : 'Previous season match'}</div>;
          }) ?? 'No record yet'}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}
