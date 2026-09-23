// Mount the workbench into the document body. Architecture §5.
//
// No `#root`: the workbench renders `main` beside `aside`, and body is already
// the one element that can hold them. One fewer app-owned id is one fewer name a
// DOT node can collide with (§3.1).

import { render } from "solid-js/web";
import { Workbench } from "./workbench/workbench.tsx";

render(Workbench, document.body);
