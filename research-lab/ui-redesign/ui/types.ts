// The pieces, told from the chrome's chair. None of them knows DOT exists.
//
// A piece wraps a native control: the host already exists in the skeleton,
// the piece fills it and binds, and never attaches itself.

/** A typed value you subscribe to. A fact, never a verb. */
export interface Topic<T> {
  readonly value: T;
  pub(v: T): void;
  sub(fn: (v: T) => void): void;
}

export interface Piece { readonly el: HTMLElement }

/** A closed set of choices, key → label, in the order shown. */
export type Choices<K extends string> = Map<K, string>;

/** One column of a row: which field it edits, and its input's attributes. */
export type Column<R> = { field: keyof R & string; attrs: Record<string, string> };

/** A kind of row decides its columns, and the `data-` hooks a row wears. */
export type RowKind<R> = { columns: Column<R>[]; attrs(row: R): Record<string, string> };

/** What a row edit says: which row, and the row as it now reads. */
export type RowEdit<R> = { index: number; row: R };
/** What ➕ and ❌ say: the row's index. */
export type RowAt = { index: number };

export interface RowList<R> extends Piece {
  render(rows: R[]): void;
  mark(i: number, invalid: boolean): void;
}

export interface DialogAsk<A> extends Piece {
  ask(): Promise<A | undefined>; // undefined = cancelled
}
// Radios and Checks add no methods: they read and write their Topic.
