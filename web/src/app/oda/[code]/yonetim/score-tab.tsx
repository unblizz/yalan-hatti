'use client'

import { AnimatedNumber, FlipList } from '@/components/motion'
import { Section } from '@/components/ui'
import type { HostView } from '@/lib/types'

export function ScoreTab({ view }: { view: HostView }) {
  const done = view.stages.filter((s) => s.phase === 'done')
  const awardOf = (stageNumber: number, name: string) => done.find((s) => s.number === stageNumber)?.awards.find((a) => a.name === name)?.award ?? 0
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Section framed title="Genel tablo">
        <FlipList
          items={view.leaderboard}
          className="-my-2 divide-y divide-line"
          render={(row, i) => (
            <div className={`flex items-center justify-between py-3 text-lg ${row.eliminated ? 'text-quiet line-through' : ''}`}>
              <span>
                <span className="mr-4 inline-block w-5 text-quiet">{i + 1}</span>
                <span className="font-bold">{row.name}</span>
              </span>
              <AnimatedNumber value={row.points} className="text-2xl font-extrabold" />
            </div>
          )}
        />
      </Section>
      <Section framed title="Etap etap" meta={`${done.length}/${view.totalStages} etap`}>
        {done.length === 0 ? (
          <p className="text-sm text-quiet">Henüz puanı yazılmış etap yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-quiet">
                  <th className="py-2 font-semibold">Oyuncu</th>
                  {done.map((s) => (
                    <th key={s.number} className="px-2 text-center font-semibold" title={s.title}>
                      E{s.number}
                    </th>
                  ))}
                  <th className="text-right font-semibold">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.leaderboard.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 font-semibold">{row.name}</td>
                    {done.map((s) => {
                      const award = awardOf(s.number, row.name)
                      return (
                        <td key={s.number} className={`px-2 text-center ${award ? 'font-bold text-ok' : 'text-quiet'}`}>
                          {award ? `+${award}` : '·'}
                        </td>
                      )
                    })}
                    <td className="text-right font-extrabold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
