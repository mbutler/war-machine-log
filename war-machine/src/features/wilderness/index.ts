import { registerRoute } from "../../router";
import { renderWildernessPanel } from "./view";
import "./wilderness.css";

registerRoute({
  id: "wilderness",
  label: "Wilderness",
  description: "BECMI hex exploration with foraging & water management",
  section: "1. Adventure",
  order: 2,
  mount(target) {
    return renderWildernessPanel(target);
  },
});

