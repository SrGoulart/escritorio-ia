/**
 * Pure rules for giving each workspace folder its own Area (one office room per
 * project). Kept free of OfficeState so the rules are testable on their own.
 */

export type AreaMappings = Record<string, string[]>;

/** Labels owned by any folder other than `exceptFolder`. */
function labelsOwnedByOthers(mappings: AreaMappings, exceptFolder?: string): Set<string> {
  const owned = new Set<string>();
  for (const [folder, labels] of Object.entries(mappings)) {
    if (folder === exceptFolder) continue;
    for (const label of labels) owned.add(label);
  }
  return owned;
}

/**
 * Does this folder still need an Area? Only when it has no mapping entry at all:
 * an empty array is the user's deliberate "no room", and is never overwritten.
 */
export function needsAreaAssignment(mappings: AreaMappings, folderName: string): boolean {
  return !Object.prototype.hasOwnProperty.call(mappings, folderName);
}

/**
 * First Area, in layout order, that has at least one seat and no owner yet.
 * Null when every Area is owned or the layout defines none.
 */
export function pickUnclaimedArea(
  areaLabelsInOrder: string[],
  labelsWithSeats: Set<string>,
  mappings: AreaMappings,
): string | null {
  const owned = labelsOwnedByOthers(mappings);
  for (const label of areaLabelsInOrder) {
    if (labelsWithSeats.has(label) && !owned.has(label)) return label;
  }
  return null;
}

/**
 * Overflow seating: drop seats that sit in an Area owned by a different folder,
 * so an agent without a room never ends up in another project's room.
 */
export function seatsOutsideForeignAreas(
  seatUids: string[],
  zoneOf: (uid: string) => string | null,
  mappings: AreaMappings,
  folderName?: string,
): string[] {
  const foreign = labelsOwnedByOthers(mappings, folderName);
  // An Area this folder shares with another folder is its own, not foreign.
  for (const label of folderName ? (mappings[folderName] ?? []) : []) foreign.delete(label);
  return seatUids.filter((uid) => {
    const zone = zoneOf(uid);
    return zone === null || !foreign.has(zone);
  });
}
