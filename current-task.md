
# Current task

## Next: the collapsible aside panel

The last feature before the second release. The right-hand `aside` should be able
to shrink away and come back.

Open design questions, from the earlier round:

- **How to bring it back once hidden.** A button needs somewhere to live when the
  panel it belongs to is gone. Candidates: a sliver on the right edge, something in
  the `nav`, or a hover zone. Mouse-movement reveal and a real button are different
  decisions — a hover trigger cannot be reached from the keyboard.
- **What "hidden" means to the layout.** `main` takes the freed width, so the canvas
  gets wider and a redraw may be wanted; or the panel overlays and the canvas does
  not move. The first is more useful and more work.
- **Whether it survives a reload.**

A plan first, then the code.

---

## Answered, no work pending

- **Downloads go to the browser's download folder.** No filesystem access from a
  page, so a real working directory needs the File System Access API
  (`showDirectoryPicker`) or a packaged app. Discussed, not adopted.
