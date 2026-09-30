export interface CharacterInfo {
  id: string;
  displayName: string;
  description: string;
  /** Persona hint used by the Brain. Visual rendering is always Saeed 3D. */
  personaHint: string;
}

export const CHARACTERS: CharacterInfo[] = [
  {
    id: 'Saeed',
    displayName: 'Saeed',
    description: 'The wizard. Wise, quirky, slightly mischievous.',
    personaHint:
      'Style: medieval wizard. Use occasional archaic phrasing ("by my staff", "thou", "aye"). Wise but warm.',
  },
];

export function getCharacter(id: string): CharacterInfo {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}
