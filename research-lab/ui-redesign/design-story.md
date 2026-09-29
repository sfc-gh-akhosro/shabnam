# Shabnam, redesigned — what the code does not say

The redesign is built. Its shapes are `src/types.ts`, its decisions are
`app-architecture.md`, and its story is `user-story.md`. What is left here is
the why those files state as fact.

## Why the Diagram is alive

A diagram is not a file we pass around; it holds what you wrote and knows how
to draw itself. So there is no Engine and no store passed down: the workbench
edits the diagram's parts, and the diagram reads them when it draws.

## Why names read

A bare `Book`, `Reader` or `Layout` says nothing; `StyleBook`, `DotReader`,
`DagreLayout` say what they hold. Then a class does one job through a few
verbs: `styleBook.add(style)` is the only way in, never an `add` beside an
`absorb`. One door is also why the "lower source never overwrites higher"
guard lives in one place, and why Open needs no `reset()` — a new `Diagram`
seeds a new book from the theme.

## Why the skeleton is HTML

Tabs flip `hidden`, so nothing mounts or unmounts, a textarea keeps its caret,
and no listener is ever removed — hence no `unsub`. No `Button`, `TextEditor`
or `Toolbar` class: native HTML already is one.

## Why a tab sinks and a check glows

A tab is where you are, so it recedes; a check is something you turned on, so
it stands out. The pin is a one-label `Checks`, not a special case. A real
radio owns the chosen state, so there is no `.active`.

## Why mixins never reach CSSOM

The theme's `.row .col .paper .glass` exist only to be applied. Expanded where
used and never fed alone, the same four names can be chrome classes, and
restyling the diagram's `.row` can never move the styles tab.

## Why the style book publishes nothing

The styles list is the tab's own between re-reads (on show, after a draw, on
Open), so a refused row keeps its text. A `changed` topic had no subscriber
and would only have fought that; it went.
