// The export dialog (§4.1): three questions, then `Files.exportPicture`.
//
// A native `<dialog>`, opened with `showModal()`. The browser owns modal focus, the
// backdrop and Escape-to-close; a hand-built overlay reimplements all three, worse.
//
// No classes and no styling here — the elements are plain, and `#export-dialog`
// scopes whatever CSS the chrome decides to give them.

import { createSignal } from "solid-js";
import * as T from "../types.ts";

const FORMAT_TYPE = new Map<T.PictureFormat, string>([
  ["svg", "image/svg+xml"],
  ["png", "image/png"],
]);

const DIALOG = "export-dialog";

/** Open it from anywhere — which in practice means the keyboard. */
export function showExportDialog(): void {
  (document.getElementById(DIALOG) as HTMLDialogElement).showModal();
}

type Props = {
  /** Called with the chosen options; the caller downloads what comes back. */
  onExport: (options: T.PictureOptions, type: string, name: string) => void;
};

export function ExportDialog(props: Props) {
  let dialog!: HTMLDialogElement;
  const [format, setFormat] = createSignal<T.PictureFormat>("svg");
  const [transparent, setTransparent] = createSignal(true);
  const [scale, setScale] = createSignal(3);

  const submit = (event: Event) => {
    event.preventDefault();
    const chosen: T.PictureOptions = {
      format: format(),
      transparent: transparent(),
      scale: scale(),
    };
    props.onExport(chosen, FORMAT_TYPE.get(chosen.format)!, `diagram.${chosen.format}`);
    dialog.close();
  };

  return (
    <>
      <button id="export-picture" title="Cmd/Ctrl+P" onClick={() => dialog.showModal()}>
        Export Picture
      </button>

      <dialog id={DIALOG} ref={dialog}>
        <form onSubmit={submit}>
          {[...FORMAT_TYPE.keys()].map((one) => (
            <label>
              <input
                type="radio"
                name="format"
                value={one}
                checked={format() === one}
                onChange={() => setFormat(one)}
              />
              {one.toUpperCase()}
            </label>
          ))}

          <label>
            <input
              type="checkbox"
              checked={transparent()}
              onChange={(event) => setTransparent(event.currentTarget.checked)}
            />
            Transparent background
          </label>

          <label>
            {/* Disabled rather than hidden for SVG: a control you can see is
                inapplicable explains itself; one that vanishes raises a question. */}
            <input
              type="number"
              min="1"
              step="1"
              disabled={format() === "svg"}
              value={scale()}
              onInput={(event) => setScale(event.currentTarget.valueAsNumber)}
            />
            Scale
          </label>

          <button type="button" onClick={() => dialog.close()}>
            Cancel
          </button>
          <button type="submit">Export</button>
        </form>
      </dialog>
    </>
  );
}
