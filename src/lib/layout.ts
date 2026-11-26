// Sizes of the page's parts that are worked out, not left to the stylesheet.

/**
 * The video's height when nobody has set it: as tall as its width allows, unless that leaves the first tab less than
 * the engine's lines and four rows of moves need. Then it is lower, but not below 200 px. Worked out from the column
 * and the settings only, never from what the engine is showing at the moment, so the video does not change size while
 * the engine thinks. The numbers are the heights of the pieces in the stylesheet, in pixels.
 */
export const automaticVideoHeight = (column: { width: number; height: number }, o: { engine: boolean; lines: number; winChance: boolean }): number => {
  const natural = (column.width * 9) / 16;
  // the dropdown row, the tabs, and the gaps between the five parts of the column
  const around = 40 + 48 + 44;
  // the engine's card beside the board: its head, a row for each line, and the row that says which move is good
  const engineCard = o.engine ? 58 + o.lines * 39 + 40 : 100;
  // the opening's name and four rows of moves
  const panel = (o.winChance ? 170 : 0) + engineCard + 36 + 140;
  return Math.round(Math.max(Math.min(200, natural), Math.min(natural, column.height - around - panel)));
};
