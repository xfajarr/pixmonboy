/**
 * EVERY product name lives here and nowhere else.
 *
 * CLAUDE.md rule 9: names are tokens, never literals. A rename must be a
 * one line edit in this file. If a name appears as a string anywhere else in
 * src/, that is a bug.
 */

export const brand = {
  /** The virtual handheld itself. */
  CONSOLE_NAME: 'PIXMON BOY',
  /** The first cartridge. The LP game. */
  CARTRIDGE_01: 'STAY IN RANGE',
  /** The second cartridge. The live price prediction game. */
  CARTRIDGE_02: 'MONSPELL',
  /** The out of range early warning. Never called a prediction. */
  ALERT_NAME: 'NAD-SENSE',
  /** The onchain save slot. */
  SAVE_UNIT: 'SAVE DISK',
  /** The wallet, in console language. */
  WALLET_UNIT: 'MEMORY CARD',
  /** The auto-rebalancer. */
  AUTOPILOT_NAME: 'AUTOPILOT',
} as const

export const characters = {
  molandak: { label: 'MOLANDAK', tier: 'EASY' },
  moyaki: { label: 'MOYAKI', tier: 'NORMAL' },
  mouch: { label: 'MOUCH', tier: 'HARD' },
} as const

export type CharacterId = keyof typeof characters
