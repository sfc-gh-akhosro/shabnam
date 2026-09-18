// babel-preset-solid ships no types. It is an ordinary Babel preset function,
// so say that and move on.
declare module "babel-preset-solid" {
  import type { PresetAPI, PresetObject } from "@babel/core";
  const preset: (api: PresetAPI, options: object) => PresetObject;
  export default preset;
}
