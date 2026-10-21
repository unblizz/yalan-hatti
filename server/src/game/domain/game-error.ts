export type GameErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'invalid_phase'
  | 'invalid_input'
  | 'room_full'
  | 'name_taken'
  | 'duplicate_number'
  | 'setup_incomplete'
  | 'claimed'
  | 'caller_busy'
  | 'lines_closed'
  | 'eliminated'
  | 'locked'
  | 'not_enough_players'
  | 'checklist_required'

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'GameError'
  }
}
