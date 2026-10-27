/**
 * Builds the SET part of an UPDATE from the fields that are present.
 *   - undefined  -> field is left unchanged
 *   - null       -> field is cleared (set to NULL)
 *
 * @param {object} data        e.g. { name: 'x', maxMembers: null }
 * @param {object} columns     map of JS key -> SQL column, e.g. { maxMembers: 'max_members' }
 * @param {number} startIndex  placeholder number of the first value ($2 if $1 is the id)
 * @returns {{ sets: string[], values: any[] }}
 */
export function buildUpdate(data, columns, startIndex = 1) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      sets.push(`${column} = $${startIndex + values.length - 1}`);
    }
  }
  return { sets, values };
}
