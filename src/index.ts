// Mount the workbench into #root. Architecture §5.

import { render } from "solid-js/web";
import { Workbench } from "./workbench/workbench.tsx";

const root = document.getElementById("root")!;

render(Workbench, root);
