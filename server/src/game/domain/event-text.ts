import type { DomainEvent, GameState, StageKind } from './game.types.js'
import { STAGES } from './stages.js'

const ROLE_LABEL: Record<string, string> = { host: 'Yönetim', player: 'Oyuncu', screen: 'Sahne ekranı' }

export function describeEvent(event: DomainEvent, state: GameState): string {
  const d = event.data
  const name = (id: unknown) => state.players.find((p) => p.id === id)?.name ?? String(id ?? '?')
  const str = (v: unknown) => String(v ?? '')
  const stageTitle = () => STAGES[d.kind as StageKind]?.title ?? str(d.kind)
  const seconds = (ms: unknown) => `${Math.max(0, Math.round(Number(ms ?? 0) / 1000))} sn`
  const pair = () => `${name(d.caller)} → ${d.callee ? name(d.callee) : str(d.dialed)}`

  switch (event.type) {
    case 'room.created':
      return `Oda açıldı: ${str(d.code)}`
    case 'player.added':
      return `${str(d.name)} kadroya eklendi`
    case 'player.removed':
      return `${str(d.name)} kadrodan çıkarıldı`
    case 'player.updated':
      return `${name(d.playerId)} güncellendi${d.room ? `, oda ${str(d.room)}` : ''}${d.line ? `, hat ${str(d.line)}` : ''}`
    case 'numbers.assigned':
      return 'Oda ve hat numaraları yeniden dağıtıldı'
    case 'settings.updated':
      return 'Ayarlar değişti'
    case 'player.claimed':
      return `${str(d.name)} cihazına bağlandı`
    case 'player.released':
      return `${str(d.name)} cihazdan ayrıldı`
    case 'player.eliminated':
      return `${str(d.name)} oyundan çıktı`
    case 'game.started':
      return 'Oyun başladı'
    case 'stage.opened':
      return `Etap ${str(d.number)} açıldı: ${stageTitle()}`
    case 'stage.cancelled':
      return `Etap ${str(d.number)} iptal edildi`
    case 'checklist.confirmed':
      return `Kayıt kontrolü onaylandı (etap ${str(d.forStage)})`
    case 'stage.started':
      return `Etap ${str(d.number)} başladı: ${stageTitle()}, ${str(d.seconds)} sn`
    case 'stage.paused':
      return `Etap ${str(d.number)} duraklatıldı`
    case 'stage.resumed':
      return `Etap ${str(d.number)} sürdü (${seconds(d.pausedMs)} ara)`
    case 'stage.extended':
      return `Etap ${str(d.number)} süresi +${str(d.seconds)} sn`
    case 'stage.closed':
      return `Etap ${str(d.number)} bitti, sonuçlar hesaplandı`
    case 'stage.awarded':
      return `Etap ${str(d.number)}: ${name(d.playerId)} puanı elle ${Number(d.award) > 0 ? '+' : ''}${str(d.award)} yapıldı`
    case 'button.paired':
      return `Eşleşme: ${name(d.a)} ↔ ${name(d.b)}`
    case 'button.pressed':
      return `${name(event.actor)} ${d.choice === 'red' ? 'kırmızı' : 'yeşil'} bastı`
    case 'button.resolved': {
      if (d.outcome === 'void') return `Eşleşme bitmeden süre doldu: ${name(d.a)} ↔ ${name(d.b)}`
      const choices = (d.choices as Record<string, string>) ?? {}
      const deltas = (d.deltas as Record<string, number>) ?? {}
      const part = (id: unknown) => {
        const c = choices[String(id)]
        return `${name(id)} ${c === 'red' ? 'kırmızı' : c === 'green' ? 'yeşil' : 'basmadı'} +${deltas[String(id)] ?? 0}`
      }
      return `Sonuç: ${part(d.a)}, ${part(d.b)}${d.outcome === 'timeout' ? ' (süre doldu)' : ''}`
    }
    case 'vote.cast':
      return `${name(event.actor)} oy verdi`
    case 'stage.confirmed': {
      const awards = Object.entries((d.awards as Record<string, number>) ?? {})
        .map(([id, p]) => `${name(id)} ${p > 0 ? '+' : ''}${p}`)
        .join(', ')
      return `Etap ${str(d.number)} puanları yazıldı${awards ? `: ${awards}` : ''}`
    }
    case 'guess.set':
      return `${name(event.actor)} listesini güncelledi`
    case 'guess.locked':
      return `${name(event.actor)} listesini kilitledi (${str(d.filled)} oda)`
    case 'lines.opened':
      return 'Hatlar açıldı'
    case 'lines.closed':
      return 'Hatlar kapandı'
    case 'call.ringing':
      return `Arama: ${pair()}`
    case 'call.answered':
      return `Görüşme başladı: ${pair()}`
    case 'call.busy':
      return `Meşgul: ${pair()}`
    case 'call.unreachable':
      return `Kullanılmayan numara: ${name(d.caller)} → ${str(d.dialed)}`
    case 'call.declined':
      return `Reddedildi: ${pair()}`
    case 'call.missed':
      return `Cevapsız: ${pair()}`
    case 'call.ended':
      return `Görüşme bitti: ${pair()}, ${seconds(d.durationMs)}`
    case 'call.recorded':
      return `Görüşme kaydı alındı (${name(event.actor)})`
    case 'marker.added':
      return `İŞARET: ${str(d.label)}`
    case 'game.finished':
      return `Oyun bitti. Kazanan: ${((d.winnerIds as string[] | undefined) ?? []).map(name).join(', ') || '-'}`
    case 'device.connected':
      return `${ROLE_LABEL[str(d.role)] ?? str(d.role)} cihazı bağlandı: ${str(d.label)}`
    case 'device.disconnected':
      return `${ROLE_LABEL[str(d.role)] ?? str(d.role)} cihazı koptu: ${str(d.label)}`
    case 'alert.raised':
      return `Uyarı: ${str(d.title)}${d.detail ? ` (${str(d.detail)})` : ''}`
    case 'alert.resolved':
      return `Uyarı kapandı: ${str(d.title)}, ${seconds(Math.max(1000, Number(d.durationMs ?? 0)))} sürdü`
    case 'alert.acknowledged':
      return `Uyarı görüldü: ${str(d.title)}`
    case 'server.started':
      return 'Sunucu başladı, oyun durumu diskten yüklendi'
    default:
      return event.type
  }
}
